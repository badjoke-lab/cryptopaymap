import { describe, expect, it, vi } from 'vitest';
import { createProblemClaimAssetSetPreviewHandler } from '../functions/admin/api/problem-applications/[applicationId]/claim-asset-preview';
import { ProblemClaimAssetSetPreviewError } from '../src/admin/submissions/problem-claim-asset-set-preview';

const applicationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000001';
const decisionEventId = '30000000-0000-4000-8000-000000000001';
const claimId = '40000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-18T14:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:claim-asset-preview',
  actorType: 'human' as const,
  subject: 'claim-asset-preview',
  email: 'operator@example.com',
};

function context(
  overrides: { identity?: unknown; subjects?: string; applicationId?: string[] } = {},
) {
  return {
    request: new Request(
      `https://example.test/admin/api/problem-applications/${applicationId}/claim-asset-preview`,
    ),
    env: {
      CPM_ADMIN_PROBLEM_CLAIM_ASSET_PREVIEW_SUBJECTS:
        overrides.subjects ?? JSON.stringify(['claim-asset-preview']),
    },
    params: { applicationId: overrides.applicationId ?? applicationId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

function projection() {
  return {
    schemaVersion: 'problem-claim-asset-set-preview-v1' as const,
    generatedAt: now.toISOString(),
    application: {
      applicationId,
      submissionId,
      sourceDecisionEventId: decisionEventId,
      applicationStatus: 'pending' as const,
      publicationStatus: 'blocked' as const,
      expectedApplicationUpdatedAt: '2026-07-18T13:00:00.000Z',
    },
    correction: {
      reportType: 'wrong_asset' as const,
      kind: 'asset' as const,
      proposedSlug: 'usdc',
    },
    target: {
      claimId,
      claimStatus: 'confirmed' as const,
      routeType: 'direct_wallet' as const,
      expectedClaimUpdatedAt: '2026-07-18T12:00:00.000Z',
    },
    readiness: 'ready' as const,
    issues: [],
    selectedCurrentRowId: '50000000-0000-4000-8000-000000000001',
    currentSetHash: 'a'.repeat(64),
    proposedSetHash: 'b'.repeat(64),
    currentSet: [],
    proposedSet: [],
  };
}

describe('P5-07D5 protected Claim Asset replacement preview API', () => {
  it('returns a bounded private preview for an authorized subject', async () => {
    const readPreview = vi.fn(async () => projection());
    const response = await createProblemClaimAssetSetPreviewHandler({
      readPreview,
      now: () => now,
    })(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      readiness: 'ready',
      target: { claimId },
    });
    expect(readPreview).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:problem-claim-asset-preview:read'],
      },
      applicationId,
      expect.any(Object),
      now,
    );
  });

  it('fails closed for missing identity, invalid policy, and invalid path parameters', async () => {
    const readPreview = vi.fn();
    const denied = await createProblemClaimAssetSetPreviewHandler({ readPreview })(
      context({ identity: null }),
    );
    expect(denied.status).toBe(403);

    const unavailable = await createProblemClaimAssetSetPreviewHandler({ readPreview })(
      context({ subjects: '' }),
    );
    expect(unavailable.status).toBe(503);

    const invalid = await createProblemClaimAssetSetPreviewHandler({ readPreview })(
      context({ applicationId: [applicationId] }),
    );
    expect(invalid.status).toBe(400);
    expect(readPreview).not.toHaveBeenCalled();
  });

  it('maps bounded read errors without exposing registry or Submission details', async () => {
    for (const [code, status] of [
      ['invalid_request', 400],
      ['not_found', 404],
      ['ineligible', 422],
    ] as const) {
      const response = await createProblemClaimAssetSetPreviewHandler({
        readPreview: vi.fn(async () => {
          throw new ProblemClaimAssetSetPreviewError(
            code,
            'private registry and Submission detail',
          );
        }),
      })(context());
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain('private registry');
    }

    const unavailable = await createProblemClaimAssetSetPreviewHandler({
      readPreview: vi.fn(async () => {
        throw new Error('private database detail');
      }),
    })(context());
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({
      error: 'problem_claim_asset_preview_unavailable',
    });
  });
});
