import { describe, expect, it, vi } from 'vitest';
import { createBusinessClaimPaymentPlanHandler } from '../functions/admin/api/business-claim-applications/[applicationId]/plan-payments';
import { BusinessClaimPaymentPlanError } from '../src/admin/submissions/business-claim-payment-plan';

const applicationId = '10000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-20T12:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:business-claim-payment-plan',
  actorType: 'human' as const,
  subject: 'business-claim-payment-plan',
  email: 'operator@example.com',
};
const body = {
  schemaVersion: 'business-claim-payment-plan-v1',
  requestId: '90000000-0000-4000-8000-000000000001',
  expectedApplicationUpdatedAt: '2026-07-20T11:00:00.000Z',
  expectedSourceDecisionEventId: '30000000-0000-4000-8000-000000000001',
  expectedFieldApplicationEventId: '40000000-0000-4000-8000-000000000001',
  expectedDraftSetHash: 'a'.repeat(64),
  selections: [],
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
      `https://example.test/admin/api/business-claim-applications/${applicationId}/plan-payments`,
      {
        method: 'POST',
        headers: { 'content-type': overrides.contentType ?? 'application/json' },
        body: overrides.rawBody ?? JSON.stringify(body),
      },
    ),
    env: {
      CPM_ADMIN_BUSINESS_CLAIM_PAYMENT_PLAN_SUBJECTS:
        overrides.subjects ?? JSON.stringify(['business-claim-payment-plan']),
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
  submissionId: '20000000-0000-4000-8000-000000000001',
  draftSetHash: body.expectedDraftSetHash,
  itemCount: 2,
  plannedClaimCount: 1,
  insertCount: 2,
  alreadyPresentCount: 0,
  plannedAt: now.toISOString(),
};

describe('P5-07E3 protected Business Claim payment plan API', () => {
  it('returns one bounded private plan receipt for an authorized subject', async () => {
    const runPlan = vi.fn(async () => receipt);
    const response = await createBusinessClaimPaymentPlanHandler({
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
        capabilities: ['submission:business-claim-payment-plan:prepare'],
      },
      applicationId,
      body,
      expect.any(Object),
      now,
    );
  });

  it('fails closed for authorization, content type, JSON, and path errors', async () => {
    const runPlan = vi.fn();
    expect(
      (await createBusinessClaimPaymentPlanHandler({ runPlan })(pagesContext({ identity: null })))
        .status,
    ).toBe(403);
    expect(
      (await createBusinessClaimPaymentPlanHandler({ runPlan })(pagesContext({ subjects: '' })))
        .status,
    ).toBe(503);
    expect(
      (
        await createBusinessClaimPaymentPlanHandler({ runPlan })(
          pagesContext({ contentType: 'text/plain' }),
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await createBusinessClaimPaymentPlanHandler({ runPlan })(
          pagesContext({ rawBody: '{' }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await createBusinessClaimPaymentPlanHandler({ runPlan })(
          pagesContext({ applicationId: [applicationId] }),
        )
      ).status,
    ).toBe(400);
  });

  it('maps bounded planning errors without exposing private material', async () => {
    for (const [code, status] of [
      ['invalid_request', 400],
      ['not_found', 404],
      ['conflict', 409],
      ['selection_required', 422],
      ['ineligible', 422],
    ] as const) {
      const response = await createBusinessClaimPaymentPlanHandler({
        runPlan: vi.fn(async () => {
          throw new BusinessClaimPaymentPlanError(code, 'private payment proposal material');
        }),
      })(pagesContext());
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain('private payment');
    }
  });
});
