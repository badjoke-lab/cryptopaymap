import { describe, expect, it } from 'vitest';
import { createDrizzleMediaReviewBackend } from '../src/admin/media-review/drizzle-backend';
import { mediaAssetUpdateValues } from '../src/admin/media-review/drizzle-asset-values';
import { isMediaReviewConflictCode } from '../src/admin/media-review/drizzle-errors';
import { replayMediaReviewDecision } from '../src/admin/media-review/drizzle-state';
import { replayMatchingMediaReviewDecision } from '../src/admin/media-review/drizzle-write';
import { MediaReviewDecisionError } from '../src/admin/media-review/decision';
import { mediaReviewDecisions } from '../src/db/schema';

const durableDecision = {
  requestId: '10000000-0000-4000-8000-000000000001',
  mediaAssetId: '20000000-0000-4000-8000-000000000001',
  action: 'approve_public' as const,
  reviewStatus: 'accepted' as const,
  purpose: 'public_gallery' as const,
  rightsStatus: 'licensed' as const,
  visibility: 'public' as const,
  decidedAt: new Date('2026-07-03T00:00:00.000Z'),
  publicFileIds: [
    '40000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000001',
  ],
  requestFingerprint: 'fingerprint',
};

describe('Media review persistence foundation', () => {
  it('exposes durable request, subject, file-set, and outcome columns', () => {
    expect(mediaReviewDecisions.requestId.name).toBe('request_id');
    expect(mediaReviewDecisions.mediaAssetId.name).toBe('media_asset_id');
    expect(mediaReviewDecisions.expectedSubjectType.name).toBe('expected_subject_type');
    expect(mediaReviewDecisions.expectedFiles.name).toBe('expected_files');
    expect(mediaReviewDecisions.toReviewStatus.name).toBe('to_review_status');
    expect(mediaReviewDecisions.publicFileIds.name).toBe('public_file_ids');
    expect(mediaReviewDecisions.requestFingerprint.name).toBe('request_fingerprint');
  });

  it('exports the production backend and conflict classification', () => {
    expect(createDrizzleMediaReviewBackend).toBeTypeOf('function');
    expect(isMediaReviewConflictCode('22012')).toBe(true);
    expect(isMediaReviewConflictCode('23514')).toBe(true);
    expect(isMediaReviewConflictCode('08006')).toBe(false);
  });

  it('replays a durable receipt without changing its result', () => {
    const replay = replayMediaReviewDecision(durableDecision);

    expect(replay.state).toBe('replayed');
    expect(replay.publicFileIds).toEqual([
      '40000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002',
    ]);
  });

  it('recovers a matching concurrent decision and preserves changed-content conflict', () => {
    expect(
      replayMatchingMediaReviewDecision(durableDecision, {
        requestFingerprint: 'fingerprint',
      }),
    ).toMatchObject({ state: 'replayed', requestId: durableDecision.requestId });
    expect(
      replayMatchingMediaReviewDecision(null, {
        requestFingerprint: 'fingerprint',
      }),
    ).toBeNull();
    expect(() =>
      replayMatchingMediaReviewDecision(durableDecision, {
        requestFingerprint: 'changed-fingerprint',
      }),
    ).toThrow(MediaReviewDecisionError);
  });

  it('projects the complete Media asset update payload', () => {
    const decidedAt = new Date('2026-07-03T00:00:00.000Z');
    const values = mediaAssetUpdateValues({
      asset: {
        reviewStatus: 'accepted',
        purpose: 'public_gallery',
        rightsStatus: 'public_domain',
        visibility: 'public',
        licenseId: null,
        rightsHolder: null,
        consentReference: null,
        attribution: null,
        altText: 'Store exterior.',
        displayOrder: 0,
        publishedAt: decidedAt,
        updatedAt: decidedAt,
      },
      receipt: {
        requestId: '10000000-0000-4000-8000-000000000001',
        mediaAssetId: '20000000-0000-4000-8000-000000000001',
        action: 'approve_public',
        reviewStatus: 'accepted',
        purpose: 'public_gallery',
        rightsStatus: 'public_domain',
        visibility: 'public',
        decidedAt: decidedAt.toISOString(),
        publicFileIds: ['40000000-0000-4000-8000-000000000001'],
        state: 'committed',
      },
    });

    expect(values).toMatchObject({
      reviewStatus: 'accepted',
      purpose: 'public_gallery',
      visibility: 'public',
      publishedAt: decidedAt,
      updatedAt: decidedAt,
    });
  });
});
