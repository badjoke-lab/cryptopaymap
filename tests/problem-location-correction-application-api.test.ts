import { describe, expect, it, vi } from 'vitest';
import { createProblemLocationCorrectionApplicationHandler } from '../functions/admin/api/problem-applications/[applicationId]/apply-location-correction';
import { ProblemLocationCorrectionApplicationError } from '../src/admin/submissions/problem-location-correction-application';

const applicationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000001';
const locationId = '30000000-0000-4000-8000-000000000001';
const sourceId = '40000000-0000-4000-8000-000000000001';
const sourceRecordId = '50000000-0000-4000-8000-000000000001';
const requestId = '60000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-18T08:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:problem-location-correction-operator',
  actorType: 'human' as const,
  subject: 'problem-location-correction-operator',
  email: 'operator@example.com',
};

function body() {
  return {
    schemaVersion: 'problem-location-correction-application-v1',
    requestId,
    expectedApplicationUpdatedAt: '2026-07-18T07:00:00.000Z',
    expectedLocationUpdatedAt: '2026-07-18T06:00:00.000Z',
  };
}

function context(
  overrides: {
    identity?: unknown;
    subjects?: string;
    sourceId?: string;
    contentType?: string;
    applicationId?: string | string[];
    requestBody?: unknown;
  } = {},
) {
  return {
    request: new Request(
      `https://example.test/admin/api/problem-applications/${applicationId}/apply-location-correction`,
      {
        method: 'POST',
        headers: { 'Content-Type': overrides.contentType ?? 'application/json' },
        body: JSON.stringify(overrides.requestBody ?? body()),
      },
    ),
    env: {
      CPM_ADMIN_PROBLEM_LOCATION_CORRECTION_SUBJECTS:
        overrides.subjects ?? JSON.stringify(['problem-location-correction-operator']),
      CPM_USER_SUBMISSION_SOURCE_ID: overrides.sourceId ?? sourceId,
    },
    params: { applicationId: overrides.applicationId ?? applicationId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

describe('P5-07D1 protected Problem Location correction application API', () => {
  it('applies an approved Location correction for an authorized subject', async () => {
    const runApplication = vi.fn(async () => ({
      state: 'committed' as const,
      applicationId,
      submissionId,
      locationId,
      correctionDecisionRequestId: requestId,
      sourceRecordId,
      appliedFieldPaths: ['addressLine'],
      applicationStatus: 'committed' as const,
      publicationStatus: 'pending' as const,
      transitionEventId: requestId,
      appliedAt: now.toISOString(),
    }));
    const response = await createProblemLocationCorrectionApplicationHandler({
      runApplication,
      now: () => now,
    })(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      state: 'committed',
      locationId,
      correctionDecisionRequestId: requestId,
    });
    expect(runApplication).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:problem-location-correction:apply'],
      },
      applicationId,
      sourceId,
      body(),
      expect.any(Object),
      now,
    );
  });

  it('fails closed for missing identity, authorization, source channel, and media type', async () => {
    const runApplication = vi.fn();
    const denied = await createProblemLocationCorrectionApplicationHandler({ runApplication })(
      context({ identity: null }),
    );
    expect(denied.status).toBe(403);

    const authorizationUnavailable = await createProblemLocationCorrectionApplicationHandler({
      runApplication,
    })(context({ subjects: '' }));
    expect(authorizationUnavailable.status).toBe(503);

    const sourceUnavailable = await createProblemLocationCorrectionApplicationHandler({
      runApplication,
    })(context({ sourceId: 'not-a-uuid' }));
    expect(sourceUnavailable.status).toBe(503);

    const mediaType = await createProblemLocationCorrectionApplicationHandler({ runApplication })(
      context({ contentType: 'text/plain' }),
    );
    expect(mediaType.status).toBe(415);
    expect(runApplication).not.toHaveBeenCalled();
  });

  it('maps bounded application errors without leaking private details', async () => {
    for (const [code, status] of [
      ['invalid_request', 400],
      ['not_found', 404],
      ['ineligible', 422],
      ['conflict', 409],
      ['idempotency_conflict', 409],
    ] as const) {
      const response = await createProblemLocationCorrectionApplicationHandler({
        runApplication: vi.fn(async () => {
          throw new ProblemLocationCorrectionApplicationError(code, 'private database detail');
        }),
      })(context());
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain('private database detail');
    }

    const unavailable = await createProblemLocationCorrectionApplicationHandler({
      runApplication: vi.fn(async () => {
        throw new Error('private database detail');
      }),
    })(context());
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({
      error: 'problem_location_correction_application_unavailable',
    });
  });
});
