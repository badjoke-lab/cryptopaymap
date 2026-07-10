import { describe, expect, it, vi } from 'vitest';
import { createHoldHandler } from '../functions/admin/api/submissions/[submissionId]/hold';
import { SuggestHoldError } from '../src/admin/submissions/hold';

const submissionId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-10T05:05:00.000Z');
const identity = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human' as const,
  subject: 'reviewer-subject',
  email: 'reviewer@example.com',
};

function body() {
  return {
    schemaVersion: 'suggest-hold-v1',
    requestId,
    expectedStatus: 'in_review',
    expectedUpdatedAt: '2026-07-10T05:00:00.000Z',
    holdDays: 30,
    holdReason: 'Awaiting a scheduled merchant payment-policy update.',
    requiredAction: 'No submitter action is required before the next review.',
    publicMessage: 'Review is paused until the next scheduled verification date.',
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
    request: new Request(`https://example.test/admin/api/submissions/${submissionId}/hold`, {
      method: 'POST',
      headers: { 'Content-Type': overrides.contentType ?? 'application/json' },
      body: JSON.stringify(overrides.requestBody ?? body()),
    }),
    env: {
      CPM_ADMIN_SUBMISSION_TRANSITION_SUBJECTS:
        overrides.subjects ?? JSON.stringify(['reviewer-subject']),
    },
    params: { submissionId: overrides.submissionId ?? submissionId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

describe('P5-02G protected Suggest Hold API', () => {
  it('commits a time-bounded Hold for an authorized transition subject', async () => {
    const runHold = vi.fn(async () => ({
      state: 'committed' as const,
      submissionId,
      fromStatus: 'in_review' as const,
      toStatus: 'on_hold' as const,
      holdDays: 30 as const,
      nextReviewAt: '2026-08-09T05:05:00.000Z',
      requiredAction: body().requiredAction,
      publicMessage: body().publicMessage,
      changedAt: now.toISOString(),
    }));
    const response = await createHoldHandler({ runHold, now: () => now })(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      state: 'committed',
      toStatus: 'on_hold',
      holdDays: 30,
    });
    expect(runHold).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:transition'],
      },
      submissionId,
      body(),
      expect.any(Object),
      now,
    );
  });

  it('denies missing transition identity before runner access', async () => {
    const runHold = vi.fn();
    const response = await createHoldHandler({ runHold })(context({ identity: null }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'submission_hold_denied' });
    expect(runHold).not.toHaveBeenCalled();
  });

  it('requires configured transition authorization', async () => {
    const runHold = vi.fn();
    const response = await createHoldHandler({ runHold })(context({ subjects: '' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'submission_hold_unavailable' });
    expect(runHold).not.toHaveBeenCalled();
  });

  it('requires JSON and a scalar Submission route parameter', async () => {
    const runHold = vi.fn();
    const mediaTypeResponse = await createHoldHandler({ runHold })(
      context({ contentType: 'text/plain' }),
    );
    expect(mediaTypeResponse.status).toBe(415);

    const parameterResponse = await createHoldHandler({ runHold })(
      context({ submissionId: [submissionId] }),
    );
    expect(parameterResponse.status).toBe(400);
    expect(runHold).not.toHaveBeenCalled();
  });

  it('maps stale-state and replay-content conflicts to one bounded 409 response', async () => {
    for (const code of ['conflict', 'idempotency_conflict'] as const) {
      const response = await createHoldHandler({
        runHold: vi.fn(async () => {
          throw new SuggestHoldError(code, 'private conflict detail');
        }),
      })(context());
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: 'submission_hold_conflict' });
    }
  });

  it('does not leak backend failure detail', async () => {
    const response = await createHoldHandler({
      runHold: vi.fn(async () => {
        throw new Error('private database detail');
      }),
    })(context());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'submission_hold_unavailable' });
  });
});
