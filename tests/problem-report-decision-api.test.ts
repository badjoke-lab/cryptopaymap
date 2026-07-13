import { describe, expect, it, vi } from 'vitest';
import { createProblemDecisionHandler } from '../functions/admin/api/reports/[submissionId]/problem-decision';
import type { ProblemReportDecisionReceipt } from '../src/admin/submissions/problem-report-decision';

const submissionId = '10000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-13T09:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:problem-reviewer',
  actorType: 'human' as const,
  subject: 'problem-reviewer',
  email: 'problem-reviewer@example.com',
};

function receipt(): ProblemReportDecisionReceipt {
  return {
    state: 'committed',
    submissionId,
    operation: 'resolve_no_change',
    submissionStatus: 'resolved',
    submissionResolution: 'no_change',
    claimId: null,
    claimStatus: null,
    claimVisibility: null,
    verificationEventId: null,
    decidedAt: now.toISOString(),
  };
}

function pagesContext(
  overrides: {
    identity?: unknown;
    problemSubjects?: string;
    urgentSubjects?: string;
    submissionId?: string | string[];
    contentType?: string;
    body?: string;
  } = {},
) {
  return {
    request: new Request(
      `https://example.test/admin/api/reports/${submissionId}/problem-decision`,
      {
        method: 'POST',
        headers: { 'Content-Type': overrides.contentType ?? 'application/json' },
        body: overrides.body ?? JSON.stringify({ request: true }),
      },
    ),
    env: {
      CPM_ADMIN_PROBLEM_DECISION_SUBJECTS:
        overrides.problemSubjects ?? JSON.stringify(['problem-reviewer']),
      CPM_ADMIN_URGENT_VISIBILITY_SUBJECTS:
        overrides.urgentSubjects ?? JSON.stringify(['problem-reviewer']),
    },
    params: { submissionId: overrides.submissionId ?? submissionId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

describe('P5-03G protected problem decision API', () => {
  it('authorizes both bounded capabilities and returns a no-store receipt', async () => {
    const runDecision = vi.fn(async () => receipt());
    const response = await createProblemDecisionHandler({ runDecision, now: () => now })(
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
        capabilities: ['submission:problem:decide', 'submission:urgent-visibility:decide'],
      },
      submissionId,
      { request: true },
      expect.any(Object),
      now,
    );
  });

  it('denies before parsing or backend execution', async () => {
    const runDecision = vi.fn(async () => receipt());
    const response = await createProblemDecisionHandler({ runDecision })(
      pagesContext({ identity: null, body: '{invalid' }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'problem_decision_denied' });
    expect(runDecision).not.toHaveBeenCalled();
  });

  it('fails closed when either policy is not configured', async () => {
    const runDecision = vi.fn(async () => receipt());
    const response = await createProblemDecisionHandler({ runDecision })(
      pagesContext({ urgentSubjects: '' }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'problem_decision_unavailable' });
    expect(runDecision).not.toHaveBeenCalled();
  });

  it('requires JSON and a string Submission ID', async () => {
    const runDecision = vi.fn(async () => receipt());
    const wrongType = await createProblemDecisionHandler({ runDecision })(
      pagesContext({ contentType: 'text/plain' }),
    );
    expect(wrongType.status).toBe(415);

    const wrongId = await createProblemDecisionHandler({ runDecision })(
      pagesContext({ submissionId: [submissionId] }),
    );
    expect(wrongId.status).toBe(400);
    expect(runDecision).not.toHaveBeenCalled();
  });
});
