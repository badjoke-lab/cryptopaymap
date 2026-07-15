import { and, asc, eq, inArray, isNull, lte, notExists, or, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../db/client';
import {
  mediaAssets,
  mediaFiles,
  quarantineUploadReservations,
  submissionEvents,
  submissions,
} from '../db/schema';
import {
  type PhotoPrivateCleanupCandidate,
  type PhotoPrivateCleanupCandidateReader,
} from './photo-private-lifecycle';
import { photoMediaHandoffEventPayloadSchema } from './photo-private-processing';
import { photoQuarantineObjectKey } from './photo-upload-authorization';

const terminalSubmissionCondition = or(
  inArray(submissions.workflowStatus, ['duplicate', 'rejected_spam', 'withdrawn']),
  and(
    eq(submissions.workflowStatus, 'resolved'),
    inArray(submissions.resolution, ['not_approved', 'duplicate', 'no_change', 'withdrawn']),
  ),
);

function latest(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right;
}

export function createDrizzlePhotoPrivateCleanupCandidateReader(
  database: CryptoPayMapDatabase,
): PhotoPrivateCleanupCandidateReader {
  return {
    async loadCleanupCandidates(cutoffs, limit) {
      const candidates: PhotoPrivateCleanupCandidate[] = [];

      const expiredReservations = await database
        .select({
          id: quarantineUploadReservations.id,
          expiresAt: quarantineUploadReservations.expiresAt,
        })
        .from(quarantineUploadReservations)
        .where(
          and(
            isNull(quarantineUploadReservations.consumedBySubmissionId),
            lte(quarantineUploadReservations.expiresAt, cutoffs.expiredAuthorizationBefore),
          ),
        )
        .orderBy(asc(quarantineUploadReservations.expiresAt), asc(quarantineUploadReservations.id))
        .limit(limit);

      for (const reservation of expiredReservations) {
        candidates.push({
          referenceType: 'reservation',
          referenceId: reservation.id,
          reason: 'expired_authorization',
          eligibleAt: reservation.expiresAt.toISOString(),
          submissionId: null,
          mediaAssetId: null,
          objects: [
            {
              objectRefId: reservation.id,
              reservationId: reservation.id,
              mediaAssetId: null,
              mediaFileId: null,
              variant: 'original',
              storageScope: 'quarantine',
              storageKey: photoQuarantineObjectKey(reservation.id),
              mimeType: 'application/octet-stream',
              contentHash: null,
            },
          ],
        });
      }

      let remaining = limit - candidates.length;
      if (remaining <= 0) return candidates;

      const closedSubmissions = await database
        .select({
          id: submissions.id,
          updatedAt: submissions.updatedAt,
        })
        .from(submissions)
        .where(
          and(
            eq(submissions.submissionType, 'photos'),
            terminalSubmissionCondition,
            lte(submissions.updatedAt, cutoffs.terminalStateBefore),
            notExists(
              database
                .select({ value: sql<number>`1` })
                .from(submissionEvents)
                .where(
                  and(
                    eq(submissionEvents.submissionId, submissions.id),
                    eq(submissionEvents.action, 'photo_media_handoff_created'),
                  ),
                ),
            ),
          ),
        )
        .orderBy(asc(submissions.updatedAt), asc(submissions.id))
        .limit(remaining);

      if (closedSubmissions.length > 0) {
        const submissionIds = closedSubmissions.map((submission) => submission.id);
        const reservationRows = await database
          .select({
            id: quarantineUploadReservations.id,
            submissionId: quarantineUploadReservations.consumedBySubmissionId,
          })
          .from(quarantineUploadReservations)
          .where(inArray(quarantineUploadReservations.consumedBySubmissionId, submissionIds))
          .orderBy(
            asc(quarantineUploadReservations.consumedBySubmissionId),
            asc(quarantineUploadReservations.id),
          );
        const reservationsBySubmission = new Map<string, string[]>();
        for (const reservation of reservationRows) {
          if (reservation.submissionId === null) continue;
          const values = reservationsBySubmission.get(reservation.submissionId) ?? [];
          values.push(reservation.id);
          reservationsBySubmission.set(reservation.submissionId, values);
        }

        for (const submission of closedSubmissions) {
          const reservationIds = reservationsBySubmission.get(submission.id) ?? [];
          if (reservationIds.length === 0) continue;
          candidates.push({
            referenceType: 'submission',
            referenceId: submission.id,
            reason: 'closed_submission_without_handoff',
            eligibleAt: submission.updatedAt.toISOString(),
            submissionId: submission.id,
            mediaAssetId: null,
            objects: reservationIds.map((reservationId) => ({
              objectRefId: reservationId,
              reservationId,
              mediaAssetId: null,
              mediaFileId: null,
              variant: 'original' as const,
              storageScope: 'quarantine' as const,
              storageKey: photoQuarantineObjectKey(reservationId),
              mimeType: 'application/octet-stream',
              contentHash: null,
            })),
          });
        }
      }

      remaining = limit - candidates.length;
      if (remaining <= 0) return candidates;

      const handoffContainsAsset = sql<boolean>`
        ${submissionEvents.internalNote} is not null
        and (${submissionEvents.internalNote}::jsonb -> 'media') @>
          jsonb_build_array(jsonb_build_object('mediaAssetId', ${mediaAssets.id}::text))
      `;
      const terminalMediaRows = await database
        .select({
          mediaAssetId: mediaAssets.id,
          reviewStatus: mediaAssets.reviewStatus,
          mediaUpdatedAt: mediaAssets.updatedAt,
          submissionId: submissions.id,
          submissionUpdatedAt: submissions.updatedAt,
          handoffPayload: submissionEvents.internalNote,
        })
        .from(mediaAssets)
        .innerJoin(
          submissionEvents,
          and(eq(submissionEvents.action, 'photo_media_handoff_created'), handoffContainsAsset),
        )
        .innerJoin(submissions, eq(submissions.id, submissionEvents.submissionId))
        .where(
          and(
            inArray(mediaAssets.reviewStatus, ['rejected', 'superseded']),
            isNull(mediaAssets.deletedAt),
            eq(submissions.submissionType, 'photos'),
            terminalSubmissionCondition,
            lte(mediaAssets.updatedAt, cutoffs.terminalStateBefore),
            lte(submissions.updatedAt, cutoffs.terminalStateBefore),
          ),
        )
        .orderBy(asc(mediaAssets.updatedAt), asc(mediaAssets.id))
        .limit(remaining);

      if (terminalMediaRows.length === 0) return candidates;

      const uniqueMedia = new Map<string, (typeof terminalMediaRows)[number]>();
      for (const row of terminalMediaRows) {
        if (!uniqueMedia.has(row.mediaAssetId)) uniqueMedia.set(row.mediaAssetId, row);
      }
      const mediaIds = [...uniqueMedia.keys()];
      const fileRows = await database
        .select({
          id: mediaFiles.id,
          mediaAssetId: mediaFiles.mediaAssetId,
          variant: mediaFiles.variant,
          storageScope: mediaFiles.storageScope,
          storageKey: mediaFiles.storageKey,
          mimeType: mediaFiles.mimeType,
          contentHash: mediaFiles.contentHash,
        })
        .from(mediaFiles)
        .where(
          and(
            inArray(mediaFiles.mediaAssetId, mediaIds),
            inArray(mediaFiles.storageScope, ['quarantine', 'private']),
          ),
        )
        .orderBy(asc(mediaFiles.mediaAssetId), asc(mediaFiles.variant), asc(mediaFiles.id));
      const filesByMedia = new Map<string, typeof fileRows>();
      for (const file of fileRows) {
        const values = filesByMedia.get(file.mediaAssetId) ?? [];
        values.push(file);
        filesByMedia.set(file.mediaAssetId, values);
      }

      for (const row of uniqueMedia.values()) {
        if (row.handoffPayload === null) {
          throw new Error('Photo Media handoff payload is missing.');
        }
        const payload = photoMediaHandoffEventPayloadSchema.parse(JSON.parse(row.handoffPayload));
        const handoffItem = payload.media.find((item) => item.mediaAssetId === row.mediaAssetId);
        if (handoffItem === undefined || payload.submissionId !== row.submissionId) {
          throw new Error('Photo Media handoff payload does not match its terminal Media Asset.');
        }
        const files = (filesByMedia.get(row.mediaAssetId) ?? []).map((file) => {
          if (file.storageScope !== 'quarantine' && file.storageScope !== 'private') {
            throw new Error('Photo private cleanup selected a public Media file.');
          }
          return {
            ...file,
            storageScope: file.storageScope,
          };
        });
        if (files.length === 0) continue;
        candidates.push({
          referenceType: 'media_asset',
          referenceId: row.mediaAssetId,
          reason: row.reviewStatus === 'rejected' ? 'rejected_media' : 'superseded_media',
          eligibleAt: latest(row.mediaUpdatedAt, row.submissionUpdatedAt).toISOString(),
          submissionId: row.submissionId,
          mediaAssetId: row.mediaAssetId,
          objects: files.map((file) => ({
            objectRefId: file.id,
            reservationId:
              file.storageScope === 'quarantine' ? handoffItem.quarantineUploadId : null,
            mediaAssetId: row.mediaAssetId,
            mediaFileId: file.id,
            variant: file.variant,
            storageScope: file.storageScope,
            storageKey: file.storageKey,
            mimeType: file.mimeType,
            contentHash: file.contentHash,
          })),
        });
      }

      return candidates.slice(0, limit);
    },
  };
}
