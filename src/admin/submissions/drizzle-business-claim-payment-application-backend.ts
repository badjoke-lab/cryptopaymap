import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  assets,
  claimAssets,
  entities,
  locations,
  networks,
  paymentMethods,
  provenanceLinks,
  sourceRecords,
  sources,
  submissionApplications,
  submissionEvents,
  submissions,
  verificationEvents,
} from '../../db/schema';
import {
  businessClaimPaymentApplicationEventPayloadSchema,
  parseBusinessClaimPaymentApplicationEventPayload,
} from '../../submissions/business-claim-payment-application-contract';
import { parseBusinessClaimPaymentPlanEventPayload } from '../../submissions/business-claim-payment-plan-contract';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import { createDrizzleSubmissionApplicationLifecycleBackend } from './drizzle-application-lifecycle-backend';
import {
  type BusinessClaimPaymentApplicationBackend,
  type BusinessClaimPaymentApplicationCommitCommand,
  type BusinessClaimPaymentApplicationCommitReceipt,
  BusinessClaimPaymentApplicationError,
  type BusinessClaimPaymentApplicationEventRecord,
  type BusinessClaimPaymentApplicationState,
  type BusinessClaimPaymentExpectedClaim,
} from './business-claim-payment-application';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

async function readEvent(
  database: CryptoPayMapDatabase,
  eventId: string,
): Promise<BusinessClaimPaymentApplicationEventRecord | null> {
  const rows = await database
    .select({
      eventId: submissionEvents.id,
      submissionId: submissionEvents.submissionId,
      fromStatus: submissionEvents.fromStatus,
      toStatus: submissionEvents.toStatus,
      action: submissionEvents.action,
      reasonCode: submissionEvents.reasonCode,
      actorId: submissionEvents.actorId,
      actorType: submissionEvents.actorType,
      internalNote: submissionEvents.internalNote,
      createdAt: submissionEvents.createdAt,
    })
    .from(submissionEvents)
    .where(eq(submissionEvents.id, eventId))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : { ...row, createdAt: row.createdAt.toISOString() };
}

function expectedRowsJson(claim: BusinessClaimPaymentExpectedClaim) {
  return JSON.stringify(claim.expectedRows);
}

function claimGuard(claim: BusinessClaimPaymentExpectedClaim) {
  const expectedRows = expectedRowsJson(claim);
  return sql`exists (
    select 1
    from ${acceptanceClaims} guarded_claim
    where guarded_claim.id = ${claim.claimId}
      and guarded_claim.entity_id = ${claim.entityId}
      and guarded_claim.location_id is not distinct from ${claim.locationId}
      and guarded_claim.claim_status = ${claim.claimStatus}
      and guarded_claim.route_type = ${claim.routeType}
      and guarded_claim.processor_id is not distinct from ${claim.processorId}
      and guarded_claim.updated_at = ${claim.expectedClaimUpdatedAt}
      and guarded_claim.deleted_at is null
      and (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'rowId', guarded_row.id::text,
              'assetId', guarded_row.asset_id::text,
              'networkId', guarded_row.network_id::text,
              'paymentMethodId', guarded_row.payment_method_id::text,
              'contractAddress', guarded_row.contract_address,
              'isPrimary', guarded_row.is_primary
            ) order by guarded_row.id
          ),
          '[]'::jsonb
        )
        from ${claimAssets} guarded_row
        where guarded_row.claim_id = guarded_claim.id
      ) = cast(${expectedRows} as jsonb)
    for update
  )`;
}

function allGuards(parts: ReturnType<typeof sql>[]) {
  return parts.length === 0 ? sql`true` : sql.join(parts, sql` and `);
}

function itemRowId(command: BusinessClaimPaymentApplicationCommitCommand, index: number): string {
  const item = command.items[index];
  if (item === undefined) throw new Error('Missing bounded payment item.');
  const rowId =
    item.operation === 'insert_claim_asset'
      ? item.plannedClaimAssetRowId
      : item.existingClaimAssetRowId;
  if (rowId === null) throw new Error('Payment plan contains an incomplete row identity.');
  return rowId;
}

function replayReceipt(
  event: BusinessClaimPaymentApplicationEventRecord,
  command: BusinessClaimPaymentApplicationCommitCommand,
): BusinessClaimPaymentApplicationCommitReceipt {
  const payload = parseBusinessClaimPaymentApplicationEventPayload(event.internalNote);
  const createdClaimIds = command.plannedClaims.map((claim) => claim.claimId).sort();
  const insertedClaimAssetRowIds = command.items
    .filter((item) => item.operation === 'insert_claim_asset')
    .map((item) => item.plannedClaimAssetRowId as string)
    .sort();
  const alreadyPresentClaimAssetRowIds = command.items
    .filter((item) => item.operation === 'already_present')
    .map((item) => item.existingClaimAssetRowId as string)
    .sort();
  const verificationReferences = command.verificationEvents
    .map((item) => ({ claimId: item.claimId, verificationEventId: item.eventId }))
    .sort((left, right) => left.claimId.localeCompare(right.claimId));
  if (
    payload === null ||
    event.eventId !== command.requestId ||
    event.submissionId !== command.submissionId ||
    event.fromStatus !== null ||
    event.toStatus !== 'resolved' ||
    event.action !== 'business_claim_payments_applied' ||
    event.reasonCode !== 'business_claim_payment_information_applied' ||
    event.actorId !== command.actorId ||
    event.actorType !== (command.actorType === 'human' ? 'reviewer' : 'system') ||
    payload.requestFingerprint !== command.requestFingerprint ||
    payload.applicationId !== command.applicationId ||
    payload.planId !== command.planId ||
    payload.sourceDecisionEventId !== command.sourceDecisionEventId ||
    payload.fieldApplicationEventId !== command.fieldApplicationEventId ||
    payload.sourceRecordId !== command.sourceRecord.id ||
    payload.draftSetHash !== command.draftSetHash ||
    payload.expectedApplicationUpdatedAt !== command.expectedApplicationUpdatedAt.toISOString() ||
    payload.expectedPlanCreatedAt !== command.planCreatedAt.toISOString() ||
    payload.appliedAt !== event.createdAt ||
    JSON.stringify(payload.createdClaimIds) !== JSON.stringify(createdClaimIds) ||
    JSON.stringify(payload.insertedClaimAssetRowIds) !== JSON.stringify(insertedClaimAssetRowIds) ||
    JSON.stringify(payload.alreadyPresentClaimAssetRowIds) !==
      JSON.stringify(alreadyPresentClaimAssetRowIds) ||
    JSON.stringify(payload.finalClaimAssetSets) !== JSON.stringify(command.finalClaimAssetSets) ||
    JSON.stringify(payload.verificationEvents) !== JSON.stringify(verificationReferences)
  ) {
    throw new BusinessClaimPaymentApplicationError(
      'idempotency_conflict',
      'The Business Claim payment application UUID was already used for different content.',
    );
  }
  return {
    state: 'replayed',
    applicationEventId: event.eventId,
    planId: payload.planId,
    sourceRecordId: payload.sourceRecordId,
    createdClaimIds: payload.createdClaimIds,
    insertedClaimAssetRowIds: payload.insertedClaimAssetRowIds,
    alreadyPresentClaimAssetRowIds: payload.alreadyPresentClaimAssetRowIds,
    verificationEventIds: payload.verificationEvents.map((item) => item.verificationEventId),
    appliedAt: event.createdAt,
  };
}

export function createDrizzleBusinessClaimPaymentApplicationBackend(
  database: CryptoPayMapDatabase,
): BusinessClaimPaymentApplicationBackend {
  const lifecycle = createDrizzleSubmissionApplicationLifecycleBackend(database);
  return {
    ...lifecycle,

    async readApplicationState(applicationId, planId, applicationEventId) {
      const application = await lifecycle.readApplication(applicationId);
      if (application === null) return null;

      const submissionRows = await database
        .select({
          submissionId: submissions.id,
          publicId: submissions.publicId,
          submissionType: submissions.submissionType,
          targetType: submissions.targetType,
          targetId: submissions.targetId,
          workflowStatus: submissions.workflowStatus,
          resolution: submissions.resolution,
        })
        .from(submissions)
        .where(eq(submissions.id, application.submissionId))
        .limit(1);
      const submission = submissionRows[0];
      if (submission === undefined) return null;

      const fieldRows = await database
        .select({ id: submissionEvents.id })
        .from(submissionEvents)
        .where(
          and(
            eq(submissionEvents.submissionId, submission.submissionId),
            eq(submissionEvents.action, 'business_claim_fields_applied'),
          ),
        )
        .orderBy(asc(submissionEvents.createdAt), asc(submissionEvents.id))
        .limit(2);
      if (fieldRows.length > 1) {
        throw new Error('Business Claim Submission contains multiple field-application events.');
      }

      const [sourceDecisionEvent, fieldApplicationEvent, planEvent, applicationEvent] =
        await Promise.all([
          readEvent(database, application.sourceDecisionEventId),
          fieldRows[0] === undefined ? Promise.resolve(null) : readEvent(database, fieldRows[0].id),
          readEvent(database, planId),
          readEvent(database, applicationEventId),
        ]);
      const planPayload = parseBusinessClaimPaymentPlanEventPayload(
        planEvent?.internalNote ?? null,
      );
      const applicationPayload = parseBusinessClaimPaymentApplicationEventPayload(
        applicationEvent?.internalNote ?? null,
      );
      const claimIds =
        planPayload === null
          ? []
          : [
              ...new Set([
                ...planPayload.plannedClaims.map((claim) => claim.claimId),
                ...planPayload.existingClaims.map((claim) => claim.claimId),
              ]),
            ];

      const claimRows =
        claimIds.length === 0
          ? []
          : await database
              .select({
                claimId: acceptanceClaims.id,
                entityId: acceptanceClaims.entityId,
                locationId: acceptanceClaims.locationId,
                claimScope: acceptanceClaims.claimScope,
                routeType: acceptanceClaims.routeType,
                acceptanceScope: acceptanceClaims.acceptanceScope,
                processorId: acceptanceClaims.processorId,
                customerPaysCrypto: acceptanceClaims.customerPaysCrypto,
                merchantExplicitlyAcceptsCrypto: acceptanceClaims.merchantExplicitlyAcceptsCrypto,
                claimStatus: acceptanceClaims.claimStatus,
                visibility: acceptanceClaims.visibility,
                howToPay: acceptanceClaims.howToPay,
                instructionsLanguage: acceptanceClaims.instructionsLanguage,
                merchantReceives: acceptanceClaims.merchantReceives,
                restrictions: acceptanceClaims.restrictions,
                createdAt: acceptanceClaims.createdAt,
                updatedAt: acceptanceClaims.updatedAt,
                deletedAt: acceptanceClaims.deletedAt,
              })
              .from(acceptanceClaims)
              .where(inArray(acceptanceClaims.id, claimIds))
              .orderBy(asc(acceptanceClaims.id))
              .limit(21);
      const rowRows =
        claimIds.length === 0
          ? []
          : await database
              .select({
                rowId: claimAssets.id,
                claimId: claimAssets.claimId,
                assetId: claimAssets.assetId,
                networkId: claimAssets.networkId,
                paymentMethodId: claimAssets.paymentMethodId,
                contractAddress: claimAssets.contractAddress,
                isPrimary: claimAssets.isPrimary,
                notes: claimAssets.notes,
                createdAt: claimAssets.createdAt,
                updatedAt: claimAssets.updatedAt,
              })
              .from(claimAssets)
              .where(inArray(claimAssets.claimId, claimIds))
              .orderBy(asc(claimAssets.id))
              .limit(101);
      if (claimRows.length > 20 || rowRows.length > 100) {
        throw new Error('Business Claim payment application exceeds its bounded canonical state.');
      }

      let target: BusinessClaimPaymentApplicationState['target'] = null;
      if (submission.targetType === 'entity' && submission.targetId !== null) {
        const rows = await database
          .select({
            entityId: entities.id,
            entityType: entities.entityType,
            entityUpdatedAt: entities.updatedAt,
            entityDeletedAt: entities.deletedAt,
          })
          .from(entities)
          .where(eq(entities.id, submission.targetId))
          .limit(1);
        const row = rows[0];
        if (row !== undefined && row.entityDeletedAt === null) {
          target = {
            targetType: 'entity',
            targetId: row.entityId,
            entityId: row.entityId,
            entityType: row.entityType,
            entityUpdatedAt: row.entityUpdatedAt.toISOString(),
            locationId: null,
            locationUpdatedAt: null,
          };
        }
      } else if (submission.targetType === 'location' && submission.targetId !== null) {
        const rows = await database
          .select({
            locationId: locations.id,
            locationUpdatedAt: locations.updatedAt,
            locationDeletedAt: locations.deletedAt,
            entityId: entities.id,
            entityType: entities.entityType,
            entityUpdatedAt: entities.updatedAt,
            entityDeletedAt: entities.deletedAt,
          })
          .from(locations)
          .innerJoin(entities, eq(entities.id, locations.entityId))
          .where(eq(locations.id, submission.targetId))
          .limit(1);
        const row = rows[0];
        if (row !== undefined && row.locationDeletedAt === null && row.entityDeletedAt === null) {
          target = {
            targetType: 'location',
            targetId: row.locationId,
            entityId: row.entityId,
            entityType: row.entityType,
            entityUpdatedAt: row.entityUpdatedAt.toISOString(),
            locationId: row.locationId,
            locationUpdatedAt: row.locationUpdatedAt.toISOString(),
          };
        }
      }

      const sourceRecordRows =
        applicationPayload === null
          ? []
          : await database
              .select({
                id: sourceRecords.id,
                sourceId: sourceRecords.sourceId,
                externalId: sourceRecords.externalId,
                contentHash: sourceRecords.contentHash,
              })
              .from(sourceRecords)
              .where(eq(sourceRecords.id, applicationPayload.sourceRecordId))
              .limit(1);
      const verificationIds =
        applicationPayload?.verificationEvents.map((item) => item.verificationEventId) ?? [];
      const verificationRows =
        verificationIds.length === 0
          ? []
          : await database
              .select({
                eventId: verificationEvents.id,
                claimId: verificationEvents.claimId,
                eventType: verificationEvents.eventType,
                reasonCode: verificationEvents.reasonCode,
                effectiveAt: verificationEvents.effectiveAt,
                internalNote: verificationEvents.internalNote,
              })
              .from(verificationEvents)
              .where(inArray(verificationEvents.id, verificationIds))
              .orderBy(asc(verificationEvents.id));
      const provenanceRows =
        applicationPayload === null
          ? []
          : await database
              .select({
                subjectType: provenanceLinks.subjectType,
                subjectId: provenanceLinks.subjectId,
                fieldPath: provenanceLinks.fieldPath,
                sourceRecordId: provenanceLinks.sourceRecordId,
                provenanceRole: provenanceLinks.provenanceRole,
              })
              .from(provenanceLinks)
              .where(eq(provenanceLinks.sourceRecordId, applicationPayload.sourceRecordId))
              .orderBy(asc(provenanceLinks.subjectType), asc(provenanceLinks.subjectId));

      return {
        application,
        submission: {
          submissionId: submission.submissionId,
          publicId: submission.publicId,
          submissionType: submission.submissionType,
          targetType: submission.targetType,
          targetId: submission.targetId,
          workflowStatus: submission.workflowStatus,
          resolution: submission.resolution,
        },
        sourceDecisionEvent,
        fieldApplicationEvent,
        planEvent,
        applicationEvent,
        target,
        claims: claimRows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          deletedAt: row.deletedAt?.toISOString() ?? null,
        })),
        rows: rowRows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        })),
        sourceRecord: sourceRecordRows[0] ?? null,
        verificationEvents: verificationRows.map((row) => ({
          ...row,
          effectiveAt: row.effectiveAt.toISOString(),
        })),
        provenanceLinks: provenanceRows,
      } satisfies BusinessClaimPaymentApplicationState;
    },

    async commitPaymentApplication(command) {
      const existing = await readEvent(database, command.requestId);
      if (existing !== null) return replayReceipt(existing, command);

      const createdClaimIds = command.plannedClaims.map((claim) => claim.claimId).sort();
      const insertedItems = command.items.filter((item) => item.operation === 'insert_claim_asset');
      const preservedItems = command.items.filter((item) => item.operation === 'already_present');
      const insertedClaimAssetRowIds = insertedItems
        .map((item) => item.plannedClaimAssetRowId as string)
        .sort();
      const alreadyPresentClaimAssetRowIds = preservedItems
        .map((item) => item.existingClaimAssetRowId as string)
        .sort();
      const verificationReferences = command.verificationEvents
        .map((item) => ({ claimId: item.claimId, verificationEventId: item.eventId }))
        .sort((left, right) => left.claimId.localeCompare(right.claimId));
      const eventPayload = businessClaimPaymentApplicationEventPayloadSchema.parse({
        schemaVersion: 'business-claim-payment-application-event-v1',
        requestFingerprint: command.requestFingerprint,
        applicationId: command.applicationId,
        planId: command.planId,
        sourceDecisionEventId: command.sourceDecisionEventId,
        fieldApplicationEventId: command.fieldApplicationEventId,
        sourceRecordId: command.sourceRecord.id,
        target: {
          targetType: command.target.targetType,
          targetId: command.target.targetId,
          entityId: command.target.entityId,
          locationId: command.target.locationId,
        },
        draftSetHash: command.draftSetHash,
        createdClaimIds,
        insertedClaimAssetRowIds,
        alreadyPresentClaimAssetRowIds,
        finalClaimAssetSets: command.finalClaimAssetSets,
        verificationEvents: verificationReferences,
        expectedApplicationUpdatedAt: command.expectedApplicationUpdatedAt.toISOString(),
        expectedPlanCreatedAt: command.planCreatedAt.toISOString(),
        appliedAt: command.appliedAt.toISOString(),
      });

      const existingClaimGuards = command.expectedExistingClaims.map(claimGuard);
      const assetIds = [...new Set(command.items.map((item) => item.asset.id))];
      const networkIds = [...new Set(command.items.map((item) => item.network.id))];
      const paymentMethodIds = [...new Set(command.items.map((item) => item.paymentMethod.id))];
      const processorIds = [
        ...new Set(
          command.items.flatMap((item) => (item.processor === null ? [] : [item.processor.id])),
        ),
      ];
      const registryGuards: ReturnType<typeof sql>[] = [
        ...assetIds.map(
          (id) =>
            sql`exists (select 1 from ${assets} where ${assets.id} = ${id} and ${assets.status} = 'active')`,
        ),
        ...networkIds.map(
          (id) =>
            sql`exists (select 1 from ${networks} where ${networks.id} = ${id} and ${networks.status} = 'active')`,
        ),
        ...paymentMethodIds.map(
          (id) =>
            sql`exists (select 1 from ${paymentMethods} where ${paymentMethods.id} = ${id} and ${paymentMethods.status} = 'active')`,
        ),
        ...processorIds.map(
          (id) => sql`exists (
            select 1 from ${entities}
            where ${entities.id} = ${id}
              and ${entities.entityType} = 'payment_processor'
              and ${entities.entityStatus} = 'active'
              and ${entities.deletedAt} is null
          )`,
        ),
      ];
      const plannedAbsentGuards = createdClaimIds.map(
        (id) =>
          sql`not exists (select 1 from ${acceptanceClaims} where ${acceptanceClaims.id} = ${id})`,
      );
      const insertedAbsentGuards = insertedClaimAssetRowIds.map(
        (id) => sql`not exists (select 1 from ${claimAssets} where ${claimAssets.id} = ${id})`,
      );
      const preservedGuards = preservedItems.map(
        (item) => sql`exists (
          select 1 from ${claimAssets}
          where ${claimAssets.id} = ${item.existingClaimAssetRowId as string}
            and ${claimAssets.claimId} = ${item.targetClaimId}
            and ${claimAssets.assetId} = ${item.asset.id}
            and ${claimAssets.networkId} = ${item.network.id}
            and ${claimAssets.paymentMethodId} = ${item.paymentMethod.id}
            and ${claimAssets.contractAddress} is not distinct from ${item.proposal.contractAddress}
            and ${claimAssets.isPrimary} = ${item.isPrimary}
        )`,
      );
      const targetGuard =
        command.target.targetType === 'entity'
          ? sql`exists (
              select 1 from ${entities} target_entity
              where target_entity.id = ${command.target.entityId}
                and target_entity.entity_type = ${command.target.entityType}
                and target_entity.updated_at = ${new Date(command.target.entityUpdatedAt)}
                and target_entity.deleted_at is null
            )`
          : sql`exists (
              select 1
              from ${locations} target_location
              inner join ${entities} target_entity on target_entity.id = target_location.entity_id
              where target_location.id = ${command.target.locationId as string}
                and target_location.updated_at = ${new Date(command.target.locationUpdatedAt as string)}
                and target_location.deleted_at is null
                and target_entity.id = ${command.target.entityId}
                and target_entity.entity_type = ${command.target.entityType}
                and target_entity.updated_at = ${new Date(command.target.entityUpdatedAt)}
                and target_entity.deleted_at is null
            )`;

      const statements: unknown[] = [
        database.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${command.applicationId}, 0))`,
        ),
        database.select({
          guard: sql<number>`1 / case when exists (
            select 1 from ${sources}
            where ${sources.id} = ${command.sourceRecord.sourceId}
              and ${sources.sourceType} = 'business_representative'
              and ${sources.isActive} = true
          ) then 1 else 0 end`,
        }),
        database.select({
          guard: sql<number>`1 / case when exists (
            select 1
            from ${submissionApplications} application
            inner join ${submissions} submission on submission.id = application.submission_id
            where application.id = ${command.applicationId}
              and application.submission_id = ${command.submissionId}
              and application.source_decision_event_id = ${command.sourceDecisionEventId}
              and application.application_status = 'pending'
              and application.publication_status = 'blocked'
              and application.application_receipt_kind is null
              and application.updated_at = ${command.expectedApplicationUpdatedAt}
              and submission.submission_type = 'claim'
              and submission.workflow_status = 'resolved'
              and submission.resolution = 'approved'
              and submission.target_type = ${command.target.targetType}
              and submission.target_id = ${command.target.targetId}
          ) then 1 else 0 end`,
        }),
        database.select({
          guard: sql<number>`1 / case when exists (
            select 1 from ${submissionEvents} decision
            where decision.id = ${command.sourceDecisionEventId}
              and decision.submission_id = ${command.submissionId}
              and decision.action = 'business_claim_relationship_approved'
              and decision.to_status = 'resolved'
          ) then 1 else 0 end`,
        }),
        database.select({
          guard: sql<number>`1 / case when exists (
            select 1 from ${submissionEvents} field_event
            where field_event.id = ${command.fieldApplicationEventId}
              and field_event.submission_id = ${command.submissionId}
              and field_event.action = 'business_claim_fields_applied'
          ) then 1 else 0 end`,
        }),
        database.select({
          guard: sql<number>`1 / case when exists (
            select 1 from ${submissionEvents} plan
            where plan.id = ${command.planId}
              and plan.submission_id = ${command.submissionId}
              and plan.from_status is null
              and plan.to_status = 'resolved'
              and plan.action = 'business_claim_payment_plan_prepared'
              and plan.reason_code = 'payment_information'
              and plan.created_at = ${command.planCreatedAt}
              and plan.internal_note = ${command.planInternalNote}
          ) then 1 else 0 end`,
        }),
        database.select({
          guard: sql<number>`1 / case when ${targetGuard}
            and ${allGuards(existingClaimGuards)}
            and ${allGuards(registryGuards)}
            and ${allGuards(plannedAbsentGuards)}
            and ${allGuards(insertedAbsentGuards)}
            and ${allGuards(preservedGuards)}
            and not exists (
              select 1 from ${submissionEvents}
              where ${submissionEvents.id} = ${command.requestId}
            )
            and not exists (
              select 1 from ${submissionEvents} prior_application
              where prior_application.submission_id = ${command.submissionId}
                and prior_application.action = 'business_claim_payments_applied'
            )
            then 1 else 0 end`,
        }),
        database.insert(sourceRecords).values({
          id: command.sourceRecord.id,
          sourceId: command.sourceRecord.sourceId,
          externalId: command.sourceRecord.externalId,
          sourceUrl: null,
          rawPayload: command.sourceRecord.rawPayload,
          observedAt: command.sourceRecord.observedAt,
          publishedAt: null,
          fetchedAt: command.sourceRecord.fetchedAt,
          contentHash: command.sourceRecord.contentHash,
          archiveUrl: null,
          licenseId: null,
        }),
      ];

      if (command.plannedClaims.length > 0) {
        statements.push(
          database.insert(acceptanceClaims).values(
            command.plannedClaims.map((claim) => ({
              id: claim.claimId,
              entityId: claim.entityId,
              locationId: claim.locationId,
              claimScope: claim.claimScope,
              routeType: claim.routeType,
              acceptanceScope: 'all_checkout' as const,
              claimStatus: claim.claimStatus,
              visibility: claim.visibility,
              customerPaysCrypto: claim.customerPaysCrypto,
              merchantExplicitlyAcceptsCrypto: claim.merchantExplicitlyAcceptsCrypto,
              processorId: claim.processorId,
              howToPay: claim.howToPay,
              instructionsLanguage: 'en',
              merchantReceives: 'not_publicly_confirmed' as const,
              restrictions: claim.restrictions,
              firstConfirmedAt: null,
              lastConfirmedAt: null,
              nextReviewAt: null,
              endedAt: null,
              endedReason: null,
              createdAt: command.appliedAt,
              updatedAt: command.appliedAt,
              deletedAt: null,
            })),
          ),
        );
      }
      if (insertedItems.length > 0) {
        statements.push(
          database.insert(claimAssets).values(
            insertedItems.map((item) => ({
              id: item.plannedClaimAssetRowId as string,
              claimId: item.targetClaimId,
              assetId: item.asset.id,
              networkId: item.network.id,
              paymentMethodId: item.paymentMethod.id,
              contractAddress: item.proposal.contractAddress,
              isPrimary: item.isPrimary,
              notes: null,
              createdAt: command.appliedAt,
              updatedAt: command.appliedAt,
            })),
          ),
        );
      }
      if (command.expectedExistingClaims.length > 0) {
        statements.push(
          database
            .update(acceptanceClaims)
            .set({ updatedAt: command.appliedAt })
            .where(
              inArray(
                acceptanceClaims.id,
                command.expectedExistingClaims.map((claim) => claim.claimId),
              ),
            ),
        );
      }

      const createdClaimSet = new Set(createdClaimIds);
      const provenanceValues = [
        ...command.verificationEvents.map((verification) => ({
          subjectType: 'acceptance_claim' as const,
          subjectId: verification.claimId,
          fieldPath: null,
          sourceRecordId: command.sourceRecord.id,
          licenseId: null,
          provenanceRole: createdClaimSet.has(verification.claimId)
            ? ('origin' as const)
            : ('verification' as const),
          effectiveFrom: command.appliedAt,
          effectiveTo: null,
        })),
        ...command.items.map((item, index) => ({
          subjectType: 'claim_asset' as const,
          subjectId: itemRowId(command, index),
          fieldPath: null,
          sourceRecordId: command.sourceRecord.id,
          licenseId: null,
          provenanceRole:
            item.operation === 'insert_claim_asset'
              ? ('origin' as const)
              : ('verification' as const),
          effectiveFrom: command.appliedAt,
          effectiveTo: null,
        })),
        ...command.verificationEvents.map((verification) => ({
          subjectType: 'verification_event' as const,
          subjectId: verification.eventId,
          fieldPath: null,
          sourceRecordId: command.sourceRecord.id,
          licenseId: null,
          provenanceRole: 'verification' as const,
          effectiveFrom: command.appliedAt,
          effectiveTo: null,
        })),
      ];
      statements.push(
        database.insert(verificationEvents).values(
          command.verificationEvents.map((verification) => ({
            id: verification.eventId,
            claimId: verification.claimId,
            eventType: 'corrected' as const,
            fromStatus: null,
            toStatus: null,
            fromVisibility: null,
            toVisibility: null,
            reasonCode: 'business_claim_payment_information_applied',
            effectiveAt: command.appliedAt,
            publicSummary: null,
            internalNote: verification.internalNote,
            actorType: 'system' as const,
            actorId: null,
          })),
        ),
        database.insert(provenanceLinks).values(provenanceValues),
        database.insert(submissionEvents).values({
          id: command.requestId,
          submissionId: command.submissionId,
          fromStatus: null,
          toStatus: 'resolved',
          action: 'business_claim_payments_applied',
          reasonCode: 'business_claim_payment_information_applied',
          actorId: command.actorId,
          actorType: command.actorType === 'human' ? 'reviewer' : 'system',
          internalNote: JSON.stringify(eventPayload),
          createdAt: command.appliedAt,
        }),
      );

      for (const claim of command.plannedClaims) {
        statements.push(
          database.select({
            guard: sql<number>`1 / case when exists (
              select 1 from ${acceptanceClaims}
              where ${acceptanceClaims.id} = ${claim.claimId}
                and ${acceptanceClaims.entityId} = ${claim.entityId}
                and ${acceptanceClaims.locationId} is not distinct from ${claim.locationId}
                and ${acceptanceClaims.claimScope} = ${claim.claimScope}
                and ${acceptanceClaims.routeType} = ${claim.routeType}
                and ${acceptanceClaims.acceptanceScope} = 'all_checkout'
                and ${acceptanceClaims.processorId} is not distinct from ${claim.processorId}
                and ${acceptanceClaims.customerPaysCrypto} = true
                and ${acceptanceClaims.merchantExplicitlyAcceptsCrypto} = true
                and ${acceptanceClaims.claimStatus} = 'candidate'
                and ${acceptanceClaims.visibility} = 'hidden'
                and ${acceptanceClaims.howToPay} is not distinct from ${claim.howToPay}
                and ${acceptanceClaims.instructionsLanguage} = 'en'
                and ${acceptanceClaims.merchantReceives} = 'not_publicly_confirmed'
                and ${acceptanceClaims.restrictions} is not distinct from ${claim.restrictions}
                and ${acceptanceClaims.createdAt} = ${command.appliedAt}
                and ${acceptanceClaims.updatedAt} = ${command.appliedAt}
                and ${acceptanceClaims.deletedAt} is null
            ) then 1 else 0 end`,
          }),
        );
      }
      for (const item of command.items) {
        const rowId =
          item.operation === 'insert_claim_asset'
            ? (item.plannedClaimAssetRowId as string)
            : (item.existingClaimAssetRowId as string);
        const insertedRowGuard =
          item.operation === 'insert_claim_asset'
            ? sql`and ${claimAssets.notes} is null
                and ${claimAssets.createdAt} = ${command.appliedAt}
                and ${claimAssets.updatedAt} = ${command.appliedAt}`
            : sql``;
        statements.push(
          database.select({
            guard: sql<number>`1 / case when exists (
              select 1 from ${claimAssets}
              where ${claimAssets.id} = ${rowId}
                and ${claimAssets.claimId} = ${item.targetClaimId}
                and ${claimAssets.assetId} = ${item.asset.id}
                and ${claimAssets.networkId} = ${item.network.id}
                and ${claimAssets.paymentMethodId} = ${item.paymentMethod.id}
                and ${claimAssets.contractAddress} is not distinct from ${item.proposal.contractAddress}
                and ${claimAssets.isPrimary} = ${item.isPrimary}
                ${insertedRowGuard}
            ) then 1 else 0 end`,
          }),
        );
      }
      for (const finalSet of command.finalClaimAssetSets) {
        const expectedRowIds = JSON.stringify(finalSet.rowIds);
        statements.push(
          database.select({
            guard: sql<number>`1 / case when (
              select coalesce(
                jsonb_agg(final_row.id::text order by final_row.id),
                '[]'::jsonb
              )
              from ${claimAssets} final_row
              where final_row.claim_id = ${finalSet.claimId}
            ) = cast(${expectedRowIds} as jsonb) then 1 else 0 end`,
          }),
        );
      }
      statements.push(
        database.select({
          guard: sql<number>`1 / case when exists (
            select 1 from ${sourceRecords}
            where ${sourceRecords.id} = ${command.sourceRecord.id}
              and ${sourceRecords.sourceId} = ${command.sourceRecord.sourceId}
              and ${sourceRecords.externalId} = ${command.sourceRecord.externalId}
              and ${sourceRecords.contentHash} = ${command.sourceRecord.contentHash}
          ) and ${allGuards(
            command.verificationEvents.map(
              (item) => sql`exists (
                select 1 from ${verificationEvents}
                where ${verificationEvents.id} = ${item.eventId}
                  and ${verificationEvents.claimId} = ${item.claimId}
                  and ${verificationEvents.eventType} = 'corrected'
                  and ${verificationEvents.reasonCode} = 'business_claim_payment_information_applied'
                  and ${verificationEvents.effectiveAt} = ${command.appliedAt}
                  and ${verificationEvents.internalNote} = ${item.internalNote}
              )`,
            ),
          )}
          and (
            select count(*) from ${provenanceLinks}
            where ${provenanceLinks.sourceRecordId} = ${command.sourceRecord.id}
          ) = ${provenanceValues.length}
          then 1 else 0 end`,
        }),
      );

      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code === '23505') {
          const raced = await readEvent(database, command.requestId);
          if (raced !== null) return replayReceipt(raced, command);
        }
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new SubmissionPersistenceError(
            'conflict',
            'The Business Claim payment application conflicted with current canonical state.',
            { cause: error },
          );
        }
        throw error;
      }

      return {
        state: 'committed',
        applicationEventId: command.requestId,
        planId: command.planId,
        sourceRecordId: command.sourceRecord.id,
        createdClaimIds,
        insertedClaimAssetRowIds,
        alreadyPresentClaimAssetRowIds,
        verificationEventIds: verificationReferences.map((item) => item.verificationEventId),
        appliedAt: command.appliedAt.toISOString(),
      } satisfies BusinessClaimPaymentApplicationCommitReceipt;
    },
  };
}
