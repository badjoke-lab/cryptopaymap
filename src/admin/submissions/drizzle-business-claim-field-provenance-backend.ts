import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  entities,
  locations,
  provenanceLinks,
  sourceRecords,
  sources,
  submissionEvents,
  submissions,
} from '../../db/schema';
import { parseBusinessClaimFieldApplicationEventPayload } from '../../submissions/business-claim-field-application-persistence-contract';
import {
  businessClaimFieldProvenanceEventPayloadSchema,
  parseBusinessClaimFieldProvenanceEventPayload,
  serializeBusinessClaimFieldProvenanceEventPayload,
} from '../../submissions/business-claim-field-provenance-contract';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import {
  type BusinessClaimFieldProvenanceBackend,
  type BusinessClaimFieldProvenanceCommitCommand,
  type BusinessClaimFieldProvenanceCommitReceipt,
  BusinessClaimFieldProvenanceError,
  type BusinessClaimFieldProvenanceEventRecord,
} from './business-claim-field-provenance';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function eventSelection() {
  return {
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
  };
}

function mapEvent(
  row:
    | {
        eventId: string;
        submissionId: string;
        fromStatus: string | null;
        toStatus: string;
        action: string;
        reasonCode: string | null;
        actorId: string;
        actorType: string;
        internalNote: string | null;
        createdAt: Date;
      }
    | undefined,
): BusinessClaimFieldProvenanceEventRecord | null {
  return row === undefined ? null : { ...row, createdAt: row.createdAt.toISOString() };
}

async function readEvent(
  database: CryptoPayMapDatabase,
  eventId: string,
): Promise<BusinessClaimFieldProvenanceEventRecord | null> {
  const rows = await database
    .select(eventSelection())
    .from(submissionEvents)
    .where(eq(submissionEvents.id, eventId))
    .limit(1);
  return mapEvent(rows[0]);
}

function allGuards(parts: ReturnType<typeof sql>[]) {
  return parts.length === 0 ? sql`true` : sql.join(parts, sql` and `);
}

function replayReceipt(
  event: BusinessClaimFieldProvenanceEventRecord,
  command: BusinessClaimFieldProvenanceCommitCommand,
): BusinessClaimFieldProvenanceCommitReceipt {
  const payload = parseBusinessClaimFieldProvenanceEventPayload(event.internalNote);
  if (
    payload === null ||
    event.eventId !== command.requestId ||
    event.submissionId !== command.submissionId ||
    event.fromStatus !== null ||
    event.toStatus !== 'resolved' ||
    event.action !== 'business_claim_field_provenance_completed' ||
    event.reasonCode !== 'field_provenance_completed' ||
    event.actorId !== command.actorId ||
    event.actorType !== (command.actorType === 'human' ? 'reviewer' : 'system') ||
    payload.requestFingerprint !== command.requestFingerprint ||
    payload.fieldApplicationEventId !== command.fieldApplicationEventId ||
    payload.relationshipDecisionId !== command.relationshipDecisionId ||
    payload.sourceRecordId !== command.sourceRecord.id ||
    payload.target.targetType !== command.targetType ||
    payload.target.targetId !== command.targetId ||
    JSON.stringify(payload.fieldPaths) !== JSON.stringify(command.fieldPaths) ||
    payload.expectedTargetUpdatedAt !== command.expectedTargetUpdatedAt.toISOString() ||
    payload.fieldAppliedAt !== command.fieldAppliedAt.toISOString() ||
    payload.completedAt !== event.createdAt
  ) {
    throw new BusinessClaimFieldProvenanceError(
      'idempotency_conflict',
      'The field provenance request UUID was already used for different content.',
    );
  }
  return {
    state: 'replayed',
    completionEventId: event.eventId,
    sourceRecordId: payload.sourceRecordId,
    completedAt: event.createdAt,
  };
}

export function createDrizzleBusinessClaimFieldProvenanceBackend(
  database: CryptoPayMapDatabase,
): BusinessClaimFieldProvenanceBackend {
  return {
    async readState(submissionId, fieldApplicationEventId, requestId, sourceRecordId) {
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
        .where(eq(submissions.id, submissionId))
        .limit(1);
      const submission = submissionRows[0];
      if (submission === undefined) return null;

      const fieldApplicationEvent = await readEvent(database, fieldApplicationEventId);
      const requestEvent = await readEvent(database, requestId);
      const fieldPayload = parseBusinessClaimFieldApplicationEventPayload(
        fieldApplicationEvent?.internalNote ?? null,
      );
      const acceptedFields =
        fieldPayload?.projection.targetType === 'entity'
          ? (fieldPayload.projection.entityApplication?.acceptedFields ?? [])
          : (fieldPayload?.projection.locationApplication?.acceptedFields ?? []);

      const completionRows = await database
        .select(eventSelection())
        .from(submissionEvents)
        .where(
          and(
            eq(submissionEvents.submissionId, submissionId),
            eq(submissionEvents.action, 'business_claim_field_provenance_completed'),
          ),
        )
        .orderBy(asc(submissionEvents.createdAt))
        .limit(20);
      const completionEvent =
        completionRows
          .map((row) => mapEvent(row))
          .find(
            (event) =>
              parseBusinessClaimFieldProvenanceEventPayload(event?.internalNote ?? null)
                ?.fieldApplicationEventId === fieldApplicationEventId,
          ) ?? null;

      let target = null;
      if (submission.targetType === 'entity' && submission.targetId !== null) {
        const rows = await database
          .select({
            targetId: entities.id,
            name: entities.name,
            legalName: entities.legalName,
            websiteUrl: entities.websiteUrl,
            countryCode: entities.countryCode,
            updatedAt: entities.updatedAt,
            deletedAt: entities.deletedAt,
          })
          .from(entities)
          .where(eq(entities.id, submission.targetId))
          .limit(1);
        const row = rows[0];
        if (row !== undefined) {
          target = {
            targetType: 'entity' as const,
            targetId: row.targetId,
            updatedAt: row.updatedAt.toISOString(),
            deletedAt: row.deletedAt?.toISOString() ?? null,
            value: {
              name: row.name,
              legalName: row.legalName,
              websiteUrl: row.websiteUrl,
              countryCode: row.countryCode,
            },
          };
        }
      }
      if (submission.targetType === 'location' && submission.targetId !== null) {
        const rows = await database
          .select({
            targetId: locations.id,
            name: locations.name,
            addressLine: locations.addressLine,
            locality: locations.locality,
            region: locations.region,
            postalCode: locations.postalCode,
            countryCode: locations.countryCode,
            latitude: locations.latitude,
            longitude: locations.longitude,
            websiteUrl: locations.websiteUrl,
            phone: locations.phone,
            description: locations.description,
            openingHours: locations.openingHours,
            amenities: locations.amenities,
            socialLinks: locations.socialLinks,
            updatedAt: locations.updatedAt,
            deletedAt: locations.deletedAt,
          })
          .from(locations)
          .where(eq(locations.id, submission.targetId))
          .limit(1);
        const row = rows[0];
        if (row !== undefined) {
          target = {
            targetType: 'location' as const,
            targetId: row.targetId,
            updatedAt: row.updatedAt.toISOString(),
            deletedAt: row.deletedAt?.toISOString() ?? null,
            value: {
              name: row.name,
              addressLine: row.addressLine,
              locality: row.locality,
              region: row.region,
              postalCode: row.postalCode,
              countryCode: row.countryCode,
              latitude: Number(row.latitude),
              longitude: Number(row.longitude),
              websiteUrl: row.websiteUrl,
              phone: row.phone,
              description: row.description,
              openingHours: row.openingHours,
              amenities: row.amenities ?? [],
              socialLinks: row.socialLinks ?? [],
            },
          };
        }
      }

      const sourceRows = await database
        .select({
          sourceRecordId: sourceRecords.id,
          sourceId: sourceRecords.sourceId,
          externalId: sourceRecords.externalId,
          contentHash: sourceRecords.contentHash,
        })
        .from(sourceRecords)
        .where(eq(sourceRecords.id, sourceRecordId))
        .limit(1);

      const provenanceRows =
        target === null || acceptedFields.length === 0
          ? []
          : await database
              .select({
                linkId: provenanceLinks.id,
                subjectType: provenanceLinks.subjectType,
                subjectId: provenanceLinks.subjectId,
                fieldPath: provenanceLinks.fieldPath,
                sourceRecordId: provenanceLinks.sourceRecordId,
                provenanceRole: provenanceLinks.provenanceRole,
                effectiveFrom: provenanceLinks.effectiveFrom,
                effectiveTo: provenanceLinks.effectiveTo,
              })
              .from(provenanceLinks)
              .where(
                and(
                  eq(provenanceLinks.subjectType, target.targetType),
                  eq(provenanceLinks.subjectId, target.targetId),
                  inArray(provenanceLinks.fieldPath, acceptedFields),
                ),
              )
              .orderBy(asc(provenanceLinks.id));

      return {
        submission,
        fieldApplicationEvent,
        requestEvent,
        completionEvent,
        target,
        sourceRecord: sourceRows[0] ?? null,
        provenanceLinks: provenanceRows.map((row) => ({
          ...row,
          effectiveFrom: row.effectiveFrom?.toISOString() ?? null,
          effectiveTo: row.effectiveTo?.toISOString() ?? null,
        })),
      };
    },

    async commitFieldProvenance(command) {
      const existing = await readEvent(database, command.requestId);
      if (existing !== null) return replayReceipt(existing, command);

      const eventPayload = businessClaimFieldProvenanceEventPayloadSchema.parse({
        schemaVersion: 'business-claim-field-provenance-event-v1',
        requestFingerprint: command.requestFingerprint,
        submissionId: command.submissionId,
        fieldApplicationEventId: command.fieldApplicationEventId,
        relationshipDecisionId: command.relationshipDecisionId,
        sourceRecordId: command.sourceRecord.id,
        target: { targetType: command.targetType, targetId: command.targetId },
        fieldPaths: command.fieldPaths,
        expectedTargetUpdatedAt: command.expectedTargetUpdatedAt.toISOString(),
        fieldAppliedAt: command.fieldAppliedAt.toISOString(),
        completedAt: command.completedAt.toISOString(),
      });
      const expectedOpenGuards = command.expectedOpenProvenance.map(
        (link) => sql`exists (
          select 1 from ${provenanceLinks}
          where ${provenanceLinks.id} = ${link.linkId}
            and ${provenanceLinks.subjectType} = ${command.targetType}
            and ${provenanceLinks.subjectId} = ${command.targetId}
            and ${provenanceLinks.fieldPath} = ${link.fieldPath as string}
            and ${provenanceLinks.sourceRecordId} = ${link.sourceRecordId}
            and ${provenanceLinks.provenanceRole} = ${link.provenanceRole as 'origin' | 'verification' | 'attribution'}
            and ${provenanceLinks.effectiveFrom} is not distinct from ${link.effectiveFrom === null ? null : new Date(link.effectiveFrom)}
            and ${provenanceLinks.effectiveTo} is null
        )`,
      );
      const fieldPathGuard = inArray(provenanceLinks.fieldPath, command.fieldPaths);
      const targetGuard =
        command.targetType === 'entity'
          ? sql`exists (
              select 1 from ${entities}
              where ${entities.id} = ${command.targetId}
                and ${entities.updatedAt} = ${command.expectedTargetUpdatedAt}
                and ${entities.deletedAt} is null
            )`
          : sql`exists (
              select 1 from ${locations}
              where ${locations.id} = ${command.targetId}
                and ${locations.updatedAt} = ${command.expectedTargetUpdatedAt}
                and ${locations.deletedAt} is null
            )`;

      const statements: unknown[] = [
        database.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${command.fieldApplicationEventId}, 0))`,
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
            select 1 from ${submissions}
            where ${submissions.id} = ${command.submissionId}
              and ${submissions.submissionType} = 'claim'
              and ${submissions.workflowStatus} = 'resolved'
              and ${submissions.resolution} = 'approved'
              and ${submissions.targetType} = ${command.targetType}
              and ${submissions.targetId} = ${command.targetId}
          ) and exists (
            select 1 from ${submissionEvents}
            where ${submissionEvents.id} = ${command.fieldApplicationEventId}
              and ${submissionEvents.submissionId} = ${command.submissionId}
              and ${submissionEvents.fromStatus} is null
              and ${submissionEvents.toStatus} = 'resolved'
              and ${submissionEvents.action} = 'business_claim_fields_applied'
              and ${submissionEvents.reasonCode} = 'field_decisions_committed'
              and ${submissionEvents.internalNote} = ${command.fieldApplicationInternalNote}
              and ${submissionEvents.createdAt} = ${command.fieldAppliedAt}
          ) and ${targetGuard}
          and not exists (
            select 1 from ${sourceRecords}
            where ${sourceRecords.id} = ${command.sourceRecord.id}
               or (${sourceRecords.sourceId} = ${command.sourceRecord.sourceId}
                 and ${sourceRecords.externalId} = ${command.sourceRecord.externalId})
          )
          and not exists (
            select 1 from ${submissionEvents}
            where ${submissionEvents.id} = ${command.requestId}
          )
          and not exists (
            select 1 from ${submissionEvents} completion
            where completion.submission_id = ${command.submissionId}
              and completion.action = 'business_claim_field_provenance_completed'
              and (coalesce(completion.internal_note, '{}')::jsonb ->> 'fieldApplicationEventId') = ${command.fieldApplicationEventId}
          )
          and ${allGuards(expectedOpenGuards)}
          and (
            select count(*) from ${provenanceLinks}
            where ${provenanceLinks.subjectType} = ${command.targetType}
              and ${provenanceLinks.subjectId} = ${command.targetId}
              and ${fieldPathGuard}
              and ${provenanceLinks.effectiveTo} is null
          ) = ${command.expectedOpenProvenance.length}
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

      if (command.expectedOpenProvenance.length > 0) {
        statements.push(
          database
            .update(provenanceLinks)
            .set({ effectiveTo: command.fieldAppliedAt })
            .where(
              and(
                inArray(
                  provenanceLinks.id,
                  command.expectedOpenProvenance.map((link) => link.linkId),
                ),
                isNull(provenanceLinks.effectiveTo),
              ),
            ),
        );
      }
      statements.push(
        database.insert(provenanceLinks).values(
          command.fieldPaths.map((fieldPath) => ({
            subjectType: command.targetType,
            subjectId: command.targetId,
            fieldPath,
            sourceRecordId: command.sourceRecord.id,
            licenseId: null,
            provenanceRole: 'correction' as const,
            effectiveFrom: command.fieldAppliedAt,
            effectiveTo: null,
          })),
        ),
        database.insert(submissionEvents).values({
          id: command.requestId,
          submissionId: command.submissionId,
          fromStatus: null,
          toStatus: 'resolved',
          action: 'business_claim_field_provenance_completed',
          reasonCode: 'field_provenance_completed',
          actorId: command.actorId,
          actorType: command.actorType === 'human' ? 'reviewer' : 'system',
          internalNote: serializeBusinessClaimFieldProvenanceEventPayload(eventPayload),
          createdAt: command.completedAt,
        }),
      );

      for (const link of command.expectedOpenProvenance) {
        statements.push(
          database.select({
            guard: sql<number>`1 / case when exists (
              select 1 from ${provenanceLinks}
              where ${provenanceLinks.id} = ${link.linkId}
                and ${provenanceLinks.effectiveTo} = ${command.fieldAppliedAt}
            ) then 1 else 0 end`,
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
          ) and (
            select count(*) from ${provenanceLinks}
            where ${provenanceLinks.subjectType} = ${command.targetType}
              and ${provenanceLinks.subjectId} = ${command.targetId}
              and ${fieldPathGuard}
              and ${provenanceLinks.sourceRecordId} = ${command.sourceRecord.id}
              and ${provenanceLinks.provenanceRole} = 'correction'
              and ${provenanceLinks.effectiveFrom} = ${command.fieldAppliedAt}
              and ${provenanceLinks.effectiveTo} is null
          ) = ${command.fieldPaths.length}
          and (
            select count(*) from ${provenanceLinks}
            where ${provenanceLinks.subjectType} = ${command.targetType}
              and ${provenanceLinks.subjectId} = ${command.targetId}
              and ${fieldPathGuard}
              and ${provenanceLinks.effectiveTo} is null
          ) = ${command.fieldPaths.length}
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
        if (code !== null && ['22012', '22P02', '23503', '23505', '23514'].includes(code)) {
          throw new SubmissionPersistenceError(
            'conflict',
            'Business Claim field provenance conflicted with current canonical state.',
            { cause: error },
          );
        }
        throw error;
      }

      return {
        state: 'committed',
        completionEventId: command.requestId,
        sourceRecordId: command.sourceRecord.id,
        completedAt: command.completedAt.toISOString(),
      };
    },
  };
}
