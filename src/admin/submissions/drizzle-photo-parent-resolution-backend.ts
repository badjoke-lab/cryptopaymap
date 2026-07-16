import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  mediaAssets,
  mediaReviewDecisions,
  submissionEvents,
  submissions,
} from '../../db/schema';
import { photoMediaHandoffEventPayloadSchema } from '../../submissions/photo-private-processing';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import { assertSubmissionWorkflowTransition } from '../../submissions/workflow';
import type { PhotoParentResolutionBackend } from './photo-parent-resolution';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function createDrizzlePhotoParentResolutionBackend(
  database: CryptoPayMapDatabase,
): PhotoParentResolutionBackend {
  return {
    async readEvent(eventId) {
      const rows = await database
        .select({
          eventId: submissionEvents.id,
          submissionId: submissionEvents.submissionId,
          fromStatus: submissionEvents.fromStatus,
          toStatus: submissionEvents.toStatus,
          action: submissionEvents.action,
          reasonCode: submissionEvents.reasonCode,
          actorId: submissionEvents.actorId,
          internalNote: submissionEvents.internalNote,
          createdAt: submissionEvents.createdAt,
        })
        .from(submissionEvents)
        .where(eq(submissionEvents.id, eventId))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      return {
        ...row,
        createdAt: row.createdAt.toISOString(),
      };
    },

    async readState(submissionId) {
      const submissionRows = await database
        .select({
          submissionId: submissions.id,
          submissionType: submissions.submissionType,
          targetType: submissions.targetType,
          targetId: submissions.targetId,
          workflowStatus: submissions.workflowStatus,
          resolution: submissions.resolution,
          updatedAt: submissions.updatedAt,
        })
        .from(submissions)
        .where(eq(submissions.id, submissionId))
        .limit(1);
      const submission = submissionRows[0];
      if (submission === undefined) return null;

      const handoffRows = await database
        .select({
          eventId: submissionEvents.id,
          internalNote: submissionEvents.internalNote,
        })
        .from(submissionEvents)
        .where(
          and(
            eq(submissionEvents.submissionId, submissionId),
            eq(submissionEvents.action, 'photo_media_handoff_created'),
          ),
        )
        .orderBy(asc(submissionEvents.createdAt), asc(submissionEvents.id))
        .limit(2);
      if (handoffRows.length > 1) {
        throw new Error('Photos Submission contains more than one Media handoff event.');
      }

      const handoffRow = handoffRows[0];
      const handoff =
        handoffRow === undefined || handoffRow.internalNote === null
          ? null
          : photoMediaHandoffEventPayloadSchema.parse(JSON.parse(handoffRow.internalNote));
      const mediaAssetIds = handoff?.media.map((item) => item.mediaAssetId) ?? [];
      if (mediaAssetIds.length === 0) {
        return {
          submissionId: submission.submissionId,
          submissionType: submission.submissionType,
          targetType: submission.targetType,
          targetId: submission.targetId,
          workflowStatus: submission.workflowStatus,
          resolution: submission.resolution,
          updatedAt: submission.updatedAt.toISOString(),
          handoff: null,
          media: [],
        };
      }

      const assetRows = await database
        .select({
          mediaAssetId: mediaAssets.id,
          updatedAt: mediaAssets.updatedAt,
          reviewStatus: mediaAssets.reviewStatus,
          purpose: mediaAssets.purpose,
          visibility: mediaAssets.visibility,
          entityId: mediaAssets.entityId,
          locationId: mediaAssets.locationId,
          deletedAt: mediaAssets.deletedAt,
        })
        .from(mediaAssets)
        .where(inArray(mediaAssets.id, mediaAssetIds));
      const decisionRows = await database
        .select({
          decisionId: mediaReviewDecisions.id,
          mediaAssetId: mediaReviewDecisions.mediaAssetId,
          action: mediaReviewDecisions.action,
          expectedReviewStatus: mediaReviewDecisions.expectedReviewStatus,
          toReviewStatus: mediaReviewDecisions.toReviewStatus,
          decidedAt: mediaReviewDecisions.decidedAt,
        })
        .from(mediaReviewDecisions)
        .where(
          and(
            inArray(mediaReviewDecisions.mediaAssetId, mediaAssetIds),
            eq(mediaReviewDecisions.expectedReviewStatus, 'pending'),
            inArray(mediaReviewDecisions.action, ['approve_public', 'reject']),
          ),
        )
        .orderBy(asc(mediaReviewDecisions.decidedAt), asc(mediaReviewDecisions.id));

      const decisionByAsset = new Map<string, (typeof decisionRows)[number]>();
      for (const decision of decisionRows) {
        if (decisionByAsset.has(decision.mediaAssetId)) {
          throw new Error('A Photos Media item contains multiple initial review decisions.');
        }
        decisionByAsset.set(decision.mediaAssetId, decision);
      }
      const assetById = new Map(assetRows.map((asset) => [asset.mediaAssetId, asset]));

      return {
        submissionId: submission.submissionId,
        submissionType: submission.submissionType,
        targetType: submission.targetType,
        targetId: submission.targetId,
        workflowStatus: submission.workflowStatus,
        resolution: submission.resolution,
        updatedAt: submission.updatedAt.toISOString(),
        handoff: {
          eventId: handoffRow?.eventId ?? '',
          targetType: handoff?.targetType ?? 'entity',
          targetId: handoff?.targetId ?? '',
          mediaAssetIds,
        },
        media: mediaAssetIds.flatMap((mediaAssetId) => {
          const asset = assetById.get(mediaAssetId);
          if (asset === undefined) return [];
          const decision = decisionByAsset.get(mediaAssetId);
          return [
            {
              mediaAssetId,
              updatedAt: asset.updatedAt.toISOString(),
              reviewStatus: asset.reviewStatus,
              purpose: asset.purpose,
              visibility: asset.visibility,
              entityId: asset.entityId,
              locationId: asset.locationId,
              deletedAt: asset.deletedAt?.toISOString() ?? null,
              decision:
                decision === undefined
                  ? null
                  : {
                      decisionId: decision.decisionId,
                      action: decision.action as 'approve_public' | 'reject',
                      expectedReviewStatus: 'pending' as const,
                      toReviewStatus: decision.toReviewStatus as 'accepted' | 'rejected',
                      decidedAt: decision.decidedAt.toISOString(),
                    },
            },
          ];
        }),
      };
    },

    async commitResolution(command) {
      assertSubmissionWorkflowTransition({
        fromStatus: 'in_review',
        toStatus: 'resolved',
        resolution: command.resolution,
      });

      const lock = database.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${command.submissionId}, 0))`,
      );
      const submissionGuard = database.select({
        guard: sql<number>`1 / case when
          exists (
            select 1 from ${submissions}
            where ${submissions.id} = ${command.submissionId}
              and ${submissions.submissionType} = 'photos'
              and ${submissions.workflowStatus} = 'in_review'
              and ${submissions.resolution} is null
              and ${submissions.updatedAt} = ${command.expectedSubmissionUpdatedAt}
          )
          and exists (
            select 1 from ${submissionEvents}
            where ${submissionEvents.id} = ${command.handoffEventId}
              and ${submissionEvents.submissionId} = ${command.submissionId}
              and ${submissionEvents.action} = 'photo_media_handoff_created'
          )
          and not exists (
            select 1 from ${submissionEvents}
            where ${submissionEvents.submissionId} = ${command.submissionId}
              and ${submissionEvents.action} = 'photo_parent_resolution_decided'
          )
          and not exists (
            select 1 from ${submissionEvents}
            where ${submissionEvents.id} = ${command.eventId}
          )
          then 1 else 0 end`,
      });
      const mediaGuards = command.media.map((item) =>
        database.select({
          guard: sql<number>`1 / case when
            exists (
              select 1 from ${mediaAssets}
              where ${mediaAssets.id} = ${item.mediaAssetId}
                and ${mediaAssets.updatedAt} = ${item.expectedMediaUpdatedAt}
                and ${mediaAssets.reviewStatus} = ${item.expectedReviewStatus}
                and ${mediaAssets.deletedAt} is null
                and (
                  (${item.expectedReviewStatus} = 'accepted' and ${mediaAssets.purpose} = 'public_gallery')
                  or (${item.expectedReviewStatus} = 'rejected' and ${mediaAssets.purpose} = 'public_gallery_candidate' and ${mediaAssets.visibility} = 'private')
                )
            )
            and exists (
              select 1 from ${mediaReviewDecisions}
              where ${mediaReviewDecisions.id} = ${item.decisionId}
                and ${mediaReviewDecisions.mediaAssetId} = ${item.mediaAssetId}
                and ${mediaReviewDecisions.action} = ${item.expectedDecisionAction}
                and ${mediaReviewDecisions.expectedReviewStatus} = 'pending'
                and ${mediaReviewDecisions.toReviewStatus} = ${item.expectedReviewStatus}
                and ${mediaReviewDecisions.decidedAt} = ${item.expectedDecisionDecidedAt}
            )
            then 1 else 0 end`,
        }),
      );

      const statements: unknown[] = [
        lock,
        submissionGuard,
        ...mediaGuards,
        database
          .update(submissions)
          .set({
            workflowStatus: 'resolved',
            resolution: command.resolution,
            updatedAt: command.changedAt,
            resolvedAt: command.changedAt,
            withdrawnAt: null,
          })
          .where(eq(submissions.id, command.submissionId)),
        database.insert(submissionEvents).values({
          id: command.eventId,
          submissionId: command.submissionId,
          fromStatus: 'in_review',
          toStatus: 'resolved',
          action: 'photo_parent_resolution_decided',
          reasonCode: command.reasonCode,
          actorId: command.actorId,
          actorType: command.actorType === 'system' ? 'system' : 'reviewer',
          internalNote: command.internalNote,
          createdAt: command.changedAt,
        }),
      ];

      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new SubmissionPersistenceError(
            'conflict',
            'Photos parent resolution conflicted with current Submission or Media state.',
            { cause: error },
          );
        }
        throw error;
      }
    },
  };
}
