import { describe, expect, it, vi } from 'vitest';
import { createAdminDashboardHandler } from '../functions/admin/api/dashboard';
import type { AdminDashboardSummary } from '../src/admin/dashboard/summary';

const identity = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human' as const,
  subject: 'reviewer-subject',
  email: 'reviewer@example.com',
};
const now = new Date('2026-06-28T12:00:00.000Z');

function summary(): AdminDashboardSummary {
  return {
    generatedAt: now.toISOString(),
    candidateQueue: {
      totalActionable: 3,
      new: 2,
      triaged: 1,
      linked: 0,
      highPriority: 1,
      openDuplicateGroups: 1,
    },
    evidenceReview: { pending: 2 },
    rechecks: { overdue: 1, dueSoon: 0, stale: 1 },
    mediaReview: { pending: 0 },
    imports: {
      lastCompletedAt: null,
      latestAcceptedCount: 0,
      latestRejectedCount: 0,
      latestDuplicateSignalCount: 0,
    },
    publication: {
      state: 'not_available',
      reason: 'release_control_not_implemented',
    },
    recentActivity: [],
  };
}

function context(overrides: { identity?: unknown; subjects?: string } = {}) {
  return {
    request: new Request('https://cryptopaymap.example/admin/api/dashboard'),
    env: {
      CPM_ADMIN_DASHBOARD_SUBJECTS: overrides.subjects ?? JSON.stringify(['reviewer-subject']),
    },
    params: {},
    data: {
      adminIdentity: overrides.identity === undefined ? identity : overrides.identity,
    },
    waitUntil: vi.fn(),
  };
}

describe('protected administration dashboard endpoint', () => {
  it('returns only the bounded summary for an authorized verified subject', async () => {
    const loadSummary = vi.fn(async () => summary());
    const handler = createAdminDashboardHandler({ loadSummary, now: () => now });

    const response = await handler(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    await expect(response.json()).resolves.toEqual(summary());
    expect(loadSummary).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['dashboard:read'],
      },
      expect.any(Object),
      now,
    );
  });

  it('denies a missing or inconsistent protected identity before loading data', async () => {
    const loadSummary = vi.fn(async () => summary());
    const handler = createAdminDashboardHandler({ loadSummary });

    const response = await handler(context({ identity: null }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'dashboard_denied' });
    expect(loadSummary).not.toHaveBeenCalled();
  });

  it('denies a verified subject that is not allowlisted', async () => {
    const loadSummary = vi.fn(async () => summary());
    const handler = createAdminDashboardHandler({ loadSummary });

    const response = await handler(context({ subjects: JSON.stringify(['another-subject']) }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'dashboard_denied' });
    expect(loadSummary).not.toHaveBeenCalled();
  });

  it('returns unavailable for missing authorization configuration', async () => {
    const loadSummary = vi.fn(async () => summary());
    const handler = createAdminDashboardHandler({ loadSummary });

    const response = await handler(context({ subjects: '' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'dashboard_unavailable' });
    expect(loadSummary).not.toHaveBeenCalled();
  });

  it('returns a generic unavailable response when summary loading fails', async () => {
    const handler = createAdminDashboardHandler({
      loadSummary: vi.fn(async () => {
        throw new Error('private database failure');
      }),
    });

    const response = await handler(context());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'dashboard_unavailable' });
  });
});
