import { describe, expect, it, vi } from 'vitest';
import { createPositivePaymentEvidenceHandler } from '../functions/admin/api/reports/[submissionId]/positive-evidence';
import type { PositivePaymentEvidenceReceipt } from '../src/admin/submissions/payment-report-evidence';

const submissionId = '10000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-13T05:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:payment-reviewer',
  actorType: 'human' as const,
  subject: 'payment-reviewer',
  email: 'payment-reviewer@example.com',
};

function receipt(): PositivePaymentEvidenceReceipt {
  return {
    state: 'committed',
    submissionId,
    evidenceId: '20000000-0000-4000-8000-000000000001',
    claimId: '30000000-0000-4000-8000-000000000001',
    decision: 'accept_evidence',
    fromStatus: 'in_review',
    toStatus: 'resolved',
    resolution: 'approved',
    claimStatus: 'confirmed',
    verificationEventType: null,
    decidedAt: now.toISOString(),
  };
}

function pagesContext(overrides: {
  identity?: unknown;
  subjects?: string;
  submissionId?: string | string[];
  contentType?: string;
  body?: string;
} = {}) {
  return {
    request: new Request(`https://example.test/admin/api/reports/${submissionId}/positive-evidence`, {
      method: 'POST',
      headers: {
        'Content-Type': overrides.contentType ?? 'application/json',
      },
      body: overrides.body ?? JSON.stringify({ request: true }),
    }),
    env: {
      CPM_ADMIN_PAYMENT_EVIDENCE_SUBJECTS:
        overrides.subjects ?? JSON.stringify(['payment-reviewer']),
    },
    params: { submissionId: overrides.submissionId ?? submissionId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

describe('P5-03E protected positive payment Evidence API', () => {
  it('authorizes and runs one private no-store decision', async () => {
    const runDecision = vi.fn(async () => receipt());
    const response = await createPositivePaymentEvidenceHandler({
      runDecision,
      now: () => now,
    })(pagesContext());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    await expect(response.json()).resolves.toEqual(receipt());
    expect(runDecision).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:payment-evidence:decide'],
      },
      submissionId,
      { request: true },
      expect.any(Object),
      now,
    );
  });

  it('denies before parsing or backend execution', async () => {
    const runDecision = vi.fn(async () => receipt());
    const response = await createPositivePaymentEvidenceHandler({ runDecision })(
      pagesContext({ identity: null, body: '{invalid' }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'positive_payment_evidence_denied' });
    expect(runDecision).not.toHaveBeenCalled();
  });

  it('fails closed when authorization is not configured', async () => {
    const runDecision = vi.fn(async () => receipt());
    const response = await createPositivePaymentEvidenceHandler({ runDecision })(
      pagesContext({ subjects: '' }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'positive_payment_evidence_unavailable',
    });
    expect(runDecision).not.toHaveBeenCalled();
  });

  it('requires JSON and a string Submission ID', async () => {
    const runDecision = vi.fn(async () => receipt());
    const wrongType = await createPositivePaymentEvidenceHandler({ runDecision })(
      pagesContext({ contentType: 'text/plain' }),
    );
    expect(wrongType.status).toBe(415);

    const wrongId = await createPositivePaymentEvidenceHandler({ runDecision })(
      pagesContext({ submissionId: [submissionId] }),
    );
    expect(wrongId.status).toBe(400);
    expect(runDecision).not.toHaveBeenCalled();
  });
});
