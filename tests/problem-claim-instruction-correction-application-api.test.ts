import { describe, expect, it, vi } from 'vitest';
import { createProblemClaimInstructionCorrectionHandler } from '../functions/admin/api/problem-applications/[applicationId]/apply-claim-instructions';
import { ProblemClaimInstructionCorrectionApplicationError } from '../src/admin/submissions/problem-claim-instruction-correction-application';

const applicationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000001';
const claimId = '30000000-0000-4000-8000-000000000001';
const sourceId = '40000000-0000-4000-8000-000000000001';
const sourceRecordId = '50000000-0000-4000-8000-000000000001';
const verificationEventId = '60000000-0000-4000-8000-000000000001';
const requestId = '70000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-18T12:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:claim-instruction-operator',
  actorType: 'human' as const,
  subject: 'claim-instruction-operator',
  email: 'operator@example.com',
};

function body() {
  return {
    schemaVersion: 'problem-claim-instruction-correction-application-v1',
    requestId,
    expectedApplicationUpdatedAt: '2026-07-18T11:00:00.000Z',
    expectedClaimUpdatedAt: '2026-07-18T10:00:00.000Z',
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
      `https://example.test/admin/api/problem-applications/${applicationId}/apply-claim-instructions`,
      {
        method: 'POST',
        headers: { 'Content-Type': overrides.contentType ?? 'application/json' },
        body: JSON.stringify(overrides.requestBody ?? body()),
      },
    ),
    env: {
      CPM_ADMIN_PROBLEM_CLAIM_INSTRUCTION_CORRECTION_SUBJECTS:
        overrides.subjects ?? JSON.stringify(['claim-instruction-operator']),
      CPM_USER_SUBMISSION_SOURCE_ID: overrides.sourceId ?? sourceId,
    },
    params: { applicationId: overrides.applicationId ?? applicationId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

describe('P5-07D4 protected Claim instruction correction application API', () => {
  it('applies an approved Claim instruction correction for an authorized subject', async () => {
    const runApplication = vi.fn(async () => ({
      state: 'committed' as const,
      applicationId,
      submissionId,
      claimId,
      correctionEventId: requestId,
      sourceRecordId,
      verificationEventId,
      applicationStatus: 'committed' as const,
      publicationStatus: 'pending' as const,
      transitionEventId: requestId,
      appliedAt: now.toISOString(),
    }));
    const response = await createProblemClaimInstructionCorrectionHandler({
      runApplication,
      now: () => now,
    })(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      state: 'committed',
      claimId,
      correctionEventId: requestId,
    });
    expect(runApplication).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:problem-claim-instructions:apply'],
      },
      applicationId,
      sourceId,
      body(),
      expect.any(Object),
      now,
    );
  });

  it('fails closed before parsing for identity, authorization, source, and media-type failures', async () => {
    const runApplication = vi.fn();
    const denied = await createProblemClaimInstructionCorrectionHandler({ runApplication })(
      context({ identity: null }),
    );
    expect(denied.status).toBe(403);

    const authorizationUnavailable = await createProblemClaimInstructionCorrectionHandler({
      runApplication,
    })(context({ subjects: '' }));
    expect(authorizationUnavailable.status).toBe(503);

    const sourceUnavailable = await createProblemClaimInstructionCorrectionHandler({
      runApplication,
    })(context({ sourceId: 'not-a-uuid' }));
    expect(sourceUnavailable.status).toBe(503);

    const mediaType = await createProblemClaimInstructionCorrectionHandler({ runApplication })(
      context({ contentType: 'text/plain' }),
    );
    expect(mediaType.status).toBe(415);
    expect(runApplication).not.toHaveBeenCalled();
  });

  it('maps bounded errors without leaking Claim, source, or reviewer details', async () => {
    for (const [code, status] of [
      ['invalid_request', 400],
      ['not_found', 404],
      ['ineligible', 422],
      ['conflict', 409],
      ['idempotency_conflict', 409],
    ] as const) {
      const response = await createProblemClaimInstructionCorrectionHandler({
        runApplication: vi.fn(async () => {
          throw new ProblemClaimInstructionCorrectionApplicationError(
            code,
            'private Claim and reviewer detail',
          );
        }),
      })(context());
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain('private Claim');
    }

    const unavailable = await createProblemClaimInstructionCorrectionHandler({
      runApplication: vi.fn(async () => {
        throw new Error('private database detail');
      }),
    })(context());
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({
      error: 'problem_claim_instruction_correction_unavailable',
    });
  });
});
