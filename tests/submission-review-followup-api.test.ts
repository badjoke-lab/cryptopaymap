import { describe, expect, it, vi } from 'vitest';
import { createReviewFollowupHandler } from '../functions/admin/api/review-followup/[submissionId]';
import { ReviewFollowupError } from '../src/admin/submissions/review-followup';

const submissionId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-16T01:10:00.000Z');
const identity = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human' as const,
  subject: 'reviewer-subject',
  email: 'reviewer@example.com',
};

function body() {
  return {
    schemaVersion: 'submission-review-followup-v1',
    requestId,
    submissionType: 'payment_report',
    action: 'request_information',
    expectedStatus: 'in_review',
    expectedUpdatedAt: '2026-07-16T01:00:00.000Z',
    requestedAction: 'Provide a recent official source.',
    publicMessage: 'Please provide a recent official source.',
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
    request: new Request(`https://example.test/admin/api/review-followup/${submissionId}`, {
      method: 'POST',
      headers: { 'Content-Type': overrides.contentType ?? 'application/json' },
      body: JSON.stringify(overrides.requestBody ?? body()),
    }),
    env: {
      CPM_ADMIN_SUBMISSION_REVIEW_FOLLOWUP_SUBJECTS:
        overrides.subjects ?? JSON.stringify(['reviewer-subject']),
    },
    params: { submissionId: overrides.submissionId ?? submissionId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

describe('P5-06C1 protected Submission review follow-up API', () => {
  it('runs review follow-up for an explicitly authorized subject', async () => {
    const runReviewFollowup = vi.fn(async () => ({
      state: 'committed' as const,
      submissionId,
      submissionType: 'payment_report' as const,
      action: 'request_information' as const,
      fromStatus: 'in_review' as const,
      toStatus: 'needs_information' as const,
      requestedAction: body().requestedAction,
      publicMessage: body().publicMessage,
      holdDays: null,
      nextReviewAt: null,
      requiredAction: null,
      changedAt: now.toISOString(),
    }));

    const response = await createReviewFollowupHandler({
      runReviewFollowup,
      now: () => now,
    })(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      state: 'committed',
      action: 'request_information',
      toStatus: 'needs_information',
    });
    expect(runReviewFollowup).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:review-followup'],
      },
      submissionId,
      body(),
      expect.any(Object),
      now,
    );
  });

  it('denies missing identity and fails closed when authorization is not configured', async () => {
    const runReviewFollowup = vi.fn();
    const denied = await createReviewFollowupHandler({ runReviewFollowup })(
      context({ identity: null }),
    );
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toEqual({ error: 'submission_review_followup_denied' });

    const unavailable = await createReviewFollowupHandler({ runReviewFollowup })(
      context({ subjects: '' }),
    );
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({
      error: 'submission_review_followup_unavailable',
    });
    expect(runReviewFollowup).not.toHaveBeenCalled();
  });

  it('requires JSON and a scalar route parameter', async () => {
    const runReviewFollowup = vi.fn();
    const mediaType = await createReviewFollowupHandler({ runReviewFollowup })(
      context({ contentType: 'text/plain' }),
    );
    expect(mediaType.status).toBe(415);

    const invalidParameter = await createReviewFollowupHandler({ runReviewFollowup })(
      context({ submissionId: [submissionId] }),
    );
    expect(invalidParameter.status).toBe(400);
    expect(runReviewFollowup).not.toHaveBeenCalled();
  });

  it('maps exact-state and idempotency conflicts to bounded 409', async () => {
    for (const code of ['conflict', 'idempotency_conflict'] as const) {
      const response = await createReviewFollowupHandler({
        runReviewFollowup: vi.fn(async () => {
          throw new ReviewFollowupError(code, 'private conflict detail');
        }),
      })(context());
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: 'submission_review_followup_conflict',
      });
    }
  });

  it('does not leak backend details', async () => {
    const response = await createReviewFollowupHandler({
      runReviewFollowup: vi.fn(async () => {
        throw new Error('private database detail');
      }),
    })(context());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'submission_review_followup_unavailable',
    });
  });
});
