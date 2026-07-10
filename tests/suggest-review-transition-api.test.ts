import { describe, expect, it, vi } from 'vitest';
import { createSubmissionTransitionHandler } from '../functions/admin/api/submissions/[submissionId]/transition';
import { SuggestReviewTransitionError } from '../src/admin/submissions/transitions';

const submissionId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-10T03:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human' as const,
  subject: 'reviewer-subject',
  email: 'reviewer@example.com',
};

function body() {
  return {
    schemaVersion: 'suggest-review-transition-v1',
    requestId,
    action: 'begin_triage',
    expectedStatus: 'received',
    expectedUpdatedAt: '2026-07-10T02:00:00.000Z',
  };
}

function context(overrides: {
  identity?: unknown;
  subjects?: string;
  contentType?: string;
  submissionId?: string | string[];
  requestBody?: unknown;
} = {}) {
  return {
    request: new Request(`https://example.test/admin/api/submissions/${submissionId}/transition`, {
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

describe('P5-02E protected Suggest review transition API', () => {
  it('runs a guarded transition for an explicitly authorized transition subject', async () => {
    const runTransition = vi.fn(async () => ({
      state: 'committed' as const,
      submissionId,
      fromStatus: 'received' as const,
      toStatus: 'triage' as const,
      action: 'begin_triage' as const,
      changedAt: now.toISOString(),
    }));
    const response = await createSubmissionTransitionHandler({
      runTransition,
      now: () => now,
    })(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      state: 'committed',
      fromStatus: 'received',
      toStatus: 'triage',
    });
    expect(runTransition).toHaveBeenCalledWith(
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

  it('denies a read-only or missing transition identity before the runner executes', async () => {
    const runTransition = vi.fn();
    const response = await createSubmissionTransitionHandler({ runTransition })(
      context({ identity: null }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'submission_transition_denied' });
    expect(runTransition).not.toHaveBeenCalled();
  });

  it('returns unavailable when transition authorization is not configured', async () => {
    const runTransition = vi.fn();
    const response = await createSubmissionTransitionHandler({ runTransition })(
      context({ subjects: '' }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'submission_transition_unavailable' });
    expect(runTransition).not.toHaveBeenCalled();
  });

  it('requires JSON and rejects malformed route parameters before runner access', async () => {
    const runTransition = vi.fn();
    const mediaTypeResponse = await createSubmissionTransitionHandler({ runTransition })(
      context({ contentType: 'text/plain' }),
    );
    expect(mediaTypeResponse.status).toBe(415);

    const parameterResponse = await createSubmissionTransitionHandler({ runTransition })(
      context({ submissionId: [submissionId] }),
    );
    expect(parameterResponse.status).toBe(400);
    expect(runTransition).not.toHaveBeenCalled();
  });

  it('maps stale state and request UUID reuse conflicts to one bounded 409 response', async () => {
    for (const code of ['conflict', 'idempotency_conflict'] as const) {
      const response = await createSubmissionTransitionHandler({
        runTransition: vi.fn(async () => {
          throw new SuggestReviewTransitionError(code, 'private conflict detail');
        }),
      })(context());
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: 'submission_transition_conflict' });
    }
  });

  it('returns a generic unavailable response without leaking backend detail', async () => {
    const response = await createSubmissionTransitionHandler({
      runTransition: vi.fn(async () => {
        throw new Error('private database detail');
      }),
    })(context());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'submission_transition_unavailable' });
  });
});
