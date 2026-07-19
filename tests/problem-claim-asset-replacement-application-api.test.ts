import { describe, expect, it, vi } from 'vitest';
import { createProblemClaimAssetReplacementApplicationHandler } from '../functions/admin/api/problem-applications/[applicationId]/apply-claim-assets';
import { ProblemClaimAssetReplacementApplicationError } from '../src/admin/submissions/problem-claim-asset-replacement-application';

const applicationId = '10000000-0000-4000-8000-000000000001';
const sourceId = '20000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-19T11:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:claim-asset-apply',
  actorType: 'human' as const,
  subject: 'claim-asset-apply',
  email: 'operator@example.com',
};

function context(
  overrides: {
    identity?: unknown;
    subjects?: string;
    sourceId?: string;
    applicationId?: string[];
    contentType?: string;
    body?: unknown;
  } = {},
) {
  return {
    request: new Request(
      `https://example.test/admin/api/problem-applications/${applicationId}/apply-claim-assets`,
      {
        method: 'POST',
        headers: { 'content-type': overrides.contentType ?? 'application/json' },
        body: JSON.stringify(overrides.body ?? { request: 'bounded' }),
      },
    ),
    env: {
      CPM_ADMIN_PROBLEM_CLAIM_ASSET_APPLY_SUBJECTS:
        overrides.subjects ?? JSON.stringify(['claim-asset-apply']),
      CPM_PROBLEM_REPORT_SOURCE_ID: overrides.sourceId ?? sourceId,
    },
    params: { applicationId: overrides.applicationId ?? applicationId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

function receipt() {
  return {
    state: 'committed' as const,
    applicationId,
    submissionId: '30000000-0000-4000-8000-000000000001',
    claimId: '40000000-0000-4000-8000-000000000001',
    planId: '50000000-0000-4000-8000-000000000001',
    correctionEventId: '60000000-0000-4000-8000-000000000001',
    sourceRecordId: '70000000-0000-4000-8000-000000000001',
    verificationEventId: '80000000-0000-4000-8000-000000000001',
    currentSetHash: 'a'.repeat(64),
    proposedSetHash: 'b'.repeat(64),
    applicationStatus: 'committed' as const,
    publicationStatus: 'pending' as const,
    transitionEventId: '90000000-0000-4000-8000-000000000001',
    appliedAt: now.toISOString(),
  };
}

describe('P5-07D7 protected Claim Asset replacement application API', () => {
  it('applies a bounded private replacement for an authorized subject', async () => {
    const applyReplacement = vi.fn(async () => receipt());
    const response = await createProblemClaimAssetReplacementApplicationHandler({
      applyReplacement,
      now: () => now,
    })(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      state: 'committed',
      applicationStatus: 'committed',
      publicationStatus: 'pending',
    });
    expect(applyReplacement).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:problem-claim-assets:apply'],
      },
      applicationId,
      sourceId,
      { request: 'bounded' },
      expect.any(Object),
      now,
    );
  });

  it('fails closed for missing identity, invalid policy, path, and content type', async () => {
    const applyReplacement = vi.fn();
    expect(
      (
        await createProblemClaimAssetReplacementApplicationHandler({ applyReplacement })(
          context({ identity: null }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await createProblemClaimAssetReplacementApplicationHandler({ applyReplacement })(
          context({ subjects: '' }),
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await createProblemClaimAssetReplacementApplicationHandler({ applyReplacement })(
          context({ sourceId: 'invalid' }),
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await createProblemClaimAssetReplacementApplicationHandler({ applyReplacement })(
          context({ applicationId: [applicationId] }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await createProblemClaimAssetReplacementApplicationHandler({ applyReplacement })(
          context({ contentType: 'text/plain' }),
        )
      ).status,
    ).toBe(415);
    expect(applyReplacement).not.toHaveBeenCalled();
  });

  it('maps bounded application errors without exposing private plan details', async () => {
    for (const [code, status] of [
      ['invalid_request', 400],
      ['not_found', 404],
      ['conflict', 409],
      ['idempotency_conflict', 409],
      ['ineligible', 422],
    ] as const) {
      const response = await createProblemClaimAssetReplacementApplicationHandler({
        applyReplacement: vi.fn(async () => {
          throw new ProblemClaimAssetReplacementApplicationError(
            code,
            'private Claim Asset note and durable plan payload',
          );
        }),
      })(context());
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain('private Claim Asset note');
    }

    const unavailable = await createProblemClaimAssetReplacementApplicationHandler({
      applyReplacement: vi.fn(async () => {
        throw new Error('private database detail');
      }),
    })(context());
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({
      error: 'problem_claim_asset_apply_unavailable',
    });
  });
});
