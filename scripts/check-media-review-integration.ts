import {
  createMediaReviewDecisionService,
  MediaReviewDecisionError,
  type MediaReviewDecisionBackend,
  type MediaReviewDecisionCommand,
  type MediaReviewDecisionInput,
  type MediaReviewDecisionReceipt,
} from '../src/admin/media-review/decision';
import { InMemoryMediaStorage } from '../src/admin/media-review/in-memory-storage';
import { createStorageAwareMediaReviewBackend } from '../src/admin/media-review/storage-backend';
import type { MediaFileTransition } from '../src/admin/media-review/storage-contract';
import {
  privateMediaDerivativeKey,
  publicMediaDerivativeKey,
} from '../src/admin/media-review/storage-plan';
import { availableMediaReviewActions } from '../src/admin/media-review/ui-actions';
import {
  loadMediaReviewDetail,
  loadMediaReviewQueue,
  type MediaReviewDetailResponse,
  type MediaReviewReadContext,
  type MediaReviewWorkspaceBackend,
} from '../src/admin/media-review/workspace';

const approvalRequestId = '10000000-0000-4000-8000-000000000001';
const restrictionRequestId = '10000000-0000-4000-8000-000000000002';
const mediaAssetId = '20000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const displayFileId = '40000000-0000-4000-8000-000000000001';
const thumbnailFileId = '40000000-0000-4000-8000-000000000002';
const reviewedAt = '2026-07-03T00:00:00.000Z';
const approvalTime = '2026-07-03T01:00:00.000Z';
const restrictionTime = '2026-07-03T02:00:00.000Z';
const displayHash = '0'.repeat(64);
const thumbnailHash = '1'.repeat(64);

const displayFile = {
  id: displayFileId,
  variant: 'display' as const,
  storageScope: 'private' as const,
  storageKey: '',
  mimeType: 'image/webp',
  contentHash: displayHash,
  width: 960,
  height: 540,
};
displayFile.storageKey = privateMediaDerivativeKey(mediaAssetId, displayFile);

const thumbnailFile = {
  id: thumbnailFileId,
  variant: 'thumbnail' as const,
  storageScope: 'private' as const,
  storageKey: '',
  mimeType: 'image/webp',
  contentHash: thumbnailHash,
  width: 160,
  height: 160,
};
thumbnailFile.storageKey = privateMediaDerivativeKey(mediaAssetId, thumbnailFile);

const detail: MediaReviewDetailResponse = {
  generatedAt: approvalTime,
  media: {
    id: mediaAssetId,
    purpose: 'public_gallery_candidate',
    role: 'cover',
    reviewStatus: 'pending',
    rightsStatus: 'unknown',
    visibility: 'private',
    subject: { type: 'entity', id: entityId },
    altText: null,
    displayOrder: 0,
    fileCount: 2,
    licenseId: null,
    attribution: null,
    rightsHolder: null,
    consentReference: null,
    capturedAt: null,
    publishedAt: null,
    createdAt: reviewedAt,
    updatedAt: reviewedAt,
  },
  files: [
    {
      ...displayFile,
      originalFilename: null,
      byteSize: 120_000,
      createdAt: reviewedAt,
    },
    {
      ...thumbnailFile,
      originalFilename: null,
      byteSize: 12_000,
      createdAt: reviewedAt,
    },
  ],
};

const readContext: MediaReviewReadContext = {
  actorId: 'system:media-integration-check',
  actorType: 'system',
  capabilities: ['media:review'],
};
const workspace: MediaReviewWorkspaceBackend = {
  async loadQueue() {
    return {
      items: [
        {
          id: detail.media.id,
          purpose: detail.media.purpose,
          role: detail.media.role,
          reviewStatus: detail.media.reviewStatus,
          rightsStatus: detail.media.rightsStatus,
          visibility: detail.media.visibility,
          subject: detail.media.subject,
          altText: detail.media.altText,
          displayOrder: detail.media.displayOrder,
          fileCount: detail.media.fileCount,
          updatedAt: detail.media.updatedAt,
        },
      ],
      hasMore: false,
    };
  },
  async loadDetail() {
    return detail;
  },
};

class ReplayDecisionBackend implements MediaReviewDecisionBackend {
  readonly commands: MediaReviewDecisionCommand[] = [];
  private readonly requests = new Map<
    string,
    { fingerprint: string; receipt: MediaReviewDecisionReceipt }
  >();

  async commitDecision(command: MediaReviewDecisionCommand): Promise<MediaReviewDecisionReceipt> {
    this.commands.push(command);
    const existing = this.requests.get(command.requestId);
    if (existing !== undefined) {
      if (existing.fingerprint !== command.requestFingerprint) {
        throw new MediaReviewDecisionError(
          'conflict',
          'The Media integration request identity was reused with different content.',
        );
      }
      return { ...existing.receipt, state: 'replayed' };
    }

    const receipt: MediaReviewDecisionReceipt = {
      requestId: command.requestId,
      mediaAssetId: command.mediaAssetId,
      action: command.action,
      reviewStatus: command.action === 'restrict' ? 'accepted' : 'accepted',
      purpose:
        command.action === 'approve_public' &&
        command.expectedPurpose === 'public_gallery_candidate'
          ? 'public_gallery'
          : command.expectedPurpose,
      rightsStatus: command.rightsDecision?.status ?? command.expectedRightsStatus,
      visibility: command.action === 'approve_public' ? 'public' : 'restricted',
      decidedAt: command.decidedAt.toISOString(),
      publicFileIds: command.expectedFiles
        .filter((file) => file.variant === 'display' || file.variant === 'thumbnail')
        .map((file) => file.id),
      state: 'committed',
    };
    this.requests.set(command.requestId, {
      fingerprint: command.requestFingerprint,
      receipt,
    });
    return receipt;
  }
}

const loadedQueue = await loadMediaReviewQueue(
  readContext,
  workspace,
  { reviewStatus: 'pending', limit: 25 },
  new Date(approvalTime),
);
const loadedDetail = await loadMediaReviewDetail(
  readContext,
  workspace,
  mediaAssetId,
  new Date(approvalTime),
);

const storage = new InMemoryMediaStorage({
  privateObjects: [
    {
      key: displayFile.storageKey,
      mimeType: 'image/webp',
      contentHash: displayHash,
      byteSize: 120_000,
    },
    {
      key: thumbnailFile.storageKey,
      mimeType: 'image/webp',
      contentHash: thumbnailHash,
      byteSize: 12_000,
    },
  ],
});
const decisionBackend = new ReplayDecisionBackend();
const service = createMediaReviewDecisionService(
  createStorageAwareMediaReviewBackend(decisionBackend, storage),
);

const approvalInput: MediaReviewDecisionInput = {
  mediaAssetId,
  expectedMediaUpdatedAt: loadedDetail.media.updatedAt,
  expectedReviewStatus: loadedDetail.media.reviewStatus,
  expectedPurpose: loadedDetail.media.purpose,
  expectedRole: loadedDetail.media.role,
  expectedRightsStatus: loadedDetail.media.rightsStatus,
  expectedVisibility: loadedDetail.media.visibility,
  expectedSubject: loadedDetail.media.subject,
  expectedFiles: loadedDetail.files.map((file) => ({
    id: file.id,
    variant: file.variant,
    storageScope: file.storageScope,
    storageKey: file.storageKey,
    mimeType: file.mimeType,
    contentHash: file.contentHash,
    width: file.width,
    height: file.height,
  })),
  decidedAt: approvalTime,
  action: 'approve_public',
  targetMatch: 'confirmed',
  privacyReview: 'cleared',
  rightsDecision: {
    status: 'submitted_with_permission',
    licenseId: null,
    rightsHolder: 'Example Merchant',
    consentReference: null,
    attribution: null,
    licenseAttributionRequired: null,
  },
  altText: 'Exterior of Example Merchant.',
  displayOrder: 0,
  publicDisplayFileId: displayFileId,
  publicThumbnailFileId: thumbnailFileId,
  reasonCode: 'approved_for_public_gallery',
  publicSummary: 'Approved for the public gallery.',
  internalNote: null,
};
const approvalContext = {
  requestId: approvalRequestId,
  actorId: readContext.actorId,
  actorType: readContext.actorType,
  capabilities: ['media:review' as const],
};
const approval = await service.decide(approvalContext, approvalInput);
const replay = await service.decide(approvalContext, approvalInput);

const publicFiles = [displayFile, thumbnailFile].map((file) => ({
  ...file,
  storageScope: 'public' as const,
  storageKey: publicMediaDerivativeKey(mediaAssetId, file),
}));
const restrictionInput: MediaReviewDecisionInput = {
  ...approvalInput,
  expectedMediaUpdatedAt: approvalTime,
  expectedReviewStatus: 'accepted',
  expectedPurpose: 'public_gallery',
  expectedRightsStatus: 'submitted_with_permission',
  expectedVisibility: 'public',
  expectedFiles: publicFiles,
  decidedAt: restrictionTime,
  action: 'restrict',
  privacyReview: 'blocked',
  rightsDecision: null,
  altText: null,
  displayOrder: null,
  publicDisplayFileId: null,
  publicThumbnailFileId: null,
  reasonCode: 'urgent_privacy_restriction',
  publicSummary: 'Media access was restricted.',
};
const restriction = await service.decide(
  { ...approvalContext, requestId: restrictionRequestId },
  restrictionInput,
);

const approvalTransitions = (
  decisionBackend.commands[0] as MediaReviewDecisionCommand & {
    fileTransitions?: MediaFileTransition[];
  }
).fileTransitions;
const restrictionTransitions = (
  decisionBackend.commands[2] as MediaReviewDecisionCommand & {
    fileTransitions?: MediaFileTransition[];
  }
).fileTransitions;

if (
  loadedQueue.items[0]?.id !== mediaAssetId ||
  availableMediaReviewActions(loadedDetail.media).join(',') !== 'approve_public,reject' ||
  approval.visibility !== 'public' ||
  replay.state !== 'replayed' ||
  approvalTransitions?.length !== 2 ||
  restriction.visibility !== 'restricted' ||
  restrictionTransitions?.length !== 2 ||
  storage.snapshot().publicObjects.length !== 0
) {
  throw new Error('Media review integration check produced an invalid result.');
}

console.log('Media review integration checks passed.');
