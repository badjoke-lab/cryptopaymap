import { describe, expect, it, vi } from 'vitest';
import { createCanonicalTargetSearchHandler } from '../functions/admin/api/promotions/[candidateId]/targets';
import type { CandidateCanonicalTargetSearchResponse } from '../src/admin/promotion/target-selection';

const candidateId = '10000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-01T00:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:reviewer',
  actorType: 'human' as const,
  subject: 'reviewer',
  email: 'reviewer@example.test',
};

function responseBody(): CandidateCanonicalTargetSearchResponse {
  return {
    generatedAt: now.toISOString(),
    detail: {
      generatedAt: now.toISOString(),
      candidate: {
        id: candidateId,
        name: 'Example Cafe',
        candidateType: 'physical_place',
        status: 'triaged',
        priority: 500,
        firstSeenAt: '2026-06-01T00:00:00.000Z',
        lastSeenAt: '2026-06-30T00:00:00.000Z',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-30T01:00:00.000Z',
        duplicateSignal: false,
        duplicateGroupId: null,
        duplicateGroupStatus: null,
        linkedEntity: false,
        linkedLocation: false,
      },
      importOrigin: null,
      sources: [],
      sourcesTruncated: false,
    },
    query: 'Example Cafe',
    targets: [],
  };
}

function context(
  url = `https://example.test/admin/api/promotions/${candidateId}/targets?q=Example%20Cafe`,
) {
  return {
    request: new Request(url, { headers: { Accept: 'application/json' } }),
    env: { CPM_ADMIN_CANDIDATE_SUBJECTS: JSON.stringify(['reviewer']) },
    params: { candidateId },
    data: { adminIdentity: identity },
    waitUntil: vi.fn(),
  };
}

describe('protected canonical target search endpoint', () => {
  it('returns the bounded search response to an authorized reader', async () => {
    const searchTargets = vi.fn(async () => responseBody());
    const handler = createCanonicalTargetSearchHandler({ searchTargets, now: () => now });
    const response = await handler(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual(responseBody());
    expect(searchTargets).toHaveBeenCalledWith(
      expect.objectContaining({ capabilities: ['candidate:read'] }),
      candidateId,
      'Example Cafe',
      10,
      expect.any(Object),
      now,
    );
  });

  it('rejects missing or undersized search queries', async () => {
    const searchTargets = vi.fn(async () => responseBody());
    const handler = createCanonicalTargetSearchHandler({ searchTargets });
    const response = await handler(
      context(`https://example.test/admin/api/promotions/${candidateId}/targets?q=E`),
    );

    expect(response.status).toBe(400);
    expect(searchTargets).not.toHaveBeenCalled();
  });

  it('fails closed when Candidate read authorization is missing', async () => {
    const handler = createCanonicalTargetSearchHandler({
      searchTargets: vi.fn(async () => responseBody()),
    });
    const pagesContext = context();
    pagesContext.env.CPM_ADMIN_CANDIDATE_SUBJECTS = JSON.stringify(['other']);
    const response = await handler(pagesContext);

    expect(response.status).toBe(403);
  });
});
