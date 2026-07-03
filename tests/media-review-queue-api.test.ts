import { describe, expect, it, vi } from 'vitest';
import { createMediaQueueHandler } from '../functions/admin/api/media';
import type { MediaReviewQueueResponse } from '../src/admin/media-review/workspace';

const identity = {
  actorId: 'cloudflare-access:media-reviewer',
  actorType: 'human' as const,
  subject: 'media-reviewer',
  email: 'reviewer@example.test',
};
const now = new Date('2026-07-03T02:00:00.000Z');

function queue(): MediaReviewQueueResponse {
  return {
    generatedAt: now.toISOString(),
    query: { reviewStatus: 'pending', limit: 25 },
    items: [],
    hasMore: false,
  };
}

function context(overrides: { identity?: unknown; actorIds?: string; url?: string } = {}) {
  return {
    request: new Request(
      overrides.url ?? 'https://example.test/admin/api/media?reviewStatus=pending&limit=25',
    ),
    env: {
      CPM_ADMIN_MEDIA_REVIEW_ACTOR_IDS:
        overrides.actorIds ?? JSON.stringify([identity.actorId]),
    },
    params: {},
    data: {
      adminIdentity: overrides.identity === undefined ? identity : overrides.identity,
    },
    waitUntil: vi.fn(),
  };
}

describe('protected Media queue endpoint', () => {
  it('returns a private bounded queue for an authorized reviewer', async () => {
    const loadQueue = vi.fn(async () => queue());
    const response = await createMediaQueueHandler({ loadQueue, now: () => now })(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    await expect(response.json()).resolves.toEqual(queue());
    expect(loadQueue).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['media:review'],
      },
      expect.any(URL),
      expect.any(Object),
      now,
    );
  });

  it('denies missing identity before loading data', async () => {
    const loadQueue = vi.fn(async () => queue());
    const response = await createMediaQueueHandler({ loadQueue })(context({ identity: null }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'media_queue_denied' });
    expect(loadQueue).not.toHaveBeenCalled();
  });

  it('returns unavailable when Media review access is not configured', async () => {
    const loadQueue = vi.fn(async () => queue());
    const response = await createMediaQueueHandler({ loadQueue })(context({ actorIds: '' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'media_queue_unavailable' });
    expect(loadQueue).not.toHaveBeenCalled();
  });
});
