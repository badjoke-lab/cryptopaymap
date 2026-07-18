import { describe, expect, it, vi } from 'vitest';
import { createApplicationRegistrationHandler } from '../functions/admin/api/application-registration/[submissionId]';
import { SubmissionApplicationRegistrationError } from '../src/admin/submissions/application-registration';

const submissionId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const sourceDecisionEventId = '30000000-0000-4000-8000-000000000001';
const applicationId = '40000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-17T06:05:00.000Z');
const identity = {
  actorId: 'cloudflare-access:application-reviewer',
  actorType: 'human' as const,
  subject: 'application-reviewer',
  email: 'reviewer@example.com',
};

function body() {
  return {
    schemaVersion: 'submission-application-registration-v1',
    requestId,
    sourceDecisionKind: 'problem_correction_handoff',
    sourceDecisionEventId,
    expectedSubmissionUpdatedAt: '2026-07-17T06:00:00.000Z',
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
      `https://example.test/admin/api/application-registration/${submissionId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': overrides.contentType ?? 'application/json' },
        body: JSON.stringify(overrides.requestBody ?? body()),
      },
    ),
    env: {
      CPM_ADMIN_SUBMISSION_APPLICATION_REGISTRATION_SUBJECTS:
        overrides.subjects ?? JSON.stringify(['application-reviewer']),
    },
    params: { submissionId: overrides.submissionId ?? submissionId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

describe('P5-07B1 protected application-registration API', () => {
  it('registers an application for an explicitly authorized subject', async () => {
    const runRegistration = vi.fn(async () => ({
      state: 'committed' as const,
      applicationId,
      submissionId,
      submissionType: 'problem_report' as const,
      sourceDecisionKind: 'problem_correction_handoff' as const,
      sourceDecisionEventId,
      applicationKind: 'problem_correction' as const,
      applicationStatus: 'pending' as const,
      publicationStatus: 'blocked' as const,
      applicationReceipt: null,
      publicationReceipt: null,
      registeredAt: now.toISOString(),
    }));

    const response = await createApplicationRegistrationHandler({
      runRegistration,
      now: () => now,
    })(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    await expect(response.json()).resolves.toMatchObject({
      applicationId,
      applicationStatus: 'pending',
      publicationStatus: 'blocked',
    });
    expect(runRegistration).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:application:register'],
      },
      submissionId,
      body(),
      expect.any(Object),
      now,
    );
  });

  it('fails closed for missing identity or authorization configuration', async () => {
    const runRegistration = vi.fn();
    const denied = await createApplicationRegistrationHandler({ runRegistration })(
      context({ identity: null }),
    );
    expect(denied.status).toBe(403);

    const unavailable = await createApplicationRegistrationHandler({ runRegistration })(
      context({ subjects: '' }),
    );
    expect(unavailable.status).toBe(503);
    expect(runRegistration).not.toHaveBeenCalled();
  });

  it('maps media type and bounded service errors without leaking private details', async () => {
    const mediaType = await createApplicationRegistrationHandler({
      runRegistration: vi.fn(),
    })(context({ contentType: 'text/plain' }));
    expect(mediaType.status).toBe(415);

    for (const [code, status] of [
      ['invalid_request', 400],
      ['not_found', 404],
      ['ineligible', 422],
      ['conflict', 409],
      ['idempotency_conflict', 409],
    ] as const) {
      const response = await createApplicationRegistrationHandler({
        runRegistration: vi.fn(async () => {
          throw new SubmissionApplicationRegistrationError(code, 'private detail');
        }),
      })(context());
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain('private detail');
    }

    const unavailable = await createApplicationRegistrationHandler({
      runRegistration: vi.fn(async () => {
        throw new Error('private database detail');
      }),
    })(context());
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({
      error: 'application_registration_unavailable',
    });
  });
});
