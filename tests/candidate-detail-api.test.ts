import { describe, expect, it, vi } from 'vitest';
import { createCandidateDetailHandler } from '../functions/admin/api/candidates/[candidateId]';
import { CandidateDetailError, type CandidateDetailResponse } from '../src/admin/candidates/detail';

const candidateId = '00000000-0000-4000-8000-000000000001';
const identity = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human' as const,
  subject: 'reviewer-subject',
  email: 'reviewer@example.com',
};
const now = new Date('2026-06-29T00:00:00.000Z');

function detailResponse(): CandidateDetailResponse {
  return {
    generatedAt: now.toISOString(),
    candidate: {
      id: candidateId,
      name: 'Example Cafe',
      candidateType: 'physical_place',
      status: 'new',
      priority: 900,
      firstSeenAt: '2026-06-01T00:00:00.000Z',
      lastSeenAt: '2026-06-28T00:00:00.000Z',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-28T01:00:00.000Z',
      duplicateSignal: false,
      duplicateGroupStatus: null,
      linkedEntity: false,
      linkedLocation: false,
    },
    importOrigin: null,
    sources: [],
    sourcesTruncated: false,
  };
}

function context(
  overrides: { identity?: unknown; subjects?: string; candidateId?: string | string[] } = {},
) {
  return {
    request: new Request(`https://example.test/admin/api/candidates/${candidateId}`),
    env: {
      CPM_ADMIN_CANDIDATE_SUBJECTS: overrides.subjects ?? JSON.stringify(['reviewer-subject']),
    },
    params: {
      candidateId: overrides.candidateId ?? candidateId,
    },
    data: {
      adminIdentity: overrides.identity === undefined ? identity : overrides.identity,
    },
    waitUntil: vi.fn(),
  };
}

describe('protected Candidate detail endpoint', () => {
  it('returns one bounded detail for an authorized verified subject', async () => {
    const loadDetail = vi.fn(async () => detailResponse());
    const handler = createCandidateDetailHandler({ loadDetail, now: () => now });

    const response = await handler(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    await expect(response.json()).resolves.toEqual(detailResponse());
    expect(loadDetail).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['candidate:read'],
      },
      candidateId,
      expect.any(Object),
      now,
    );
  });

  it('denies missing identity before loading Candidate data', async () => {
    const loadDetail = vi.fn(async () => detailResponse());
    const handler = createCandidateDetailHandler({ loadDetail });

    const response = await handler(context({ identity: null }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'candidate_detail_denied' });
    expect(loadDetail).not.toHaveBeenCalled();
  });

  it('returns unavailable when Candidate authorization is not configured', async () => {
    const loadDetail = vi.fn(async () => detailResponse());
    const handler = createCandidateDetailHandler({ loadDetail });

    const response = await handler(context({ subjects: '' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'candidate_detail_unavailable' });
    expect(loadDetail).not.toHaveBeenCalled();
  });

  it('rejects a non-string route parameter without loading data', async () => {
    const loadDetail = vi.fn(async () => detailResponse());
    const handler = createCandidateDetailHandler({ loadDetail });

    const response = await handler(context({ candidateId: [candidateId] }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'candidate_detail_invalid_id' });
    expect(loadDetail).not.toHaveBeenCalled();
  });

  it('maps invalid identifiers and missing records without leaking backend details', async () => {
    const invalidHandler = createCandidateDetailHandler({
      loadDetail: vi.fn(async () => {
        throw new CandidateDetailError('invalid_candidate_id', 'private validation detail');
      }),
    });
    const invalidResponse = await invalidHandler(context({ candidateId: 'not-a-uuid' }));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'candidate_detail_invalid_id' });

    const missingHandler = createCandidateDetailHandler({
      loadDetail: vi.fn(async () => {
        throw new CandidateDetailError('not_found', 'private absence detail');
      }),
    });
    const missingResponse = await missingHandler(context());
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'candidate_detail_not_found' });
  });

  it('returns a generic unavailable response on backend failure', async () => {
    const handler = createCandidateDetailHandler({
      loadDetail: vi.fn(async () => {
        throw new Error('private database failure');
      }),
    });

    const response = await handler(context());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'candidate_detail_unavailable' });
  });
});
