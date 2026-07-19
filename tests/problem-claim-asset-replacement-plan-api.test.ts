import { describe, expect, it, vi } from 'vitest';
import { createProblemClaimAssetReplacementPlanHandler } from '../functions/admin/api/problem-applications/[applicationId]/plan-claim-assets';
import { ProblemClaimAssetReplacementPlanError } from '../src/admin/submissions/problem-claim-asset-replacement-plan';

const applicationId = '10000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-19T10:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:claim-asset-plan',
  actorType: 'human' as const,
  subject: 'claim-asset-plan',
  email: 'operator@example.com',
};
const body = {
  schemaVersion: 'problem-claim-asset-replacement-plan-v1',
  requestId: '90000000-0000-4000-8000-000000000001',
  expectedApplicationUpdatedAt: '2026-07-19T09:00:00.000Z',
  expectedClaimUpdatedAt: '2026-07-19T08:00:00.000Z',
  expectedSourceDecisionEventId: '30000000-0000-4000-8000-000000000001',
  expectedCurrentSetHash: 'a'.repeat(64),
  selection: { mode: 'automatic_single_row', selectedCurrentRowId: null },
};

function pagesContext(
  overrides: {
    identity?: unknown;
    subjects?: string;
    applicationId?: string[];
    contentType?: string;
    rawBody?: string;
  } = {},
) {
  return {
    request: new Request(
      `https://example.test/admin/api/problem-applications/${applicationId}/plan-claim-assets`,
      {
        method: 'POST',
        headers: { 'content-type': overrides.contentType ?? 'application/json' },
        body: overrides.rawBody ?? JSON.stringify(body),
      },
    ),
    env: {
      CPM_ADMIN_PROBLEM_CLAIM_ASSET_PLAN_SUBJECTS:
        overrides.subjects ?? JSON.stringify(['claim-asset-plan']),
    },
    params: { applicationId: overrides.applicationId ?? applicationId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

const receipt = {
  state: 'committed' as const,
  planId: body.requestId,
  applicationId,
  claimId: '40000000-0000-4000-8000-000000000001',
  correction: { reportType: 'wrong_asset' as const, kind: 'asset' as const, proposedSlug: 'usdc' },
  selection: { mode: 'automatic_single_row' as const, selectedCurrentRowId: null },
  selectedCurrentRowId: '80000000-0000-4000-8000-000000000001',
  replacementRowId: '80000000-0000-4000-8000-000000000002',
  currentSetHash: 'a'.repeat(64),
  proposedSetHash: 'b'.repeat(64),
  plannedAt: now.toISOString(),
};

describe('P5-07D6 protected Claim Asset replacement plan API', () => {
  it('returns a bounded private plan receipt for an authorized subject', async () => {
    const runPlan = vi.fn(async () => receipt);
    const response = await createProblemClaimAssetReplacementPlanHandler({
      runPlan,
      now: () => now,
    })(pagesContext());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual(receipt);
    expect(runPlan).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:problem-claim-asset-plan:prepare'],
      },
      applicationId,
      body,
      expect.any(Object),
      now,
    );
  });

  it('fails closed for authorization, content-type, JSON, and path errors', async () => {
    const runPlan = vi.fn();
    expect(
      (
        await createProblemClaimAssetReplacementPlanHandler({ runPlan })(
          pagesContext({ identity: null }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await createProblemClaimAssetReplacementPlanHandler({ runPlan })(
          pagesContext({ subjects: '' }),
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await createProblemClaimAssetReplacementPlanHandler({ runPlan })(
          pagesContext({ contentType: 'text/plain' }),
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await createProblemClaimAssetReplacementPlanHandler({ runPlan })(
          pagesContext({ rawBody: '{' }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await createProblemClaimAssetReplacementPlanHandler({ runPlan })(
          pagesContext({ applicationId: [applicationId] }),
        )
      ).status,
    ).toBe(400);
  });

  it('maps bounded planning errors without exposing private plan material', async () => {
    for (const [code, status] of [
      ['invalid_request', 400],
      ['not_found', 404],
      ['conflict', 409],
      ['selection_required', 422],
      ['no_change', 422],
      ['ineligible', 422],
    ] as const) {
      const response = await createProblemClaimAssetReplacementPlanHandler({
        runPlan: vi.fn(async () => {
          throw new ProblemClaimAssetReplacementPlanError(code, 'private row and note material');
        }),
      })(pagesContext());
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain('private row');
    }
  });
});
