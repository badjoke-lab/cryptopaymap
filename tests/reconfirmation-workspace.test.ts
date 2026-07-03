import { describe, expect, it, vi } from 'vitest';
import {
  authorizeReconfirmationExpiration,
  authorizeReconfirmationRead,
  readReconfirmationAuthorizationPolicy,
} from '../src/admin/reconfirmation/authorization';
import {
  loadProtectedReconfirmationQueue,
  parseProtectedReconfirmationQueueQuery,
  type ProtectedReconfirmationWorkspaceBackend,
} from '../src/admin/reconfirmation/protected-workspace';

const identity = {
  actorId: 'cloudflare-access:reviewer',
  actorType: 'human' as const,
  subject: 'reviewer',
  email: 'reviewer@example.test',
};

describe('protected reconfirmation workspace', () => {
  it('authorizes read and system-only transition contexts', () => {
    const policy = readReconfirmationAuthorizationPolicy({
      CPM_ADMIN_RECONFIRMATION_SUBJECTS: JSON.stringify(['reviewer']),
    });
    expect(authorizeReconfirmationRead(identity, policy)).toMatchObject({
      actorId: identity.actorId,
      capabilities: ['claim:recheck'],
    });
    expect(
      authorizeReconfirmationExpiration(identity, policy, '10000000-0000-4000-8000-000000000001'),
    ).toMatchObject({
      actorId: identity.actorId,
      actorType: 'system',
      capabilities: ['claim:expire'],
    });
  });

  it('parses bounded queue parameters and validates the response', async () => {
    const query = parseProtectedReconfirmationQueueQuery(
      new URL('https://example.test/admin/api/rechecks?dueSoonDays=14&limit=25'),
    );
    const backend: ProtectedReconfirmationWorkspaceBackend = {
      loadQueue: vi.fn(async () => ({ items: [], hasMore: false })),
      loadDetail: vi.fn(),
    };
    await expect(
      loadProtectedReconfirmationQueue(
        { actorId: 'actor', actorType: 'human', capabilities: ['claim:recheck'] },
        backend,
        query,
        new Date('2026-07-03T00:00:00.000Z'),
      ),
    ).resolves.toMatchObject({ query, items: [], hasMore: false });
  });
});
