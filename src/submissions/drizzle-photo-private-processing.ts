import { asc, eq, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../db/client';
import {
  mediaAssets,
  mediaFiles,
  quarantineUploadReservations,
  submissionEvents,
  submissionPayloads,
  submissions,
} from '../db/schema';
import {
  photoMediaHandoffEventPayloadSchema,
  type PhotoMediaHandoffPersistence,
  type PhotoProcessingSubmissionContext,
} from './photo-private-processing';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

const processableStatuses = new Set([
  'received',
  'triage',
  'in_review',
  'needs_information',
  'on_hold',
] as const);

export function createDrizzlePhotoMediaHandoffPersistence(
  database: CryptoPayMapDatabase,
): PhotoMediaHandoffPersistence {
  return {
    async loadSubmissionContext(submissionId) {
      const rows = await database
        .select({
          id: submissions.id,
          intakeRequestId: submissions.intakeRequestId,
          submissionType: submissions.submissionType,
          targetType: submissions.targetType,
          targetId: submissions.targetId,
          workflowStatus: submissions.workflowStatus,
          updatedAt: submissions.updatedAt,
          normalizedPayload: submissionPayloads.normalizedPayload,
        })
        .from(submissions)
        .innerJoin(submissionPayloads, eq(submissionPayloads.submissionId, submissions.id))
        .where(eq(submissions.id, submissionId))
        .limit(1);
      const row = rows[0];
      if (
        row === undefined ||
        row.submissionType !== 'photos' ||
        (row.targetType !== 'entity' && row.targetType !== 'location') ||
        row.targetId === null ||
        row.normalizedPayload === null ||
        !processableStatuses.has(
          row.workflowStatus as
            | 'received'
            | 'triage'
            | 'in_review'
            | 'needs_information'
            | 'on_hold',
        )
      ) {
        return null;
      }

      const reservations = await database
        .select({
          id: quarantineUploadReservations.id,
          intakeRequestId: quarantineUploadReservations.intakeRequestId,
          purpose: quarantineUploadReservations.purpose,
          expiresAt: quarantineUploadReservations.expiresAt,
          consumedBySubmissionId: quarantineUploadReservations.consumedBySubmissionId,
          consumedAt: quarantineUploadReservations.consumedAt,
        })
        .from(quarantineUploadReservations)
        .where(eq(quarantineUploadReservations.intakeRequestId, row.intakeRequestId))
        .orderBy(asc(quarantineUploadReservations.id));

      const context: PhotoProcessingSubmissionContext = {
        id: row.id,
        intakeRequestId: row.intakeRequestId,
        submissionType: 'photos',
        targetType: row.targetType,
        targetId: row.targetId,
        workflowStatus: row.workflowStatus as PhotoProcessingSubmissionContext['workflowStatus'],
        updatedAt: row.updatedAt.toISOString(),
        normalizedPayload: structuredClone(row.normalizedPayload),
        reservations: reservations.map((reservation) => ({
          id: reservation.id,
          intakeRequestId: reservation.intakeRequestId,
          purpose: reservation.purpose,
          expiresAt: reservation.expiresAt.toISOString(),
          consumedBySubmissionId: reservation.consumedBySubmissionId,
          consumedAt: reservation.consumedAt?.toISOString() ?? null,
        })),
      };
      return context;
    },

    async readHandoffEvent(eventId) {
      const rows = await database
        .select({
          action: submissionEvents.action,
          internalNote: submissionEvents.internalNote,
        })
        .from(submissionEvents)
        .where(eq(submissionEvents.id, eventId))
        .limit(1);
      const row = rows[0];
      if (
        row === undefined ||
        row.action !== 'photo_media_handoff_created' ||
        row.internalNote === null
      ) {
        return null;
      }
      try {
        return photoMediaHandoffEventPayloadSchema.parse(JSON.parse(row.internalNote));
      } catch {
        throw new Error('Stored photo Media handoff event is malformed.');
      }
    },

    async commitHandoff(command) {
      const lock = database.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${command.submissionId}, 0))`,
      );
      const guard = database.select({
        guard: sql<number>`1 / case when
          exists (
            select 1
            from ${submissions}
            where ${submissions.id} = ${command.submissionId}
              and ${submissions.submissionType} = 'photos'
              and ${submissions.updatedAt} = ${command.expectedSubmissionUpdatedAt}
              and ${submissions.workflowStatus} = ${command.expectedWorkflowStatus}
          )
          and not exists (
            select 1
            from ${submissionEvents}
            where ${submissionEvents.submissionId} = ${command.submissionId}
              and ${submissionEvents.action} = 'photo_media_handoff_created'
          )
          and not exists (
            select 1 from ${submissionEvents}
            where ${submissionEvents.id} = ${command.eventId}
          )
          then 1 else 0 end`,
      });
      const insertAssets = database.insert(mediaAssets).values(
        command.assets.map((asset) => ({
          id: asset.id,
          purpose: asset.purpose,
          role: asset.role,
          reviewStatus: asset.reviewStatus,
          rightsStatus: asset.rightsStatus,
          visibility: asset.visibility,
          entityId: asset.entityId,
          locationId: asset.locationId,
          claimId: null,
          evidenceId: null,
          submissionId: null,
          sourceRecordId: null,
          licenseId: null,
          attribution: null,
          altText: null,
          rightsHolder: null,
          consentReference: null,
          displayOrder: asset.displayOrder,
          capturedAt: asset.capturedAt,
          publishedAt: null,
          createdAt: asset.createdAt,
          updatedAt: asset.updatedAt,
          deletedAt: null,
        })),
      );
      const insertFiles = database.insert(mediaFiles).values(command.files);
      const insertEvent = database.insert(submissionEvents).values({
        id: command.eventId,
        submissionId: command.submissionId,
        fromStatus: null,
        toStatus: command.expectedWorkflowStatus,
        action: 'photo_media_handoff_created',
        reasonCode: 'photo_processing_completed',
        actorId: 'system:photo-private-processing',
        actorType: 'system',
        internalNote: JSON.stringify(command.eventPayload),
        createdAt: new Date(command.eventPayload.processedAt),
      });

      await database.batch([
        lock,
        guard,
        insertAssets,
        insertFiles,
        insertEvent,
      ] as unknown as DatabaseBatchInput);
    },
  };
}
