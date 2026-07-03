import { describe, expect, it, vi } from 'vitest';
import { createMediaDetailGetHandler } from '../functions/admin/api/media-detail';
import type { MediaReviewDetailResponse } from '../src/admin/media-review/workspace';

const identity = {
  actorId: 'cloudflare-access:media-reviewer',
  actorType: 'human' as const,
  subject: 'media-reviewer',
  email: 'reviewer@example.test',
};
const mediaAssetId = '20000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const fileId = '40000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-03T02:00:00.000Z');

function detail(): MediaReviewDetailResponse {
  return {
    generatedAt: now.toISOString(),
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
      fileCount: 1,
      licenseId: null,
      attribution: null,
      rightsHolder: null,
      consentReference: null,
      capturedAt: null,
      publishedAt: null,
      createdAt: '2026-07-03T00:00:00.000Z',
      updatedAt: '2026-07-03T01:00:00.000Z',
    },
    files: [
      {
        id: fileId,
        variant: 'display',
        storageScope: 'private',
        storageKey: 'media/private/example.webp',
        originalFilename: null,
        mimeType: 'image/webp',
        byteSize: 1024,
        width: 960,
        height: 540,
        contentHash: '0'.repeat(64),
        createdAt: '2026-07-03T00:00:00.000Z',
      },
    ],
  };
}

function context(overrides: { identity?: unknown; actorIds?: string; id?: string } = {}) {
  const id = overrides.id ?? mediaAssetId;
  return {
    request: new Request(`https://example.test/admin/api/media-detail?mediaAssetId=${id}`),
    env: {
      CPM_ADMIN_MEDIA_REVIEW_ACTOR_IDS: overrides.actorIds ?? JSON.stringify([identity.actorId]),
    },
    params: {},
    data: {
      adminIdentity: overrides.identity === undefined ? identity : overrides.identity,
    },
    waitUntil: vi.fn(),
  };
}

describe('protected Media detail endpoint', () => {
  it('returns version-pinned Media metadata and files', async () => {
    const loadDetail = vi.fn(async () => detail());
    const response = await createMediaDetailGetHandler({ loadDetail, now: () => now })(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual(detail());
    expect(loadDetail).toHaveBeenCalledWith(
      expect.objectContaining({ capabilities: ['media:review'] }),
      mediaAssetId,
      expect.any(Object),
      now,
    );
  });

  it('rejects a missing Media identifier', async () => {
    const loadDetail = vi.fn(async () => detail());
    const requestContext = context();
    requestContext.request = new Request('https://example.test/admin/api/media-detail');
    const response = await createMediaDetailGetHandler({ loadDetail })(requestContext);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'media_detail_invalid_id' });
    expect(loadDetail).not.toHaveBeenCalled();
  });

  it('denies an unauthorized actor before loading files', async () => {
    const loadDetail = vi.fn(async () => detail());
    const response = await createMediaDetailGetHandler({ loadDetail })(
      context({ actorIds: JSON.stringify(['another-actor']) }),
    );

    expect(response.status).toBe(403);
    expect(loadDetail).not.toHaveBeenCalled();
  });
});
