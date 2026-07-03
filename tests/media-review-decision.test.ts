import { describe, expect, it, vi } from 'vitest';
import {
  authorizeMediaReview,
  MediaReviewAuthorizationError,
} from '../src/admin/media-review/authorization';
import {
  createMediaReviewDecisionService,
  MediaReviewDecisionError,
  mediaReviewDecisionInputSchema,
  type MediaReviewDecisionBackend,
  type MediaReviewDecisionCommand,
  type MediaReviewDecisionInput,
  type MediaReviewDecisionReceipt,
} from '../src/admin/media-review/decision';

const requestId = '10000000-0000-4000-8000-000000000001';
const mediaAssetId = '20000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const displayFileId = '40000000-0000-4000-8000-000000000001';
const thumbnailFileId = '40000000-0000-4000-8000-000000000002';
const updatedAt = '2026-07-03T00:00:00.000Z';
const decidedAt = '2026-07-03T01:00:00.000Z';
const hash = '0'.repeat(64);

function publicInput(): MediaReviewDecisionInput {
  return {
    mediaAssetId,
    expectedMediaUpdatedAt: updatedAt,
    expectedReviewStatus: 'pending',
    expectedPurpose: 'public_gallery_candidate',
    expectedRole: 'cover',
    expectedRightsStatus: 'unknown',
    expectedVisibility: 'private',
    expectedSubject: { type: 'entity', id: entityId },
    expectedFiles: [
      {
        id: displayFileId,
        variant: 'display',
        storageScope: 'public',
        storageKey: 'media/public/display.webp',
        mimeType: 'image/webp',
        contentHash: hash,
        width: 960,
        height: 540,
      },
      {
        id: thumbnailFileId,
        variant: 'thumbnail',
        storageScope: 'public',
        storageKey: 'media/public/thumbnail.webp',
        mimeType: 'image/webp',
        contentHash: hash,
        width: 160,
        height: 160,
      },
    ],
    decidedAt,
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
}

class ReplayBackend implements MediaReviewDecisionBackend {
  private readonly requests = new Map<
    string,
    { fingerprint: string; receipt: MediaReviewDecisionReceipt }
  >();

  async commitDecision(command: MediaReviewDecisionCommand): Promise<MediaReviewDecisionReceipt> {
    const existing = this.requests.get(command.requestId);
    if (existing !== undefined) {
      if (existing.fingerprint !== command.requestFingerprint) {
        throw new MediaReviewDecisionError(
          'conflict',
          'The media review request ID was reused with different content.',
        );
      }
      return { ...existing.receipt, state: 'replayed' };
    }
    const receipt: MediaReviewDecisionReceipt = {
      requestId: command.requestId,
      mediaAssetId: command.mediaAssetId,
      action: command.action,
      reviewStatus: command.action === 'reject' ? 'rejected' : 'accepted',
      purpose:
        command.action === 'approve_public' && command.expectedPurpose === 'public_gallery_candidate'
          ? 'public_gallery'
          : command.expectedPurpose,
      rightsStatus: command.rightsDecision?.status ?? command.expectedRightsStatus,
      visibility:
        command.action === 'approve_public'
          ? 'public'
          : command.action === 'restrict' || command.action === 'supersede'
            ? 'restricted'
            : 'private',
      decidedAt: command.decidedAt.toISOString(),
      publicFileIds:
        command.action === 'approve_public'
          ? [command.publicDisplayFileId, command.publicThumbnailFileId].filter(
              (id): id is string => id !== null,
            )
          : [],
      state: 'committed',
    };
    this.requests.set(command.requestId, {
      fingerprint: command.requestFingerprint,
      receipt,
    });
    return receipt;
  }
}

const context = {
  requestId,
  actorId: 'cloudflare-access:reviewer',
  actorType: 'human' as const,
  capabilities: ['media:review'] as const,
};

describe('media review decision contract', () => {
  it('creates a replayable public approval command with exact files', async () => {
    const backend = new ReplayBackend();
    const service = createMediaReviewDecisionService(backend);

    const first = await service.decide(context, publicInput());
    const replay = await service.decide(context, publicInput());

    expect(first).toMatchObject({
      reviewStatus: 'accepted',
      purpose: 'public_gallery',
      rightsStatus: 'submitted_with_permission',
      visibility: 'public',
      state: 'committed',
    });
    expect(replay.state).toBe('replayed');
    expect(replay.publicFileIds).toEqual([displayFileId, thumbnailFileId]);
  });

  it('rejects public approval without publishable rights and a public display derivative', () => {
    const input = publicInput();
    input.rightsDecision = null;
    input.publicDisplayFileId = null;
    input.altText = null;

    const result = mediaReviewDecisionInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('keeps evidence and owner proof on the private approval path', () => {
    const input = publicInput();
    input.action = 'approve_private';
    input.expectedPurpose = 'evidence';
    input.expectedRole = 'evidence_image';
    input.expectedFiles = [];
    input.privacyReview = 'private_only';
    input.rightsDecision = null;
    input.altText = null;
    input.displayOrder = null;
    input.publicDisplayFileId = null;
    input.publicThumbnailFileId = null;

    expect(mediaReviewDecisionInputSchema.safeParse(input).success).toBe(true);
  });

  it('does not allow evidence media to enter the public approval path', () => {
    const input = publicInput();
    input.expectedPurpose = 'evidence';
    input.expectedRole = 'evidence_image';

    expect(mediaReviewDecisionInputSchema.safeParse(input).success).toBe(false);
  });

  it('allows urgent restriction only for accepted public media', () => {
    const input = publicInput();
    input.action = 'restrict';
    input.expectedPurpose = 'public_gallery';
    input.expectedReviewStatus = 'accepted';
    input.expectedVisibility = 'public';
    input.rightsDecision = null;
    input.altText = null;
    input.displayOrder = null;
    input.publicDisplayFileId = null;
    input.publicThumbnailFileId = null;
    input.privacyReview = 'blocked';
    input.reasonCode = 'urgent_privacy_restriction';

    expect(mediaReviewDecisionInputSchema.safeParse(input).success).toBe(true);
    input.expectedVisibility = 'private';
    expect(mediaReviewDecisionInputSchema.safeParse(input).success).toBe(false);
  });

  it('rejects duplicate expected file variants', () => {
    const input = publicInput();
    input.expectedFiles[1] = {
      ...input.expectedFiles[1],
      variant: 'display',
    };

    expect(mediaReviewDecisionInputSchema.safeParse(input).success).toBe(false);
  });

  it('isolates media review authorization and idempotency keys', () => {
    const identity = {
      actorId: 'cloudflare-access:reviewer',
      actorType: 'human' as const,
      subject: 'reviewer',
      email: 'reviewer@example.com',
    };
    expect(
      authorizeMediaReview(
        identity,
        { configured: true, allowedActorIds: new Set([identity.actorId]) },
        requestId,
      ),
    ).toMatchObject({ capabilities: ['media:review'] });
    expect(() =>
      authorizeMediaReview(
        identity,
        { configured: true, allowedActorIds: new Set(['another-actor']) },
        requestId,
      ),
    ).toThrow(MediaReviewAuthorizationError);
  });

  it('wraps unexpected backend failures without losing contract errors', async () => {
    const backend: MediaReviewDecisionBackend = {
      commitDecision: vi.fn(async () => {
        throw new Error('database unavailable');
      }),
    };
    await expect(
      createMediaReviewDecisionService(backend).decide(context, publicInput()),
    ).rejects.toMatchObject({ code: 'backend_failure' });
  });
});
