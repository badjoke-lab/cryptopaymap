import { describe, expect, it, vi } from 'vitest';
import { createAcceptedCandidateHandler } from '../functions/admin/api/submissions/[submissionId]/accept-candidate';
import { SuggestAcceptedCandidateError } from '../src/admin/submissions/accepted-candidate';

const submissionId = '10000000-0000-4000-8000-000000000001';
const sourceId = '30000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-10T06:05:00.000Z');
const identity = {
  actorId: 'cloudflare-access:candidate-reviewer',
  actorType: 'human' as const,
  subject: 'candidate-reviewer',
  email: 'reviewer@example.com',
};

function body() {
  return {
    schemaVersion: 'suggest-accepted-candidate-v1',
    requestId,
    expectedStatus: 'in_review',
    expectedUpdatedAt: '2026-07-10T06:00:00.000Z',
    reasonCode: 'useful_but_incomplete',
    note: 'Useful lead requiring more verification.',
  };
}

function context(
  overrides: {
    identity?: unknown;
    subjects?: string;
    sourceId?: string;
    contentType?: string;
    submissionId?: string | string[];
    requestBody?: unknown;
  } = {},
) {
  return {
    request: new Request(
      `https://example.test/admin/api/submissions/${submissionId}/accept-candidate`,
      {
        method: 'POST',
        headers: { 'Content-Type': overrides.contentType ?? 'application/json' },
        body: JSON.stringify(overrides.requestBody ?? body()),
      },
    ),
    env: {
      CPM_ADMIN_SUBMISSION_CANDIDATE_SUBJECTS:
        overrides.subjects ?? JSON.stringify(['candidate-reviewer']),
      CPM_USER_SUBMISSION_SOURCE_ID: overrides.sourceId ?? sourceId,
    },
    params: { submissionId: overrides.submissionId ?? submissionId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

describe('P5-02H protected accepted-as-Candidate API', () => {
  it('runs Candidate creation only for an explicitly authorized subject and configured source', async () => {
    const runAcceptedCandidate = vi.fn(async () => ({
      state: 'committed' as const,
      submissionId,
      candidateId: '40000000-0000-4000-8000-000000000001',
      sourceRecordId: '50000000-0000-4000-8000-000000000001',
      fromStatus: 'in_review' as const,
      toStatus: 'resolved' as const,
      resolution: 'accepted_as_candidate' as const,
      reasonCode: 'useful_but_incomplete' as const,
      decidedAt: now.toISOString(),
    }));
    const response = await createAcceptedCandidateHandler({
      runAcceptedCandidate,
      now: () => now,
    })(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      state: 'committed',
      resolution: 'accepted_as_candidate',
    });
    expect(runAcceptedCandidate).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:candidate:create'],
      },
      submissionId,
      sourceId,
      body(),
      expect.any(Object),
      now,
    );
  });

  it('denies missing Candidate-create identity before runner access', async () => {
    const runAcceptedCandidate = vi.fn();
    const response = await createAcceptedCandidateHandler({ runAcceptedCandidate })(
      context({ identity: null }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'accepted_candidate_denied' });
    expect(runAcceptedCandidate).not.toHaveBeenCalled();
  });

  it('fails closed when Candidate authorization or source-channel configuration is missing', async () => {
    const runAcceptedCandidate = vi.fn();
    const noPolicy = await createAcceptedCandidateHandler({ runAcceptedCandidate })(
      context({ subjects: '' }),
    );
    expect(noPolicy.status).toBe(503);

    const badSource = await createAcceptedCandidateHandler({ runAcceptedCandidate })(
      context({ sourceId: 'not-a-uuid' }),
    );
    expect(badSource.status).toBe(503);
    expect(runAcceptedCandidate).not.toHaveBeenCalled();
  });

  it('requires JSON and a scalar Submission route parameter', async () => {
    const runAcceptedCandidate = vi.fn();
    const mediaTypeResponse = await createAcceptedCandidateHandler({ runAcceptedCandidate })(
      context({ contentType: 'text/plain' }),
    );
    expect(mediaTypeResponse.status).toBe(415);

    const parameterResponse = await createAcceptedCandidateHandler({ runAcceptedCandidate })(
      context({ submissionId: [submissionId] }),
    );
    expect(parameterResponse.status).toBe(400);
    expect(runAcceptedCandidate).not.toHaveBeenCalled();
  });

  it('maps stale-state and replay conflicts to one bounded 409 response', async () => {
    for (const code of ['conflict', 'idempotency_conflict'] as const) {
      const response = await createAcceptedCandidateHandler({
        runAcceptedCandidate: vi.fn(async () => {
          throw new SuggestAcceptedCandidateError(code, 'private conflict detail');
        }),
      })(context());
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: 'accepted_candidate_conflict' });
    }
  });

  it('does not leak backend failure detail', async () => {
    const response = await createAcceptedCandidateHandler({
      runAcceptedCandidate: vi.fn(async () => {
        throw new Error('private database detail');
      }),
    })(context());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'accepted_candidate_unavailable' });
  });
});
