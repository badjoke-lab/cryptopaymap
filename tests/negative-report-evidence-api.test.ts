import { describe, expect, it, vi } from 'vitest';
import { createNegativeEvidenceHandler } from '../functions/admin/api/reports/[submissionId]/negative-evidence';
import type { NegativeReportEvidenceReceipt } from '../src/admin/submissions/negative-report-evidence';

const submissionId = '10000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-13T06:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:negative-reviewer',
  actorType: 'human' as const,
  subject: 'negative-reviewer',
  email: 'negative-reviewer@example.com',
};

function receipt(): NegativeReportEvidenceReceipt {
  return {
    state: 'committed',
    submissionId,
    evidenceId: '20000000-0000-4000-8000-000000000001',
    claimId: '30000000-0000-4000-8000-000000000001',
    decision: 'accept_and_prioritize_recheck',
    fromStatus: 'in_review',
    toStatus: 'resolved',
    resolution: 'approved',
    claimStatus: 'confirmed',
    recheckPrioritized: true,
    decidedAt: now.toISOString(),
  };
}

function pagesContext(
  overrides: {
    identity?: unknown;
    subjects?: string;
    submissionId?: string | string[];
    contentType?: string;
    body?: string;
  } = {},
) {
  return {
    request: new Request(
      `https://example.test/admin/api/reports/${submissionId}/negative-evidence`,
      {
        method: 'POST',
        headers: { 'Content-Type': overrides.contentType ?? 'application/json' },
        body: overrides.body ?? JSON.stringify({ request: true }),
      },
    ),
    env: {
      CPM_ADMIN_NEGATIVE_EVIDENCE_SUBJECTS:
        overrides.subjects ?? JSON.stringify(['negative-reviewer']),
    },
    params: { submissionId: overrides.submissionId ?? submissionId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

describe('P5-03F protected negative Evidence API', () => {
  it('authorizes and runs one private no-store decision', async () => {
    const runDecision = vi.fn(async () => receipt());
    const response = await createNegativeEvidenceHandler({ runDecision, now: () => now })(
      pagesContext(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    await expect(response.json()).resolves.toEqual(receipt());
    expect(runDecision).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:negative-evidence:decide'],
      },
      submissionId,
      { request: true },
      expect.any(Object),
      now,
    );
  });

  it('denies before parsing or backend execution', async () => {
    const runDecision = vi.fn(async () => receipt());
    const response = await createNegativeEvidenceHandler({ runDecision })(
      pagesContext({ identity: null, body: '{invalid' }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'negative_evidence_denied' });
    expect(runDecision).not.toHaveBeenCalled();
  });

  it('fails closed when authorization is not configured', async () => {
    const runDecision = vi.fn(async () => receipt());
    const response = await createNegativeEvidenceHandler({ runDecision })(
      pagesContext({ subjects: '' }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'negative_evidence_unavailable' });
    expect(runDecision).not.toHaveBeenCalled();
  });

  it('requires JSON and a string Submission ID', async () => {
    const runDecision = vi.fn(async () => receipt());
    const wrongType = await createNegativeEvidenceHandler({ runDecision })(
      pagesContext({ contentType: 'text/plain' }),
    );
    expect(wrongType.status).toBe(415);

    const wrongId = await createNegativeEvidenceHandler({ runDecision })(
      pagesContext({ submissionId: [submissionId] }),
    );
    expect(wrongId.status).toBe(400);
    expect(runDecision).not.toHaveBeenCalled();
  });
});
