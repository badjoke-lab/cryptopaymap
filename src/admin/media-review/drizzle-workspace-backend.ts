import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { mediaAssets, mediaFiles } from '../../db/schema';
import type { MediaReviewSubject } from './decision';
import {
  MAX_MEDIA_DUPLICATE_MATCHES,
  projectMediaDuplicateSignals,
} from './duplicate-signals';
import type {
  MediaReviewDetailResponse,
  MediaReviewQueueItem,
  MediaReviewQueueQuery,
  MediaReviewWorkspaceBackend,
} from './workspace';

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function subjectFromRow(row: {
  entityId: string | null;
  locationId: string | null;
  claimId: string | null;
  evidenceId: string | null;
  submissionId: string | null;
  sourceRecordId: string | null;
}): MediaReviewSubject {
  if (row.entityId !== null) return { type: 'entity', id: row.entityId };
  if (row.locationId !== null) return { type: 'location', id: row.locationId };
  if (row.claimId !== null) return { type: 'claim', id: row.claimId };
  if (row.evidenceId !== null) return { type: 'evidence', id: row.evidenceId };
  if (row.submissionId !== null) return { type: 'submission', id: row.submissionId };
  if (row.sourceRecordId !== null) return { type: 'source_record', id: row.sourceRecordId };
  throw new Error('Media asset subject is missing.');
}

const mediaSelection = {
  id: mediaAssets.id,
  purpose: mediaAssets.purpose,
  role: mediaAssets.role,
  reviewStatus: mediaAssets.reviewStatus,
  rightsStatus: mediaAssets.rightsStatus,
  visibility: mediaAssets.visibility,
  entityId: mediaAssets.entityId,
  locationId: mediaAssets.locationId,
  claimId: mediaAssets.claimId,
  evidenceId: mediaAssets.evidenceId,
  submissionId: mediaAssets.submissionId,
  sourceRecordId: mediaAssets.sourceRecordId,
  altText: mediaAssets.altText,
  displayOrder: mediaAssets.displayOrder,
  updatedAt: mediaAssets.updatedAt,
};

export function createDrizzleMediaReviewWorkspaceBackend(
  database: CryptoPayMapDatabase,
): MediaReviewWorkspaceBackend {
  return {
    async loadQueue(query: MediaReviewQueueQuery) {
      const conditions = [
        isNull(mediaAssets.deletedAt),
        eq(mediaAssets.reviewStatus, query.reviewStatus),
      ];
      if (query.purpose !== undefined) conditions.push(eq(mediaAssets.purpose, query.purpose));
      if (query.role !== undefined) conditions.push(eq(mediaAssets.role, query.role));
      if (query.rightsStatus !== undefined) {
        conditions.push(eq(mediaAssets.rightsStatus, query.rightsStatus));
      }
      if (query.visibility !== undefined) {
        conditions.push(eq(mediaAssets.visibility, query.visibility));
      }

      const rows = await database
        .select({
          ...mediaSelection,
          fileCount: sql<number>`(
            select count(*)::int
            from ${mediaFiles}
            where ${mediaFiles.mediaAssetId} = ${mediaAssets.id}
          )`,
        })
        .from(mediaAssets)
        .where(and(...conditions))
        .orderBy(desc(mediaAssets.updatedAt), desc(mediaAssets.createdAt), asc(mediaAssets.id))
        .limit(query.limit + 1);

      const items: MediaReviewQueueItem[] = rows.slice(0, query.limit).map((row) => ({
        id: row.id,
        purpose: row.purpose,
        role: row.role,
        reviewStatus: row.reviewStatus,
        rightsStatus: row.rightsStatus,
        visibility: row.visibility,
        subject: subjectFromRow(row),
        altText: row.altText,
        displayOrder: row.displayOrder,
        fileCount: row.fileCount,
        updatedAt: row.updatedAt.toISOString(),
      }));
      return { items, hasMore: rows.length > query.limit };
    },

    async loadDetail(mediaAssetId: string, asOf: Date) {
      const rows = await database
        .select({
          ...mediaSelection,
          licenseId: mediaAssets.licenseId,
          attribution: mediaAssets.attribution,
          rightsHolder: mediaAssets.rightsHolder,
          consentReference: mediaAssets.consentReference,
          capturedAt: mediaAssets.capturedAt,
          publishedAt: mediaAssets.publishedAt,
          createdAt: mediaAssets.createdAt,
        })
        .from(mediaAssets)
        .where(and(eq(mediaAssets.id, mediaAssetId), isNull(mediaAssets.deletedAt)))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;

      const fileRows = await database
        .select({
          id: mediaFiles.id,
          variant: mediaFiles.variant,
          storageScope: mediaFiles.storageScope,
          storageKey: mediaFiles.storageKey,
          originalFilename: mediaFiles.originalFilename,
          mimeType: mediaFiles.mimeType,
          byteSize: mediaFiles.byteSize,
          width: mediaFiles.width,
          height: mediaFiles.height,
          contentHash: mediaFiles.contentHash,
          createdAt: mediaFiles.createdAt,
        })
        .from(mediaFiles)
        .where(eq(mediaFiles.mediaAssetId, mediaAssetId))
        .orderBy(asc(mediaFiles.variant), asc(mediaFiles.id));

      const subject = subjectFromRow(row);
      const originalFile = fileRows.find((file) => file.variant === 'original');
      let duplicateSignals = projectMediaDuplicateSignals(subject, null, []);
      if (originalFile !== undefined) {
        const duplicateRows = await database
          .select({
            mediaAssetId: mediaAssets.id,
            reviewStatus: mediaAssets.reviewStatus,
            visibility: mediaAssets.visibility,
            entityId: mediaAssets.entityId,
            locationId: mediaAssets.locationId,
            claimId: mediaAssets.claimId,
            evidenceId: mediaAssets.evidenceId,
            submissionId: mediaAssets.submissionId,
            sourceRecordId: mediaAssets.sourceRecordId,
            createdAt: mediaAssets.createdAt,
          })
          .from(mediaFiles)
          .innerJoin(mediaAssets, eq(mediaAssets.id, mediaFiles.mediaAssetId))
          .where(
            and(
              eq(mediaFiles.variant, 'original'),
              eq(mediaFiles.contentHash, originalFile.contentHash),
              ne(mediaAssets.id, mediaAssetId),
              isNull(mediaAssets.deletedAt),
            ),
          )
          .orderBy(desc(mediaAssets.createdAt), asc(mediaAssets.id))
          .limit(MAX_MEDIA_DUPLICATE_MATCHES + 1);
        duplicateSignals = projectMediaDuplicateSignals(
          subject,
          originalFile.contentHash,
          duplicateRows.map((duplicate) => ({
            mediaAssetId: duplicate.mediaAssetId,
            subject: subjectFromRow(duplicate),
            reviewStatus: duplicate.reviewStatus,
            visibility: duplicate.visibility,
            createdAt: duplicate.createdAt.toISOString(),
          })),
        );
      }

      const detail: MediaReviewDetailResponse = {
        generatedAt: asOf.toISOString(),
        media: {
          id: row.id,
          purpose: row.purpose,
          role: row.role,
          reviewStatus: row.reviewStatus,
          rightsStatus: row.rightsStatus,
          visibility: row.visibility,
          subject,
          altText: row.altText,
          displayOrder: row.displayOrder,
          fileCount: fileRows.length,
          licenseId: row.licenseId,
          attribution: row.attribution,
          rightsHolder: row.rightsHolder,
          consentReference: row.consentReference,
          capturedAt: iso(row.capturedAt),
          publishedAt: iso(row.publishedAt),
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        },
        files: fileRows.map((file) => ({
          id: file.id,
          variant: file.variant,
          storageScope: file.storageScope,
          storageKey: file.storageKey,
          originalFilename: file.originalFilename,
          mimeType: file.mimeType,
          byteSize: file.byteSize,
          width: file.width,
          height: file.height,
          contentHash: file.contentHash,
          createdAt: file.createdAt.toISOString(),
        })),
        duplicateSignals,
      };
      return detail;
    },
  };
}
