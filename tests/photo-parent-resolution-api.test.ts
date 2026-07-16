import { describe, expect, it, vi } from 'vitest';
import { createPhotoParentResolutionHandler } from '../functions/admin/api/photo-submissions/[submissionId]/parent-resolution';
import { PhotoParentResolutionError } from '../src/admin/submissions/photo-parent-resolution';

const submissionId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const handoffEventId = '30000000-0000-4000-8000-000000000001';
const mediaAssetId = '40000000-0000-4000-8000-000000000001';
const decisionId = '50000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-16T06:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:photo-parent-reviewer',
  actorType: 'human' as const,
  subject: 'photo-parent-reviewer',
  email: 'reviewer@example.com',
};

function body() {
  return {
    schemaVersion: 'photo-parent-resolution-v1',
    requestId,
    expectedSubmissionStatus: 'in_review',
    expectedSubmissionUpdatedAt: '2026-07-16T05:59:00.000Z',
    expectedHandoffEventId: handoffEventId,
    expectedMedia: [
      {
        mediaAssetId,
        expectedMediaUpdatedAt: '2026-07-16T05:58:00.000Z',
        decisionId,
        expectedDecisionAction: 'approve_public',
        expectedDecisionDecidedAt: '2026-07-16T05:58:00.000Z',
        expectedReviewStatus: 'accepted',
      },
    ],
    publicMessage: 'The submitted photo was approved.',
    internalNote: null,
  };
}

function context(
  overrides: {
    identity?: unknown;
    subjects?: string;
    contentType?: string;
    submissionId?: string | string[];
    requestBody?: unknown;
  } = {},
) {
  return {
    request: new Request(
      `https://example.test/admin/api/photo-submissions/${submissionId}/parent-resolution`,
      {
        method: 'POST',
        headers: { 'Content-Type': overrides.contentType ?? 'application/json' },
        body: JSON.stringify(overrides.requestBody ?? body()),
      },
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

describe('P5-06E protected Photos parent-resolution API', () => {
  it('runs parent resolution for an explicitly authorized subject', async () => {
    const runPhotoParentResolution = vi.fn(async () => ({
      state: 'committed' as const,
      submissionId,
      fromStatus: 'in_review' as const,
      toStatus: 'resolved' as const,
      resolution: 'approved' as const,
      publicMessage: body().publicMessage,
      approvedCount: 1,
      rejectedCount: 0,
      mediaDecisions: [
        {
          mediaReference: `MEDIA-${mediaAssetId.toUpperCase()}`,
          decision: 'approved' as const,
        },
      ],
      changedAt: now.toISOString(),
    }));

    const response = await createPhotoParentResolutionHandler({
      runPhotoParentResolution,
      now: () => now,
    })(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      resolution: 'approved',
      approvedCount: 1,
      mediaDecisions: [{ decision: 'approved' }],
    });
    expect(runPhotoParentResolution).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:photos:resolve'],
      },
      submissionId,
      body(),
      expect.any(Object),
      now,
    );
  });

  it('fails closed for missing identity or authorization configuration', async () => {
    const runPhotoParentResolution = vi.fn();
    const denied = await createPhotoParentResolutionHandler({ runPhotoParentResolution })(
      context({ identity: null }),
    );
    expect(denied.status).toBe(403);

    const unavailable = await createPhotoParentResolutionHandler({ runPhotoParentResolution })(
      context({ subjects: '' }),
    );
    expect(unavailable.status).toBe(503);
    expect(runPhotoParentResolution).not.toHaveBeenCalled();
  });

  it('maps bounded media-type, eligibility, conflict, and backend failures', async () => {
    const mediaType = await createPhotoParentResolutionHandler({
      runPhotoParentResolution: vi.fn(),
    })(context({ contentType: 'text/plain' }));
    expect(mediaType.status).toBe(415);

    for (const [code, status] of [
      ['ineligible', 422],
      ['conflict', 409],
      ['idempotency_conflict', 409],
    ] as const) {
      const response = await createPhotoParentResolutionHandler({
        runPhotoParentResolution: vi.fn(async () => {
          throw new PhotoParentResolutionError(code, 'private detail');
        }),
      })(context());
      expect(response.status).toBe(status);
    }

    const unavailable = await createPhotoParentResolutionHandler({
      runPhotoParentResolution: vi.fn(async () => {
        throw new Error('private database detail');
      }),
    })(context());
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({
      error: 'photo_parent_resolution_unavailable',
    });
  });
});
