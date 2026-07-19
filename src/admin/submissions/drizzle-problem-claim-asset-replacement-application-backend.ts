import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  assets,
  claimAssets,
  networks,
  paymentMethods,
  provenanceLinks,
  sourceRecords,
  sources,
  submissionApplications,
  submissionEvents,
  submissionPayloads,
  submissions,
  verificationEvents,
} from '../../db/schema';
import {
  parseProblemClaimAssetReplacementApplicationEventPayload,
  problemClaimAssetReplacementApplicationEventPayloadSchema,
} from '../../submissions/problem-claim-asset-replacement-application-contract';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import { createDrizzleSubmissionApplicationLifecycleBackend } from './drizzle-application-lifecycle-backend';
import {
  type ProblemClaimAssetReplacementApplicationBackend,
  ProblemClaimAssetReplacementApplicationError,
  type ProblemClaimAssetReplacementApplicationEventRecord,
  type ProblemClaimAssetReplacementApplicationState,
  type ProblemClaimAssetReplacementCommitCommand,
  type ProblemClaimAssetReplacementCommitReceipt,
} from './problem-claim-asset-replacement-application';

const paymentMethodSlugs = [
  'onchain',
  'lightning_invoice',
  'lightning_nfc',
  'wallet_qr',
  'processor_checkout',
  'pos_terminal',
  'invoice',
  'payment_link',
] as const;

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

async function readEvent(
  database: CryptoPayMapDatabase,
  eventId: string,
): Promise<ProblemClaimAssetReplacementApplicationEventRecord | null> {
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

function replayReceipt(
  event: ProblemClaimAssetReplacementApplicationEventRecord,
  command: ProblemClaimAssetReplacementCommitCommand,
): ProblemClaimAssetReplacementCommitReceipt {
  const payload = parseProblemClaimAssetReplacementApplicationEventPayload(event.internalNote);
  if (
    event.submissionId !== command.submissionId ||
    event.fromStatus !== null ||
    event.toStatus !== 'resolved' ||
    event.action !== 'problem_claim_assets_replaced' ||
    event.reasonCode !== `problem_report_${command.correctionKind}_correction` ||
    event.actorId !== command.actorId ||
    payload === null ||
    payload.requestFingerprint !== command.requestFingerprint ||
    payload.applicationId !== command.applicationId ||
    payload.planId !== command.planId ||
    payload.sourceDecisionEventId !== command.sourceDecisionEventId ||
    payload.claimId !== command.claimId ||
    payload.sourceRecordId !== command.sourceRecord.id ||
    payload.verificationEventId !== command.verificationEventId ||
    payload.expectedApplicationUpdatedAt !== command.expectedApplicationUpdatedAt.toISOString() ||
    payload.expectedPlanCreatedAt !== command.planCreatedAt.toISOString() ||
    payload.expectedClaimUpdatedAt !== command.expectedClaimUpdatedAt.toISOString() ||
    payload.currentSetHash !== command.currentSetHash ||
    payload.proposedSetHash !== command.proposedSetHash ||
    payload.selectedCurrentRowId !== command.selectedCurrentRowId ||
    payload.replacementRowId !== command.replacementRowId ||
    payload.correctionKind !== command.correctionKind
  ) {
    throw new ProblemClaimAssetReplacementApplicationError(
      'idempotency_conflict',
      'The Claim Asset replacement UUID was already used for different content.',
    );
  }
  return {
    state: 'replayed',
    correctionEventId: event.eventId,
    planId: payload.planId,
    claimId: payload.claimId,
    sourceRecordId: payload.sourceRecordId,
    verificationEventId: payload.verificationEventId,
    currentSetHash: payload.currentSetHash,
    proposedSetHash: payload.proposedSetHash,
    appliedAt: event.createdAt,
  };
}

export function createDrizzleProblemClaimAssetReplacementApplicationBackend(
  database: CryptoPayMapDatabase,
): ProblemClaimAssetReplacementApplicationBackend {
  const lifecycle = createDrizzleSubmissionApplicationLifecycleBackend(database);
  return {
    ...lifecycle,

    async readApplicationState(applicationId, planId, correctionEventId) {
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
          normalizedPayload: submissionPayloads.normalizedPayload,
          eventId: submissionEvents.id,
          eventSubmissionId: submissionEvents.submissionId,
          eventToStatus: submissionEvents.toStatus,
          eventAction: submissionEvents.action,
          eventInternalNote: submissionEvents.internalNote,
          eventCreatedAt: submissionEvents.createdAt,
        })
        .from(submissions)
        .innerJoin(submissionPayloads, eq(submissionPayloads.submissionId, submissions.id))
        .leftJoin(
          submissionEvents,
          and(
            eq(submissionEvents.id, application.sourceDecisionEventId),
            eq(submissionEvents.submissionId, submissions.id),
          ),
        )
        .where(eq(submissions.id, application.submissionId))
        .limit(1);
      const submission = submissionRows[0];
      if (submission === undefined) return null;

      const claimRows =
        submission.targetId === null
          ? []
          : await database
              .select({
                claimId: acceptanceClaims.id,
                claimStatus: acceptanceClaims.claimStatus,
                routeType: acceptanceClaims.routeType,
                updatedAt: acceptanceClaims.updatedAt,
                deletedAt: acceptanceClaims.deletedAt,
              })
              .from(acceptanceClaims)
              .where(eq(acceptanceClaims.id, submission.targetId))
              .limit(1);
      const claim = claimRows[0];
      const rows =
        claim === undefined
          ? []
          : await database
              .select({
                rowId: claimAssets.id,
                claimId: claimAssets.claimId,
                contractAddress: claimAssets.contractAddress,
                isPrimary: claimAssets.isPrimary,
                notes: claimAssets.notes,
                assetId: assets.id,
                assetSlug: assets.slug,
                assetSymbol: assets.symbol,
                assetStatus: assets.status,
                networkId: networks.id,
                networkSlug: networks.slug,
                networkStatus: networks.status,
                paymentMethodId: paymentMethods.id,
                paymentMethodSlug: paymentMethods.slug,
                paymentMethodStatus: paymentMethods.status,
              })
              .from(claimAssets)
              .innerJoin(assets, eq(assets.id, claimAssets.assetId))
              .innerJoin(networks, eq(networks.id, claimAssets.networkId))
              .innerJoin(paymentMethods, eq(paymentMethods.id, claimAssets.paymentMethodId))
              .where(eq(claimAssets.claimId, claim.claimId))
              .orderBy(asc(claimAssets.id))
              .limit(51);
      if (rows.length > 50) {
        throw new Error('Claim Asset replacement application exceeds the bounded complete set.');
      }
      const [planEvent, correctionEvent] = await Promise.all([
        readEvent(database, planId),
        readEvent(database, correctionEventId),
      ]);

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
          normalizedPayload: submission.normalizedPayload,
        },
        sourceDecisionEvent:
          submission.eventId === null ||
          submission.eventSubmissionId === null ||
          submission.eventToStatus === null ||
          submission.eventAction === null ||
          submission.eventCreatedAt === null
            ? null
            : {
                eventId: submission.eventId,
                submissionId: submission.eventSubmissionId,
                toStatus: submission.eventToStatus,
                action: submission.eventAction,
                internalNote: submission.eventInternalNote,
                createdAt: submission.eventCreatedAt.toISOString(),
              },
        planEvent,
        correctionEvent,
        claim:
          claim === undefined
            ? null
            : {
                claimId: claim.claimId,
                claimStatus: claim.claimStatus,
                routeType: claim.routeType,
                updatedAt: claim.updatedAt.toISOString(),
                deletedAt: claim.deletedAt?.toISOString() ?? null,
              },
        rows: rows.map((row) => ({
          rowId: row.rowId,
          claimId: row.claimId,
          asset: {
            id: row.assetId,
            slug: row.assetSlug,
            symbol: row.assetSymbol,
            status: row.assetStatus,
          },
          network: {
            id: row.networkId,
            slug: row.networkSlug,
            status: row.networkStatus,
          },
          paymentMethod: {
            id: row.paymentMethodId,
            slug: row.paymentMethodSlug as (typeof paymentMethodSlugs)[number],
            status: row.paymentMethodStatus,
          },
          contractAddress: row.contractAddress,
          isPrimary: row.isPrimary,
          notes: row.notes,
        })),
      } satisfies ProblemClaimAssetReplacementApplicationState;
    },

    async commitClaimAssetReplacement(command) {
      const existing = await readEvent(database, command.requestId);
      if (existing !== null) return replayReceipt(existing, command);

      const selected = command.expectedCurrentSet.find(
        (row) => row.rowId === command.selectedCurrentRowId,
      );
      const replacement = command.proposedSet.find((row) => row.rowId === command.replacementRowId);
      if (selected === undefined || replacement === undefined) {
        throw new ProblemClaimAssetReplacementApplicationError(
          'ineligible',
          'The durable plan does not contain the selected and replacement rows.',
        );
      }

      const eventPayload = problemClaimAssetReplacementApplicationEventPayloadSchema.parse({
        schemaVersion: 'problem-claim-asset-replacement-application-event-v1',
        requestFingerprint: command.requestFingerprint,
        applicationId: command.applicationId,
        planId: command.planId,
        sourceDecisionEventId: command.sourceDecisionEventId,
        claimId: command.claimId,
        sourceRecordId: command.sourceRecord.id,
        verificationEventId: command.verificationEventId,
        expectedApplicationUpdatedAt: command.expectedApplicationUpdatedAt.toISOString(),
        expectedPlanCreatedAt: command.planCreatedAt.toISOString(),
        expectedClaimUpdatedAt: command.expectedClaimUpdatedAt.toISOString(),
        currentSetHash: command.currentSetHash,
        proposedSetHash: command.proposedSetHash,
        selectedCurrentRowId: command.selectedCurrentRowId,
        replacementRowId: command.replacementRowId,
        correctionKind: command.correctionKind,
      });
      const expectedSet = JSON.stringify(command.expectedCurrentSet);
      const proposedSet = JSON.stringify(command.proposedSet);
      const statements: unknown[] = [
        database.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${command.claimId}, 0))`,
        ),
        database.select({
          guard: sql<number>`1 / case when exists (
            select 1 from ${sources}
            where ${sources.id} = ${command.sourceRecord.sourceId}
              and ${sources.sourceType} = 'user_submission'
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
              and submission.submission_type = 'problem_report'
              and submission.workflow_status = 'resolved'
              and submission.resolution = 'approved'
              and submission.target_type = 'claim'
              and submission.target_id = ${command.claimId}
          ) then 1 else 0 end`,
        }),
        database.select({
          guard: sql<number>`1 / case when exists (
            select 1 from ${submissionEvents} decision
            where decision.id = ${command.sourceDecisionEventId}
              and decision.submission_id = ${command.submissionId}
              and decision.action = 'problem_correction_handoff_approved'
              and decision.to_status = 'resolved'
          ) then 1 else 0 end`,
        }),
        database.select({
          guard: sql<number>`1 / case when exists (
            select 1 from ${submissionEvents} plan
            where plan.id = ${command.planId}
              and plan.submission_id = ${command.submissionId}
              and plan.from_status is null
              and plan.to_status = 'resolved'
              and plan.action = 'problem_claim_asset_replacement_planned'
              and plan.reason_code = ${command.correctionKind}
              and plan.created_at = ${command.planCreatedAt}
              and plan.internal_note = ${command.planInternalNote}
          ) then 1 else 0 end`,
        }),
        database.select({
          guard: sql<number>`1 / case when exists (
            select 1 from ${acceptanceClaims}
            where ${acceptanceClaims.id} = ${command.claimId}
              and ${acceptanceClaims.claimStatus} in ('confirmed', 'stale')
              and ${acceptanceClaims.updatedAt} = ${command.expectedClaimUpdatedAt}
              and ${acceptanceClaims.deletedAt} is null
            for update
          ) then 1 else 0 end`,
        }),
        database.select({
          guard: sql<number>`1 / case when (
            select coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'rowId', current_row.id::text,
                  'claimId', current_row.claim_id::text,
                  'asset', jsonb_build_object(
                    'id', current_asset.id::text,
                    'slug', current_asset.slug,
                    'symbol', current_asset.symbol,
                    'status', current_asset.status
                  ),
                  'network', jsonb_build_object(
                    'id', current_network.id::text,
                    'slug', current_network.slug,
                    'status', current_network.status
                  ),
                  'paymentMethod', jsonb_build_object(
                    'id', current_method.id::text,
                    'slug', current_method.slug,
                    'status', current_method.status
                  ),
                  'contractAddress', current_row.contract_address,
                  'isPrimary', current_row.is_primary,
                  'notes', current_row.notes
                ) order by current_row.id
              ),
              '[]'::jsonb
            )
            from ${claimAssets} current_row
            inner join ${assets} current_asset on current_asset.id = current_row.asset_id
            inner join ${networks} current_network on current_network.id = current_row.network_id
            inner join ${paymentMethods} current_method
              on current_method.id = current_row.payment_method_id
            where current_row.claim_id = ${command.claimId}
          ) = cast(${expectedSet} as jsonb) then 1 else 0 end`,
        }),
        database.select({
          guard: sql<number>`1 / case when not exists (
            select 1 from ${submissionEvents}
            where ${submissionEvents.id} = ${command.requestId}
          ) then 1 else 0 end`,
        }),
      ];

      for (const row of command.proposedSet) {
        statements.push(
          database.select({
            guard: sql<number>`1 / case when
              exists (select 1 from ${assets} where ${assets.id} = ${row.asset.id} and ${assets.status} = 'active')
              and exists (select 1 from ${networks} where ${networks.id} = ${row.network.id} and ${networks.status} = 'active')
              and exists (select 1 from ${paymentMethods} where ${paymentMethods.id} = ${row.paymentMethod.id} and ${paymentMethods.status} = 'active')
              then 1 else 0 end`,
          }),
        );
      }

      statements.push(
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
        database
          .update(provenanceLinks)
          .set({ effectiveTo: command.appliedAt })
          .where(
            and(
              eq(provenanceLinks.subjectType, 'claim_asset'),
              eq(provenanceLinks.subjectId, command.selectedCurrentRowId),
              isNull(provenanceLinks.effectiveTo),
            ),
          ),
        database
          .delete(claimAssets)
          .where(
            and(
              eq(claimAssets.id, command.selectedCurrentRowId),
              eq(claimAssets.claimId, command.claimId),
            ),
          ),
        database.insert(claimAssets).values({
          id: replacement.rowId,
          claimId: replacement.claimId,
          assetId: replacement.asset.id,
          networkId: replacement.network.id,
          paymentMethodId: replacement.paymentMethod.id,
          contractAddress: replacement.contractAddress,
          isPrimary: replacement.isPrimary,
          notes: replacement.notes,
          createdAt: command.appliedAt,
          updatedAt: command.appliedAt,
        }),
        database.insert(provenanceLinks).values({
          subjectType: 'claim_asset',
          subjectId: replacement.rowId,
          fieldPath: null,
          sourceRecordId: command.sourceRecord.id,
          licenseId: null,
          provenanceRole: 'correction',
          effectiveFrom: command.appliedAt,
          effectiveTo: null,
        }),
        database.select({
          guard: sql<number>`1 / case when (
            select coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'rowId', proposed_row.id::text,
                  'claimId', proposed_row.claim_id::text,
                  'asset', jsonb_build_object(
                    'id', proposed_asset.id::text,
                    'slug', proposed_asset.slug,
                    'symbol', proposed_asset.symbol,
                    'status', proposed_asset.status
                  ),
                  'network', jsonb_build_object(
                    'id', proposed_network.id::text,
                    'slug', proposed_network.slug,
                    'status', proposed_network.status
                  ),
                  'paymentMethod', jsonb_build_object(
                    'id', proposed_method.id::text,
                    'slug', proposed_method.slug,
                    'status', proposed_method.status
                  ),
                  'contractAddress', proposed_row.contract_address,
                  'isPrimary', proposed_row.is_primary,
                  'notes', proposed_row.notes
                ) order by proposed_row.id
              ),
              '[]'::jsonb
            )
            from ${claimAssets} proposed_row
            inner join ${assets} proposed_asset on proposed_asset.id = proposed_row.asset_id
            inner join ${networks} proposed_network on proposed_network.id = proposed_row.network_id
            inner join ${paymentMethods} proposed_method
              on proposed_method.id = proposed_row.payment_method_id
            where proposed_row.claim_id = ${command.claimId}
          ) = cast(${proposedSet} as jsonb) then 1 else 0 end`,
        }),
        database
          .update(acceptanceClaims)
          .set({ updatedAt: command.appliedAt })
          .where(eq(acceptanceClaims.id, command.claimId)),
        database.insert(verificationEvents).values({
          id: command.verificationEventId,
          claimId: command.claimId,
          eventType: 'corrected',
          fromStatus: null,
          toStatus: null,
          fromVisibility: null,
          toVisibility: null,
          reasonCode: `problem_report_${command.correctionKind}_correction`,
          effectiveAt: command.appliedAt,
          publicSummary: command.publicSummary,
          internalNote: command.internalNote,
          actorType: 'system',
          actorId: null,
        }),
        database.insert(submissionEvents).values({
          id: command.requestId,
          submissionId: command.submissionId,
          fromStatus: null,
          toStatus: 'resolved',
          action: 'problem_claim_assets_replaced',
          reasonCode: `problem_report_${command.correctionKind}_correction`,
          actorId: command.actorId,
          actorType: command.actorType === 'human' ? 'reviewer' : 'system',
          internalNote: JSON.stringify(eventPayload),
          createdAt: command.appliedAt,
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
            'The Claim Asset replacement conflicted with current private state and was rolled back.',
            { cause: error },
          );
        }
        throw error;
      }

      return {
        state: 'committed',
        correctionEventId: command.requestId,
        planId: command.planId,
        claimId: command.claimId,
        sourceRecordId: command.sourceRecord.id,
        verificationEventId: command.verificationEventId,
        currentSetHash: command.currentSetHash,
        proposedSetHash: command.proposedSetHash,
        appliedAt: command.appliedAt.toISOString(),
      } satisfies ProblemClaimAssetReplacementCommitReceipt;
    },
  };
}
