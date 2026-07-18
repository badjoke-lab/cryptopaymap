import { describe, expect, it, vi } from 'vitest';
import { createNegativeRecheckApplicationGetHandler } from '../functions/admin/api/report-applications/[applicationId]/recheck-signal';
import { NegativeRecheckApplicationError } from '../src/admin/submissions/negative-recheck-application';

const applicationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000001';
const eventId = '30000000-0000-4000-8000-000000000001';
const evidenceId = '40000000-0000-4000-8000-000000000001';
const claimId = '50000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-18T08:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:negative-recheck-operator',
  actorType: 'human' as const,
  subject: 'negative-recheck-operator',
  email: 'operator@example.com',
};

function context(overrides: {
  identity?: unknown;
  subjects?: string;
  applicationId?: string | string[];
} = {}) {
  return {
    request: new Request(
      `https://example.test/admin/api/report-applications/${applicationId}/recheck-signal`,
      { method: 'GET' },
    ),
    env: {
      CPM_ADMIN_NEGATIVE_RECHECK_APPLICATION_SUBJECTS:
        overrides.subjects ?? JSON.stringify(['negative-recheck-operator']),
    },
    params: { applicationId: overrides.applicationId ?? applicationId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

function projection() {
  return {
    schemaVersion: 'negative-recheck-application-projection-v1' as const,
    generatedAt: now.toISOString(),
    application: {
      applicationId,
      submissionId,
      submissionType: 'problem_report' as const,
      sourceDecisionEventId: eventId,
      applicationStatus: 'committed' as const,
      publicationStatus: 'pending' as const,
      receiptKind: 'submission_event' as const,
      receiptEventId: eventId,
    },
    signal: {
      status: 'active' as const,
      decisionEventId: eventId,
      evidenceId,
      claimId,
      signalAt: '2026-07-18T06:00:00.000Z',
      claimStatus: 'confirmed' as const,
      claimVisibility: 'public' as const,
      nextReviewAt: '2026-08-01T00:00:00.000Z',
      queueProjection: {
        queueReason: 'negative_evidence' as const,
        recommendedAction: 'review' as const,
        dueAt: '2026-07-18T06:00:00.000Z',
        daysUntilReview: 0,
        priority: 5,
      },
      resolution: null,
    },
  };
}

describe('P5-07D2 protected negative recheck application API', () => {
  it('returns a bounded private no-store projection for an authorized subject', async () => {
    const readApplication = vi.fn(async () => projection());
    const response = await createNegativeRecheckApplicationGetHandler({
      readApplication,
      now: () => now,
    })(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual(projection());
    expect(readApplication).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:negative-recheck-application:read'],
      },
      applicationId,
      expect.any(Object),
      now,
    );
  });

  it('fails closed for missing identity, missing policy, and invalid application parameters', async () => {
    const readApplication = vi.fn();
    const denied = await createNegativeRecheckApplicationGetHandler({ readApplication })(
      context({ identity: null }),
    );
    expect(denied.status).toBe(403);

    const unavailable = await createNegativeRecheckApplicationGetHandler({ readApplication })(
      context({ subjects: '' }),
    );
    expect(unavailable.status).toBe(503);

    const invalid = await createNegativeRecheckApplicationGetHandler({ readApplication })(
      context({ applicationId: ['invalid'] }),
    );
    expect(invalid.status).toBe(400);
    expect(readApplication).not.toHaveBeenCalled();
  });

  it('maps bounded errors without exposing Evidence or reviewer details', async () => {
    for (const [code, status] of [
      ['invalid_request', 400],
      ['not_found', 404],
      ['ineligible', 422],
    ] as const) {
      const response = await createNegativeRecheckApplicationGetHandler({
        readApplication: vi.fn(async () => {
          throw new NegativeRecheckApplicationError(code, 'private Evidence URL and note');
        }),
      })(context());
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain('private Evidence URL');
    }

    const unavailable = await createNegativeRecheckApplicationGetHandler({
      readApplication: vi.fn(async () => {
        throw new Error('private database detail');
      }),
    })(context());
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({
      error: 'negative_recheck_application_unavailable',
    });
  });
});
