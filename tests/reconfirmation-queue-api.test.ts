import { describe, expect, it, vi } from 'vitest';
import { createReconfirmationQueueHandler } from '../functions/admin/api/rechecks';

const identity = {
  actorId: 'cloudflare-access:reviewer',
  actorType: 'human' as const,
  subject: 'reviewer',
  email: 'reviewer@example.test',
};
const now = new Date('2026-07-03T00:00:00.000Z');

function context(identityOverride: unknown = identity) {
  return {
    request: new Request('https://example.test/admin/api/rechecks'),
    env: { CPM_ADMIN_RECONFIRMATION_SUBJECTS: JSON.stringify(['reviewer']) },
    params: {},
    data: { adminIdentity: identityOverride },
    waitUntil: vi.fn(),
  };
}

describe('protected Rechecks queue API', () => {
  it('returns a private bounded queue', async () => {
    const loadQueue = vi.fn(async () => ({
      generatedAt: now.toISOString(),
      query: { dueSoonDays: 30, limit: 25 },
      items: [],
      hasMore: false,
    }));
    const response = await createReconfirmationQueueHandler({ loadQueue, now: () => now })(
      context(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(loadQueue).toHaveBeenCalledWith(
      expect.objectContaining({ capabilities: ['claim:recheck'] }),
      expect.any(URL),
      expect.any(Object),
      now,
    );
  });

  it('denies a missing identity before reading data', async () => {
    const loadQueue = vi.fn();
    const response = await createReconfirmationQueueHandler({ loadQueue })(context(null));
    expect(response.status).toBe(403);
    expect(loadQueue).not.toHaveBeenCalled();
  });
});
