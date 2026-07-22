import { and, asc, eq, inArray, isNull, lte, notExists, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { CryptoPayMapDatabase } from '../db/client';
import {
  evidence,
  mediaAssets,
  mediaFiles,
  quarantineUploadReservations,
  submissionRetentionItems,
} from '../db/schema';
import { photoQuarantineObjectKey } from './photo-upload-authorization';
import type {
  PrivateMediaRetentionCandidate,
  PrivateMediaRetentionCandidateReader,
} from './private-media-retention';

function reservationIdFromKey(storageKey: string): string | null {
  const match = /^quarantine\/photos\/v1\/([0-9a-f-]{36})$/.exec(storageKey);
  if (match?.[1] === undefined) return null;
  const result = z.uuid().safeParse(match[1]);
  if (!result.success || photoQuarantineObjectKey(result.data) !== storageKey) return null;
  return result.data;
}

export function createDrizzlePrivateMediaRetentionCandidateReader(
  database: CryptoPayMapDatabase,
): PrivateMediaRetentionCandidateReader {
  return {
    async loadCandidates(cutoffs, limit) {
      const completedReceipt = notExists(
        database
          .select({ value: sql<number>`1` })
          .from(submissionRetentionItems)
          .where(
            and(
              eq(submissionRetentionItems.referenceType, 'media_asset'),
              eq(submissionRetentionItems.referenceId, mediaAssets.id),
              or(
                and(
                  eq(mediaAssets.purpose, 'evidence'),
                  eq(submissionRetentionItems.policy, 'private_evidence_media_180d'),
                ),
                and(
                  eq(mediaAssets.purpose, 'owner_verification'),
                  eq(submissionRetentionItems.policy, 'owner_verification_media_90d'),
                ),
              ),
            ),
          ),
      );
      const rows = await database
        .select({
          mediaAssetId: mediaAssets.id,
          purpose: mediaAssets.purpose,
          updatedAt: mediaAssets.updatedAt,
          directSubmissionId: mediaAssets.submissionId,
          evidenceSubmissionId: evidence.submissionId,
        })
        .from(mediaAssets)
        .leftJoin(evidence, eq(evidence.id, mediaAssets.evidenceId))
        .where(
          and(
            inArray(mediaAssets.purpose, ['evidence', 'owner_verification']),
            inArray(mediaAssets.reviewStatus, ['accepted', 'rejected', 'superseded']),
            inArray(mediaAssets.visibility, ['private', 'restricted']),
            isNull(mediaAssets.deletedAt),
            or(
              and(
                eq(mediaAssets.purpose, 'evidence'),
                lte(mediaAssets.updatedAt, cutoffs.evidenceBefore),
              ),
              and(
                eq(mediaAssets.purpose, 'owner_verification'),
                lte(mediaAssets.updatedAt, cutoffs.ownerVerificationBefore),
              ),
            ),
            completedReceipt,
          ),
        )
        .orderBy(asc(mediaAssets.updatedAt), asc(mediaAssets.id))
        .limit(limit + 1);

      const selected = rows.slice(0, limit);
      if (selected.length === 0) {
        return { candidates: [], hasMore: rows.length > limit };
      }

      const mediaIds = selected.map((row) => row.mediaAssetId);
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
      const reservationIds = new Set<string>();
      for (const file of fileRows) {
        const current = filesByMedia.get(file.mediaAssetId) ?? [];
        current.push(file);
        filesByMedia.set(file.mediaAssetId, current);
        if (file.storageScope === 'quarantine') {
          const reservationId = reservationIdFromKey(file.storageKey);
          if (reservationId === null) {
            throw new Error('Private Media retention found a non-canonical quarantine key.');
          }
          reservationIds.add(reservationId);
        }
      }

      const reservationRows =
        reservationIds.size === 0
          ? []
          : await database
              .select({
                id: quarantineUploadReservations.id,
                purpose: quarantineUploadReservations.purpose,
                consumedBySubmissionId: quarantineUploadReservations.consumedBySubmissionId,
              })
              .from(quarantineUploadReservations)
              .where(inArray(quarantineUploadReservations.id, [...reservationIds]));
      const reservationById = new Map(reservationRows.map((row) => [row.id, row]));

      const candidates: PrivateMediaRetentionCandidate[] = selected.map((row) => {
        const files = filesByMedia.get(row.mediaAssetId) ?? [];
        if (files.length === 0) {
          throw new Error('Private Media retention found an eligible Media Asset without objects.');
        }
        const submissionId = row.directSubmissionId ?? row.evidenceSubmissionId;
        const expectedReservationPurpose =
          row.purpose === 'evidence' ? 'evidence_image' : 'owner_verification_proof';
        const objects = files.map((file) => {
          if (file.storageScope === 'quarantine') {
            if (file.variant !== 'original') {
              throw new Error('Quarantine retention selected a non-original Media File.');
            }
            const reservationId = reservationIdFromKey(file.storageKey);
            const reservation =
              reservationId === null ? undefined : reservationById.get(reservationId);
            if (
              reservationId === null ||
              reservation === undefined ||
              reservation.purpose !== expectedReservationPurpose ||
              (submissionId !== null &&
                reservation.consumedBySubmissionId !== null &&
                reservation.consumedBySubmissionId !== submissionId)
            ) {
              throw new Error(
                'Private Media retention could not bind the original object to its reservation.',
              );
            }
            return {
              objectRefId: file.id,
              reservationId,
              mediaAssetId: row.mediaAssetId,
              mediaFileId: file.id,
              variant: 'original' as const,
              storageScope: 'quarantine' as const,
              storageKey: file.storageKey,
              mimeType: file.mimeType,
              contentHash: file.contentHash,
            };
          }
          if (file.variant === 'original') {
            throw new Error('Private retention selected an original outside quarantine.');
          }
          return {
            objectRefId: file.id,
            reservationId: null,
            mediaAssetId: row.mediaAssetId,
            mediaFileId: file.id,
            variant: file.variant,
            storageScope: 'private' as const,
            storageKey: file.storageKey,
            mimeType: file.mimeType,
            contentHash: file.contentHash,
          };
        });
        return {
          referenceType: 'media_asset' as const,
          referenceId: row.mediaAssetId,
          reason:
            row.purpose === 'evidence'
              ? 'private_evidence_media_180d'
              : 'owner_verification_media_90d',
          eligibleAt: row.updatedAt.toISOString(),
          submissionId,
          mediaAssetId: row.mediaAssetId,
          objects,
        };
      });
      return { candidates, hasMore: rows.length > limit };
    },
  };
}
