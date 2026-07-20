import { describe, expect, it, vi } from 'vitest';
import { createBusinessClaimPaymentApplicationHandler } from '../functions/admin/api/business-claim-applications/[applicationId]/apply-payments';
import { BusinessClaimPaymentApplicationError } from '../src/admin/submissions/business-claim-payment-application';

const applicationId = '10000000-0000-4000-8000-000000000001';
const sourceId = '20000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-20T12:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:business-claim-payment-apply',
  actorType: 'human' as const,
  subject: 'business-claim-payment-apply',
  email: 'operator@example.com',
};
const body = {
  schemaVersion: 'business-claim-payment-application-v1',
  requestId: '30000000-0000-4000-8000-000000000001',
  planId: '40000000-0000-4000-8000-000000000001',
  expectedApplicationUpdatedAt: '2026-07-20T10:00:00.000Z',
  expectedSourceDecisionEventId: '50000000-0000-4000-8000-000000000001',
  expectedFieldApplicationEventId: '60000000-0000-4000-8000-000000000001',
  expectedPlanCreatedAt: '2026-07-20T11:00:00.000Z',
  expectedDraftSetHash: 'a'.repeat(64),
};

function pagesContext(
  overrides: {
    identity?: unknown;
    subjects?: string;
    sourceId?: string;
    applicationId?: string[];
    contentType?: string;
    rawBody?: string;
  } = {},
) {
  return {
    request: new Request(
      `https://example.test/admin/api/business-claim-applications/${applicationId}/apply-payments`,
      {
        method: 'POST',
        headers: { 'content-type': overrides.contentType ?? 'application/json' },
        body: overrides.rawBody ?? JSON.stringify(body),
      },
    ),
    env: {
      CPM_ADMIN_BUSINESS_CLAIM_PAYMENT_APPLY_SUBJECTS:
        overrides.subjects ?? JSON.stringify(['business-claim-payment-apply']),
      CPM_BUSINESS_CLAIM_SOURCE_ID: overrides.sourceId ?? sourceId,
    },
    params: { applicationId: overrides.applicationId ?? applicationId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

const receipt = {
  state: 'committed' as const,
  applicationId,
  submissionId: '70000000-0000-4000-8000-000000000001',
  planId: body.planId,
  applicationEventId: body.requestId,
  sourceRecordId: '80000000-0000-4000-8000-000000000001',
  createdClaimIds: ['90000000-0000-4000-8000-000000000001'],
  insertedClaimAssetRowIds: ['a0000000-0000-4000-8000-000000000001'],
  alreadyPresentClaimAssetRowIds: [],
  verificationEventIds: ['b0000000-0000-4000-8000-000000000001'],
  applicationStatus: 'committed' as const,
  publicationStatus: 'pending' as const,
  transitionEventId: body.requestId,
  appliedAt: now.toISOString(),
};

describe('P5-07E4 protected Business Claim payment application API', () => {
  it('returns a bounded private receipt for an authorized subject', async () => {
    const applyPayments = vi.fn(async () => receipt);
    const response = await createBusinessClaimPaymentApplicationHandler({
      applyPayments,
      now: () => now,
    })(pagesContext());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual(receipt);
    expect(applyPayments).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:business-claim-payments:apply'],
      },
      applicationId,
      sourceId,
      body,
      expect.any(Object),
      now,
    );
  });

  it('fails closed for authorization, configuration, content-type, JSON, and path errors', async () => {
    const applyPayments = vi.fn();
    expect(
      (
        await createBusinessClaimPaymentApplicationHandler({ applyPayments })(
          pagesContext({ identity: null }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await createBusinessClaimPaymentApplicationHandler({ applyPayments })(
          pagesContext({ subjects: '' }),
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await createBusinessClaimPaymentApplicationHandler({ applyPayments })(
          pagesContext({ sourceId: 'not-a-uuid' }),
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await createBusinessClaimPaymentApplicationHandler({ applyPayments })(
          pagesContext({ contentType: 'text/plain' }),
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await createBusinessClaimPaymentApplicationHandler({ applyPayments })(
          pagesContext({ rawBody: '{' }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await createBusinessClaimPaymentApplicationHandler({ applyPayments })(
          pagesContext({ applicationId: [applicationId] }),
        )
      ).status,
    ).toBe(400);
  });

  it('maps bounded application errors without exposing private canonical material', async () => {
    for (const [code, status] of [
      ['invalid_request', 400],
      ['not_found', 404],
      ['conflict', 409],
      ['idempotency_conflict', 409],
      ['ineligible', 422],
    ] as const) {
      const response = await createBusinessClaimPaymentApplicationHandler({
        applyPayments: vi.fn(async () => {
          throw new BusinessClaimPaymentApplicationError(
            code,
            'private claim, source, provenance, and payment material',
          );
        }),
      })(pagesContext());
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain('private claim');
    }
  });
});
