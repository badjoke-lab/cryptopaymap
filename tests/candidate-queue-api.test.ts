import { describe, expect, it, vi } from 'vitest';
import { createCandidateQueueHandler } from '../functions/admin/api/candidates';
import type { CandidateQueueResponse } from '../src/admin/candidates/queue';

const identity = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human' as const,
  subject: 'reviewer-subject',
  email: 'reviewer@example.com',
};
const now = new Date('2026-06-28T12:00:00.000Z');

function responsePage(): CandidateQueueResponse {
  return {
    generatedAt: now.toISOString(),
    items: [],
    hasNextPage: false,
    nextCursor: null,
  };
}

function context(overrides: { identity?: unknown; subjects?: string; url?: string } = {}) {
  return {
    request: new Request(
      overrides.url ?? 'https://example.test/admin/api/candidates?status=new&limit=10',
    ),
    env: {
      CPM_ADMIN_CANDIDATE_SUBJECTS: overrides.subjects ?? JSON.stringify(['reviewer-subject']),
    },
    params: {},
    data: {
      adminIdentity: overrides.identity === undefined ? identity : overrides.identity,
    },
    waitUntil: vi.fn(),
  };
}

describe('protected Candidate queue endpoint', () => {
  it('returns a bounded page for an authorized verified subject', async () => {
    const loadQueue = vi.fn(async () => responsePage());
    const handler = createCandidateQueueHandler({ loadQueue, now: () => now });

    const response = await handler(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    await expect(response.json()).resolves.toEqual(responsePage());
    expect(loadQueue).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['candidate:read'],
      },
      expect.objectContaining({ statuses: ['new'], limit: 10 }),
      expect.any(Object),
      now,
    );
  });

  it('denies missing identity before loading data', async () => {
    const loadQueue = vi.fn(async () => responsePage());
    const handler = createCandidateQueueHandler({ loadQueue });
    const response = await handler(context({ identity: null }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'candidate_queue_denied' });
    expect(loadQueue).not.toHaveBeenCalled();
  });

  it('returns unavailable when Candidate authorization is not configured', async () => {
    const loadQueue = vi.fn(async () => responsePage());
    const handler = createCandidateQueueHandler({ loadQueue });
    const response = await handler(context({ subjects: '' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'candidate_queue_unavailable' });
    expect(loadQueue).not.toHaveBeenCalled();
  });

  it('rejects invalid filters without loading data', async () => {
    const loadQueue = vi.fn(async () => responsePage());
    const handler = createCandidateQueueHandler({ loadQueue });
    const response = await handler(
      context({ url: 'https://example.test/admin/api/candidates?limit=500' }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'candidate_queue_invalid_query' });
    expect(loadQueue).not.toHaveBeenCalled();
  });

  it('returns a generic unavailable response on backend failure', async () => {
    const handler = createCandidateQueueHandler({
      loadQueue: vi.fn(async () => {
        throw new Error('private database failure');
      }),
    });
    const response = await handler(context());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'candidate_queue_unavailable' });
  });
});
