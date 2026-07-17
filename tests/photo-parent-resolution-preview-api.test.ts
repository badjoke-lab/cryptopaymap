import { describe, expect, it, vi } from 'vitest';
import { createPhotoParentResolutionPreviewHandler } from '../functions/admin/api/photo-submissions/[submissionId]/parent-resolution';
import { PhotoParentResolutionPreviewError } from '../src/admin/submissions/photo-parent-resolution-preview';

const submissionId = '10000000-0000-4000-8000-000000000001';
const handoffEventId = '20000000-0000-4000-8000-000000000001';
const mediaAssetId = '30000000-0000-4000-8000-000000000001';
const decisionId = '40000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-16T06:30:00.000Z');
const identity = {
  actorId: 'cloudflare-access:photo-parent-reviewer',
  actorType: 'human' as const,
  subject: 'photo-parent-reviewer',
  email: 'reviewer@example.com',
};

function context(
  overrides: { identity?: unknown; subjects?: string; submissionId?: string | string[] } = {},
) {
  return {
    request: new Request(
      `https://example.test/admin/api/photo-submissions/${submissionId}/parent-resolution`,
      { headers: { Accept: 'application/json' } },
    ),
    env: {
      CPM_ADMIN_PHOTO_PARENT_RESOLUTION_SUBJECTS:
        overrides.subjects ?? JSON.stringify(['photo-parent-reviewer']),
    },
    params: { submissionId: overrides.submissionId ?? submissionId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

describe('P5-06E2 protected Photos parent-resolution preview API', () => {
  it('returns the exact ready request snapshot for an authorized subject', async () => {
    const loadPhotoParentResolutionPreview = vi.fn(async () => ({
      submissionId,
      workflowStatus: 'in_review',
      currentResolution: null,
      expectedSubmissionUpdatedAt: '2026-07-16T06:20:00.000Z',
      handoffEventId,
      readiness: 'ready' as const,
      derivedResolution: 'approved' as const,
      approvedCount: 1,
      rejectedCount: 0,
      pendingCount: 0,
      media: [
        {
          mediaReference: `MEDIA-${mediaAssetId.toUpperCase()}`,
          mediaAssetId,
          mediaUpdatedAt: '2026-07-16T06:25:00.000Z',
          reviewStatus: 'accepted' as const,
          publicDecision: 'approved' as const,
          decisionId,
          decisionAction: 'approve_public' as const,
          decisionDecidedAt: '2026-07-16T06:25:00.000Z',
          expectedReviewStatus: 'accepted' as const,
        },
      ],
      expectedRequest: {
        expectedSubmissionStatus: 'in_review' as const,
        expectedSubmissionUpdatedAt: '2026-07-16T06:20:00.000Z',
        expectedHandoffEventId: handoffEventId,
        expectedMedia: [
          {
            mediaAssetId,
            expectedMediaUpdatedAt: '2026-07-16T06:25:00.000Z',
            decisionId,
            expectedDecisionAction: 'approve_public' as const,
            expectedDecisionDecidedAt: '2026-07-16T06:25:00.000Z',
            expectedReviewStatus: 'accepted' as const,
          },
        ],
      },
      generatedAt: now.toISOString(),
    }));

    const response = await createPhotoParentResolutionPreviewHandler({
      loadPhotoParentResolutionPreview,
      now: () => now,
    })(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      readiness: 'ready',
      derivedResolution: 'approved',
      expectedRequest: {
        expectedHandoffEventId: handoffEventId,
        expectedMedia: [{ mediaAssetId, decisionId }],
      },
    });
    expect(loadPhotoParentResolutionPreview).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:photos:resolve'],
      },
      submissionId,
      expect.any(Object),
      now,
    );
  });

  it('fails closed for missing identity or missing authorization configuration', async () => {
    const loader = vi.fn();
    const denied = await createPhotoParentResolutionPreviewHandler({
      loadPhotoParentResolutionPreview: loader,
    })(context({ identity: null }));
    expect(denied.status).toBe(403);

    const unavailable = await createPhotoParentResolutionPreviewHandler({
      loadPhotoParentResolutionPreview: loader,
    })(context({ subjects: '' }));
    expect(unavailable.status).toBe(503);
    expect(loader).not.toHaveBeenCalled();
  });

  it('maps invalid, missing, and backend preview failures to bounded responses', async () => {
    for (const [code, status] of [
      ['invalid_request', 400],
      ['not_found', 404],
    ] as const) {
      const response = await createPhotoParentResolutionPreviewHandler({
        loadPhotoParentResolutionPreview: vi.fn(async () => {
          throw new PhotoParentResolutionPreviewError(code, 'private detail');
        }),
      })(context());
      expect(response.status).toBe(status);
    }

    const unavailable = await createPhotoParentResolutionPreviewHandler({
      loadPhotoParentResolutionPreview: vi.fn(async () => {
        throw new Error('private database detail');
      }),
    })(context());
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({
      error: 'photo_parent_resolution_unavailable',
    });
  });
});
