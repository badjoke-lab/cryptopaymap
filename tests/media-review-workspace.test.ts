import { describe, expect, it } from 'vitest';
import {
  MediaReviewWorkspaceError,
  loadMediaReviewDetail,
  loadMediaReviewQueue,
  parseMediaReviewQueueQuery,
  type MediaReviewDetailResponse,
  type MediaReviewReadContext,
  type MediaReviewWorkspaceBackend,
} from '../src/admin/media-review/workspace';

const mediaAssetId = '20000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const asOf = new Date('2026-07-03T02:00:00.000Z');
const context: MediaReviewReadContext = {
  actorId: 'cloudflare-access:media-reviewer',
  actorType: 'human',
  capabilities: ['media:review'],
};

function detail(): MediaReviewDetailResponse {
  return {
    generatedAt: asOf.toISOString(),
    media: {
      id: mediaAssetId,
      purpose: 'evidence',
      role: 'evidence_image',
      reviewStatus: 'pending',
      rightsStatus: 'unknown',
      visibility: 'private',
      subject: { type: 'entity', id: entityId },
      altText: null,
      displayOrder: 0,
      fileCount: 0,
      licenseId: null,
      attribution: null,
      rightsHolder: null,
      consentReference: null,
      capturedAt: null,
      publishedAt: null,
      createdAt: '2026-07-03T00:00:00.000Z',
      updatedAt: '2026-07-03T01:00:00.000Z',
    },
    files: [],
  };
}

function backend(
  overrides: Partial<MediaReviewWorkspaceBackend> = {},
): MediaReviewWorkspaceBackend {
  return {
    loadQueue: async () => ({ items: [], hasMore: false }),
    loadDetail: async () => detail(),
    ...overrides,
  };
}

describe('Media review workspace contract', () => {
  it('parses bounded queue filters', () => {
    const query = parseMediaReviewQueueQuery(
      new URL(
        'https://example.test/admin/api/media?reviewStatus=pending&purpose=evidence&role=evidence_image&rightsStatus=unknown&visibility=private&limit=50',
      ),
    );

    expect(query).toEqual({
      reviewStatus: 'pending',
      purpose: 'evidence',
      role: 'evidence_image',
      rightsStatus: 'unknown',
      visibility: 'private',
      limit: 50,
    });
  });

  it('rejects an unbounded queue request', () => {
    expect(() =>
      parseMediaReviewQueueQuery(
        new URL('https://example.test/admin/api/media?reviewStatus=pending&limit=101'),
      ),
    ).toThrow(MediaReviewWorkspaceError);
  });

  it('loads a protected queue with generated time', async () => {
    const result = await loadMediaReviewQueue(
      context,
      backend(),
      { reviewStatus: 'pending', limit: 25 },
      asOf,
    );

    expect(result).toEqual({
      generatedAt: asOf.toISOString(),
      query: { reviewStatus: 'pending', limit: 25 },
      items: [],
      hasMore: false,
    });
  });

  it('loads exact Media detail and files', async () => {
    await expect(loadMediaReviewDetail(context, backend(), mediaAssetId, asOf)).resolves.toEqual(
      detail(),
    );
  });

  it('returns not found without fabricating a Media record', async () => {
    await expect(
      loadMediaReviewDetail(context, backend({ loadDetail: async () => null }), mediaAssetId, asOf),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('denies a context without the isolated capability', async () => {
    await expect(
      loadMediaReviewQueue(
        { ...context, capabilities: [] } as MediaReviewReadContext,
        backend(),
        { reviewStatus: 'pending', limit: 25 },
        asOf,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });
});
