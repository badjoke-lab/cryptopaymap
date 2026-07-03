import { and, eq, isNull, ne } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { mediaAssets, mediaFiles, mediaReviewDecisions } from '../../db/schema';
import {
  MediaReviewDecisionError,
  type MediaReviewDecisionCommand,
  type MediaReviewDecisionReceipt,
  type MediaReviewFileSnapshot,
  type MediaReviewSubject,
} from './decision';

export interface ProjectedMediaAsset {
  reviewStatus: MediaReviewDecisionReceipt['reviewStatus'];
  purpose: MediaReviewDecisionReceipt['purpose'];
  rightsStatus: MediaReviewDecisionReceipt['rightsStatus'];
  visibility: MediaReviewDecisionReceipt['visibility'];
  licenseId: string | null;
  rightsHolder: string | null;
  consentReference: string | null;
  attribution: string | null;
  altText: string | null;
  displayOrder: number;
  publishedAt: Date | null;
  updatedAt: Date;
}

export interface ProjectedMediaReviewDecision {
  asset: ProjectedMediaAsset;
  receipt: MediaReviewDecisionReceipt;
}

function sortedFiles(files: readonly MediaReviewFileSnapshot[]): MediaReviewFileSnapshot[] {
  return [...files].sort((left, right) => left.id.localeCompare(right.id));
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
  throw new MediaReviewDecisionError(
    'backend_failure',
    'The durable Media asset does not have a reviewable subject.',
  );
}

function subjectMatches(left: MediaReviewSubject, right: MediaReviewSubject): boolean {
  return left.type === right.type && left.id === right.id;
}

function subjectCondition(subject: MediaReviewSubject) {
  switch (subject.type) {
    case 'entity':
      return eq(mediaAssets.entityId, subject.id);
    case 'location':
      return eq(mediaAssets.locationId, subject.id);
    case 'claim':
      return eq(mediaAssets.claimId, subject.id);
    case 'evidence':
      return eq(mediaAssets.evidenceId, subject.id);
    case 'submission':
      return eq(mediaAssets.submissionId, subject.id);
    case 'source_record':
      return eq(mediaAssets.sourceRecordId, subject.id);
  }
}

export async function readMediaReviewDecision(database: CryptoPayMapDatabase, requestId: string) {
  const rows = await database
    .select({
      requestId: mediaReviewDecisions.requestId,
      mediaAssetId: mediaReviewDecisions.mediaAssetId,
      action: mediaReviewDecisions.action,
      reviewStatus: mediaReviewDecisions.toReviewStatus,
      purpose: mediaReviewDecisions.toPurpose,
      rightsStatus: mediaReviewDecisions.toRightsStatus,
      visibility: mediaReviewDecisions.toVisibility,
      decidedAt: mediaReviewDecisions.decidedAt,
      publicFileIds: mediaReviewDecisions.publicFileIds,
      requestFingerprint: mediaReviewDecisions.requestFingerprint,
    })
    .from(mediaReviewDecisions)
    .where(eq(mediaReviewDecisions.requestId, requestId))
    .limit(1);
  return rows[0] ?? null;
}

export function replayMediaReviewDecision(
  row: NonNullable<Awaited<ReturnType<typeof readMediaReviewDecision>>>,
): MediaReviewDecisionReceipt {
  return {
    requestId: row.requestId,
    mediaAssetId: row.mediaAssetId,
    action: row.action,
    reviewStatus: row.reviewStatus,
    purpose: row.purpose,
    rightsStatus: row.rightsStatus,
    visibility: row.visibility,
    decidedAt: row.decidedAt.toISOString(),
    publicFileIds: [...row.publicFileIds].sort((left, right) => left.localeCompare(right)),
    state: 'replayed',
  };
}

export async function projectMediaReviewDecision(
  database: CryptoPayMapDatabase,
  command: MediaReviewDecisionCommand,
): Promise<ProjectedMediaReviewDecision> {
  const assetRows = await database
    .select({
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
      licenseId: mediaAssets.licenseId,
      attribution: mediaAssets.attribution,
      altText: mediaAssets.altText,
      rightsHolder: mediaAssets.rightsHolder,
      consentReference: mediaAssets.consentReference,
      displayOrder: mediaAssets.displayOrder,
      publishedAt: mediaAssets.publishedAt,
      updatedAt: mediaAssets.updatedAt,
      deletedAt: mediaAssets.deletedAt,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, command.mediaAssetId))
    .limit(1);
  const current = assetRows[0];
  if (current === undefined || current.deletedAt !== null) {
    throw new MediaReviewDecisionError('not_found', 'The Media asset was not found.');
  }

  const currentSubject = subjectFromRow(current);
  if (
    current.updatedAt.toISOString() !== command.expectedMediaUpdatedAt.toISOString() ||
    current.reviewStatus !== command.expectedReviewStatus ||
    current.purpose !== command.expectedPurpose ||
    current.role !== command.expectedRole ||
    current.rightsStatus !== command.expectedRightsStatus ||
    current.visibility !== command.expectedVisibility ||
    !subjectMatches(currentSubject, command.expectedSubject)
  ) {
    throw new MediaReviewDecisionError('conflict', 'The Media asset changed before review.');
  }

  const fileRows = await database
    .select({
      id: mediaFiles.id,
      variant: mediaFiles.variant,
      storageScope: mediaFiles.storageScope,
      storageKey: mediaFiles.storageKey,
      mimeType: mediaFiles.mimeType,
      contentHash: mediaFiles.contentHash,
      width: mediaFiles.width,
      height: mediaFiles.height,
    })
    .from(mediaFiles)
    .where(eq(mediaFiles.mediaAssetId, command.mediaAssetId));
  const currentFiles = sortedFiles(fileRows);
  if (JSON.stringify(currentFiles) !== JSON.stringify(sortedFiles(command.expectedFiles))) {
    throw new MediaReviewDecisionError('conflict', 'The Media file set changed before review.');
  }

  if (command.action === 'approve_public' && command.expectedRole === 'cover') {
    const coverRows = await database
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(
        and(
          ne(mediaAssets.id, command.mediaAssetId),
          subjectCondition(command.expectedSubject),
          eq(mediaAssets.role, 'cover'),
          eq(mediaAssets.reviewStatus, 'accepted'),
          eq(mediaAssets.visibility, 'public'),
          isNull(mediaAssets.deletedAt),
        ),
      )
      .limit(1);
    if (coverRows.length > 0) {
      throw new MediaReviewDecisionError(
        'conflict',
        'The reviewed subject already has an active public cover.',
      );
    }
  }

  const asset: ProjectedMediaAsset = {
    reviewStatus: current.reviewStatus,
    purpose: current.purpose,
    rightsStatus: current.rightsStatus,
    visibility: current.visibility,
    licenseId: current.licenseId,
    rightsHolder: current.rightsHolder,
    consentReference: current.consentReference,
    attribution: current.attribution,
    altText: current.altText,
    displayOrder: current.displayOrder,
    publishedAt: current.publishedAt,
    updatedAt: command.decidedAt,
  };

  if (command.action === 'approve_private') {
    asset.reviewStatus = 'accepted';
    asset.visibility = 'private';
  } else if (command.action === 'approve_public') {
    const rights = command.rightsDecision;
    if (rights === null) {
      throw new MediaReviewDecisionError(
        'invalid_decision',
        'Public Media approval requires a rights decision.',
      );
    }
    asset.reviewStatus = 'accepted';
    asset.purpose =
      current.purpose === 'public_gallery_candidate' ? 'public_gallery' : current.purpose;
    asset.rightsStatus = rights.status;
    asset.visibility = 'public';
    asset.licenseId = rights.licenseId;
    asset.rightsHolder = rights.rightsHolder;
    asset.consentReference = rights.consentReference;
    asset.attribution = rights.attribution;
    asset.altText = command.altText;
    asset.displayOrder = command.displayOrder ?? 0;
    asset.publishedAt = command.decidedAt;
  } else if (command.action === 'reject') {
    asset.reviewStatus = 'rejected';
    asset.visibility = 'private';
  } else if (command.action === 'restrict') {
    asset.reviewStatus = 'accepted';
    asset.visibility = 'restricted';
  } else {
    asset.reviewStatus = 'superseded';
    asset.visibility = 'restricted';
  }

  const publicFileIds =
    command.action === 'approve_public'
      ? [command.publicDisplayFileId, command.publicThumbnailFileId]
          .filter((value): value is string => value !== null)
          .sort((left, right) => left.localeCompare(right))
      : command.action === 'restrict' || command.action === 'supersede'
        ? currentFiles
            .filter((file) => file.storageScope === 'public')
            .map((file) => file.id)
            .sort((left, right) => left.localeCompare(right))
        : [];

  return {
    asset,
    receipt: {
      requestId: command.requestId,
      mediaAssetId: command.mediaAssetId,
      action: command.action,
      reviewStatus: asset.reviewStatus,
      purpose: asset.purpose,
      rightsStatus: asset.rightsStatus,
      visibility: asset.visibility,
      decidedAt: command.decidedAt.toISOString(),
      publicFileIds,
      state: 'committed',
    },
  };
}
