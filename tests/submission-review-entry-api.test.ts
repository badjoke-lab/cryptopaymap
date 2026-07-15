import { describe, expect, it, vi } from 'vitest';
import { createReviewEntryHandler } from '../functions/admin/api/review-entry/[submissionId]';
import { ReviewEntryError } from '../src/admin/submissions/review-entry';

const submissionId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-15T15:10:00.000Z');
const identity = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human' as const,
  subject: 'reviewer-subject',
  email: 'reviewer@example.com',
};

function body() {
  return {
    schemaVersion: 'submission-review-entry-v1',
    requestId,
    submissionType: 'payment_report',
    action: 'begin_triage',
    expectedStatus: 'received',
    expectedUpdatedAt: '2026-07-15T15:00:00.000Z',
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
    request: new Request(`https://example.test/admin/api/review-entry/${submissionId}`, {
      method: 'POST',
      headers: { 'Content-Type': overrides.contentType ?? 'application/json' },
      body: JSON.stringify(overrides.requestBody ?? body()),
    }),
    env: {
      CPM_ADMIN_SUBMISSION_REVIEW_ENTRY_SUBJECTS:
        overrides.subjects ?? JSON.stringify(['reviewer-subject']),
    },
    params: { submissionId: overrides.submissionId ?? submissionId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

describe('P5-06B1 protected Submission review-entry API', () => {
  it('runs review entry for an explicitly authorized subject', async () => {
    const runReviewEntry = vi.fn(async () => ({
      state: 'committed' as const,
      submissionId,
      submissionType: 'payment_report' as const,
      fromStatus: 'received' as const,
      toStatus: 'triage' as const,
      action: 'begin_triage' as const,
      changedAt: now.toISOString(),
    }));

    const response = await createReviewEntryHandler({
      runReviewEntry,
      now: () => now,
    })(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      state: 'committed',
      submissionType: 'payment_report',
      toStatus: 'triage',
    });
    expect(runReviewEntry).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:review-entry'],
      },
      submissionId,
      body(),
      expect.any(Object),
      now,
    );
  });

  it('denies missing identity and fails closed when authorization is not configured', async () => {
    const runReviewEntry = vi.fn();
    const denied = await createReviewEntryHandler({ runReviewEntry })(context({ identity: null }));
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toEqual({ error: 'submission_review_entry_denied' });

    const unavailable = await createReviewEntryHandler({ runReviewEntry })(
      context({ subjects: '' }),
    );
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({
      error: 'submission_review_entry_unavailable',
    });
    expect(runReviewEntry).not.toHaveBeenCalled();
  });

  it('requires JSON and a scalar route parameter', async () => {
    const runReviewEntry = vi.fn();
    const mediaType = await createReviewEntryHandler({ runReviewEntry })(
      context({ contentType: 'text/plain' }),
    );
    expect(mediaType.status).toBe(415);

    const invalidParameter = await createReviewEntryHandler({ runReviewEntry })(
      context({ submissionId: [submissionId] }),
    );
    expect(invalidParameter.status).toBe(400);
    expect(runReviewEntry).not.toHaveBeenCalled();
  });

  it('maps exact-state and idempotency conflicts to bounded 409', async () => {
    for (const code of ['conflict', 'idempotency_conflict'] as const) {
      const response = await createReviewEntryHandler({
        runReviewEntry: vi.fn(async () => {
          throw new ReviewEntryError(code, 'private conflict detail');
        }),
      })(context());
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: 'submission_review_entry_conflict',
      });
    }
  });

  it('does not leak backend details', async () => {
    const response = await createReviewEntryHandler({
      runReviewEntry: vi.fn(async () => {
        throw new Error('private database detail');
      }),
    })(context());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'submission_review_entry_unavailable',
    });
  });
});
