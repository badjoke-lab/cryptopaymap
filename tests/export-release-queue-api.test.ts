import { describe, expect, it, vi } from 'vitest';
import { createExportQueueHandler } from '../functions/admin/api/exports';
import type { ExportReleaseQueueResponse } from '../src/admin/export-release/workspace';

const identity = {
  actorId: 'cloudflare-access:export-reviewer',
  actorType: 'human' as const,
  subject: 'export-reviewer',
  email: 'reviewer@example.test',
};
const now = new Date('2026-07-04T01:00:00.000Z');

function queue(): ExportReleaseQueueResponse {
  return {
    generatedAt: now.toISOString(),
    query: { limit: 25 },
    currentCandidate: null,
    recentDecisions: [],
    hasMore: false,
  };
}

function context(overrides: { identity?: unknown; actorIds?: string; url?: string } = {}) {
  return {
    request: new Request(overrides.url ?? 'https://example.test/admin/api/exports?limit=25'),
    env: {
      CPM_ADMIN_EXPORT_RELEASE_ACTOR_IDS: overrides.actorIds ?? JSON.stringify([identity.actorId]),
    },
    params: {},
    data: {
      adminIdentity: overrides.identity === undefined ? identity : overrides.identity,
    },
    waitUntil: vi.fn(),
  };
}

describe('protected export release queue endpoint', () => {
  it('returns a private release queue for an authorized actor', async () => {
    const loadQueue = vi.fn(async () => queue());
    const response = await createExportQueueHandler({ loadQueue, now: () => now })(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    await expect(response.json()).resolves.toEqual(queue());
    expect(loadQueue).toHaveBeenCalledWith(
      expect.objectContaining({ capabilities: ['export:release'] }),
      expect.any(URL),
      expect.any(Object),
      now,
    );
  });

  it('denies an unauthorized identity before loading candidate data', async () => {
    const loadQueue = vi.fn(async () => queue());
    const response = await createExportQueueHandler({ loadQueue })(
      context({ actorIds: JSON.stringify(['another-actor']) }),
    );

    expect(response.status).toBe(403);
    expect(loadQueue).not.toHaveBeenCalled();
  });

  it('fails closed when export release access is not configured', async () => {
    const loadQueue = vi.fn(async () => queue());
    const response = await createExportQueueHandler({ loadQueue })(context({ actorIds: '' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'export_queue_unavailable' });
    expect(loadQueue).not.toHaveBeenCalled();
  });
});
