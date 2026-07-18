import { describe, expect, it, vi } from 'vitest';
import {
  createApplicationLifecycleGetHandler,
  createApplicationLifecyclePostHandler,
} from '../functions/admin/api/application-lifecycle/[applicationId]';
import { SubmissionApplicationLifecycleError } from '../src/admin/submissions/application-lifecycle';

const applicationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000001';
const sourceDecisionEventId = '30000000-0000-4000-8000-000000000001';
const transitionEventId = '40000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-18T06:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:application-operator',
  actorType: 'human' as const,
  subject: 'application-operator',
  email: 'operator@example.com',
};

function transitionBody() {
  return {
    schemaVersion: 'submission-application-transition-v1',
    requestId: transitionEventId,
    operation: 'commit_application',
    expectedApplicationStatus: 'pending',
    expectedPublicationStatus: 'blocked',
    expectedUpdatedAt: '2026-07-18T05:00:00.000Z',
    receipt: {
      kind: 'submission_event',
      ids: ['50000000-0000-4000-8000-000000000001'],
    },
  };
}

function context(
  method: 'GET' | 'POST',
  overrides: {
    identity?: unknown;
    readSubjects?: string;
    transitionSubjects?: string;
    contentType?: string;
    applicationId?: string | string[];
    body?: unknown;
  } = {},
) {
  return {
    request: new Request(`https://example.test/admin/api/application-lifecycle/${applicationId}`, {
      method,
      headers:
        method === 'POST'
          ? { 'Content-Type': overrides.contentType ?? 'application/json' }
          : undefined,
      body: method === 'POST' ? JSON.stringify(overrides.body ?? transitionBody()) : undefined,
    }),
    env: {
      CPM_ADMIN_SUBMISSION_APPLICATION_READ_SUBJECTS:
        overrides.readSubjects ?? JSON.stringify(['application-operator']),
      CPM_ADMIN_SUBMISSION_APPLICATION_TRANSITION_SUBJECTS:
        overrides.transitionSubjects ?? JSON.stringify(['application-operator']),
    },
    params: { applicationId: overrides.applicationId ?? applicationId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

describe('P5-07B2 protected application lifecycle API', () => {
  it('returns a bounded lifecycle projection for an authorized reader', async () => {
    const readLifecycle = vi.fn(async () => ({
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
      registeredAt: '2026-07-18T05:00:00.000Z',
      updatedAt: '2026-07-18T05:00:00.000Z',
      events: [
        {
          eventId: '60000000-0000-4000-8000-000000000001',
          action: 'registered' as const,
          fromApplicationStatus: null,
          toApplicationStatus: 'pending' as const,
          fromPublicationStatus: null,
          toPublicationStatus: 'blocked' as const,
          createdAt: '2026-07-18T05:00:00.000Z',
        },
      ],
    }));
    const response = await createApplicationLifecycleGetHandler({ readLifecycle })(context('GET'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      applicationId,
      applicationStatus: 'pending',
      events: [{ action: 'registered' }],
    });
    expect(readLifecycle).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:application:read'],
      },
      applicationId,
      expect.any(Object),
    );
  });

  it('runs an exact transition for an authorized operator', async () => {
    const runTransition = vi.fn(async () => ({
      state: 'committed' as const,
      transitionEventId,
      applicationId,
      action: 'application_committed' as const,
      fromApplicationStatus: 'pending' as const,
      toApplicationStatus: 'committed' as const,
      fromPublicationStatus: 'blocked' as const,
      toPublicationStatus: 'pending' as const,
      receipt: transitionBody().receipt,
      changedAt: now.toISOString(),
    }));
    const response = await createApplicationLifecyclePostHandler({
      runTransition,
      now: () => now,
    })(context('POST'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      transitionEventId,
      action: 'application_committed',
    });
    expect(runTransition).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:application:transition'],
      },
      applicationId,
      transitionBody(),
      expect.any(Object),
      now,
    );
  });

  it('fails closed for identity, configuration, and media type errors', async () => {
    const readLifecycle = vi.fn();
    const denied = await createApplicationLifecycleGetHandler({ readLifecycle })(
      context('GET', { identity: null }),
    );
    expect(denied.status).toBe(403);

    const unavailable = await createApplicationLifecycleGetHandler({ readLifecycle })(
      context('GET', { readSubjects: '' }),
    );
    expect(unavailable.status).toBe(503);
    expect(readLifecycle).not.toHaveBeenCalled();

    const mediaType = await createApplicationLifecyclePostHandler({
      runTransition: vi.fn(),
    })(context('POST', { contentType: 'text/plain' }));
    expect(mediaType.status).toBe(415);
  });

  it('maps bounded lifecycle failures without exposing internal details', async () => {
    for (const [code, status] of [
      ['invalid_request', 400],
      ['not_found', 404],
      ['conflict', 409],
      ['idempotency_conflict', 409],
    ] as const) {
      const response = await createApplicationLifecyclePostHandler({
        runTransition: vi.fn(async () => {
          throw new SubmissionApplicationLifecycleError(code, 'private database detail');
        }),
      })(context('POST'));
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain('private database detail');
    }

    const unavailable = await createApplicationLifecycleGetHandler({
      readLifecycle: vi.fn(async () => {
        throw new Error('private database detail');
      }),
    })(context('GET'));
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({
      error: 'application_lifecycle_unavailable',
    });
  });
});
