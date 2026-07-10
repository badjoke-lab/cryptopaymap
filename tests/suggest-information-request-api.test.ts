import { describe, expect, it, vi } from 'vitest';
import { createInformationRequestHandler } from '../functions/admin/api/submissions/[submissionId]/request-information';
import { SuggestInformationRequestError } from '../src/admin/submissions/information-request';

const submissionId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-10T04:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human' as const,
  subject: 'reviewer-subject',
  email: 'reviewer@example.com',
};

function body() {
  return {
    schemaVersion: 'suggest-information-request-v1',
    requestId,
    expectedStatus: 'in_review',
    expectedUpdatedAt: '2026-07-10T03:00:00.000Z',
    requestedAction: 'Please confirm the payment network.',
    publicMessage: 'We need the network before review can continue.',
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
    request: new Request(
      `https://example.test/admin/api/submissions/${submissionId}/request-information`,
      {
        method: 'POST',
        headers: { 'Content-Type': overrides.contentType ?? 'application/json' },
        body: JSON.stringify(overrides.requestBody ?? body()),
      },
    ),
    env: {
      CPM_ADMIN_SUBMISSION_TRANSITION_SUBJECTS:
        overrides.subjects ?? JSON.stringify(['reviewer-subject']),
    },
    params: { submissionId: overrides.submissionId ?? submissionId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

describe('P5-02F protected Suggest information request API', () => {
  it('commits a bounded information request for an authorized transition subject', async () => {
    const runRequest = vi.fn(async () => ({
      state: 'committed' as const,
      submissionId,
      fromStatus: 'in_review' as const,
      toStatus: 'needs_information' as const,
      requestedAction: body().requestedAction,
      publicMessage: body().publicMessage,
      changedAt: now.toISOString(),
    }));
    const response = await createInformationRequestHandler({ runRequest, now: () => now })(
      context(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      state: 'committed',
      toStatus: 'needs_information',
      requestedAction: body().requestedAction,
    });
    expect(runRequest).toHaveBeenCalledWith(
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
    const runRequest = vi.fn();
    const response = await createInformationRequestHandler({ runRequest })(
      context({ identity: null }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'information_request_denied' });
    expect(runRequest).not.toHaveBeenCalled();
  });

  it('requires configured transition authorization', async () => {
    const runRequest = vi.fn();
    const response = await createInformationRequestHandler({ runRequest })(
      context({ subjects: '' }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'information_request_unavailable' });
    expect(runRequest).not.toHaveBeenCalled();
  });

  it('requires JSON and a scalar Submission route parameter', async () => {
    const runRequest = vi.fn();
    const mediaTypeResponse = await createInformationRequestHandler({ runRequest })(
      context({ contentType: 'text/plain' }),
    );
    expect(mediaTypeResponse.status).toBe(415);

    const parameterResponse = await createInformationRequestHandler({ runRequest })(
      context({ submissionId: [submissionId] }),
    );
    expect(parameterResponse.status).toBe(400);
    expect(runRequest).not.toHaveBeenCalled();
  });

  it('maps stale-state and replay-content conflicts to one bounded 409 response', async () => {
    for (const code of ['conflict', 'idempotency_conflict'] as const) {
      const response = await createInformationRequestHandler({
        runRequest: vi.fn(async () => {
          throw new SuggestInformationRequestError(code, 'private conflict detail');
        }),
      })(context());
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: 'information_request_conflict' });
    }
  });

  it('does not leak backend error details', async () => {
    const response = await createInformationRequestHandler({
      runRequest: vi.fn(async () => {
        throw new Error('private database detail');
      }),
    })(context());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'information_request_unavailable' });
  });
});
