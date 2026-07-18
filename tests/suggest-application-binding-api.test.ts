import { describe, expect, it, vi } from 'vitest';
import { createSuggestApplicationBindingHandler } from '../functions/admin/api/suggest-applications/[applicationId]/bind-promotion';
import { SuggestApplicationBindingError } from '../src/admin/submissions/suggest-application-binding';

const applicationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000001';
const candidateId = '30000000-0000-4000-8000-000000000001';
const promotionDecisionId = '40000000-0000-4000-8000-000000000001';
const requestId = '50000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-18T06:10:00.000Z');
const identity = {
  actorId: 'cloudflare-access:suggest-application-operator',
  actorType: 'human' as const,
  subject: 'suggest-application-operator',
  email: 'operator@example.com',
};

function body() {
  return {
    schemaVersion: 'suggest-application-binding-v1',
    requestId,
    promotionDecisionId,
    expectedApplicationUpdatedAt: '2026-07-18T06:05:00.000Z',
  };
}

function context(
  overrides: {
    identity?: unknown;
    subjects?: string;
    contentType?: string;
    applicationId?: string | string[];
    requestBody?: unknown;
  } = {},
) {
  return {
    request: new Request(
      `https://example.test/admin/api/suggest-applications/${applicationId}/bind-promotion`,
      {
        method: 'POST',
        headers: { 'Content-Type': overrides.contentType ?? 'application/json' },
        body: JSON.stringify(overrides.requestBody ?? body()),
      },
    ),
    env: {
      CPM_ADMIN_SUGGEST_APPLICATION_BINDING_SUBJECTS:
        overrides.subjects ?? JSON.stringify(['suggest-application-operator']),
    },
    params: { applicationId: overrides.applicationId ?? applicationId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

describe('P5-07C protected Suggest application-binding API', () => {
  it('binds an exact promotion receipt for an authorized subject', async () => {
    const runBinding = vi.fn(async () => ({
      state: 'committed' as const,
      applicationId,
      submissionId,
      candidateId,
      promotionDecisionId,
      applicationStatus: 'committed' as const,
      publicationStatus: 'pending' as const,
      transitionEventId: requestId,
      boundAt: now.toISOString(),
    }));
    const response = await createSuggestApplicationBindingHandler({
      runBinding,
      now: () => now,
    })(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      state: 'committed',
      candidateId,
      promotionDecisionId,
    });
    expect(runBinding).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:suggest-application:bind'],
      },
      applicationId,
      body(),
      expect.any(Object),
      now,
    );
  });

  it('fails closed for missing identity, configuration, and media type', async () => {
    const runBinding = vi.fn();
    const denied = await createSuggestApplicationBindingHandler({ runBinding })(
      context({ identity: null }),
    );
    expect(denied.status).toBe(403);

    const unavailable = await createSuggestApplicationBindingHandler({ runBinding })(
      context({ subjects: '' }),
    );
    expect(unavailable.status).toBe(503);
    expect(runBinding).not.toHaveBeenCalled();

    const mediaType = await createSuggestApplicationBindingHandler({ runBinding })(
      context({ contentType: 'text/plain' }),
    );
    expect(mediaType.status).toBe(415);
  });

  it('maps bounded binding errors without leaking private details', async () => {
    for (const [code, status] of [
      ['invalid_request', 400],
      ['not_found', 404],
      ['ineligible', 422],
      ['conflict', 409],
      ['idempotency_conflict', 409],
    ] as const) {
      const response = await createSuggestApplicationBindingHandler({
        runBinding: vi.fn(async () => {
          throw new SuggestApplicationBindingError(code, 'private database detail');
        }),
      })(context());
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain('private database detail');
    }

    const unavailable = await createSuggestApplicationBindingHandler({
      runBinding: vi.fn(async () => {
        throw new Error('private database detail');
      }),
    })(context());
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({
      error: 'suggest_application_binding_unavailable',
    });
  });
});
