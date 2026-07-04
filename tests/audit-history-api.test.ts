import { describe, expect, it, vi } from 'vitest';
import { createAuditHistoryHandler } from '../functions/admin/api/audit-history';
import type { AuditHistoryResponse } from '../src/admin/audit-history/contract';
import { AuditHistoryError } from '../src/admin/audit-history/history';

const identity = {
  actorId: 'cloudflare-access:audit-reader',
  actorType: 'human' as const,
  subject: 'audit-reader',
  email: 'reader@example.test',
};
const now = new Date('2026-07-04T12:00:00.000Z');

function history(): AuditHistoryResponse {
  return {
    generatedAt: now.toISOString(),
    query: { limit: 25 },
    items: [
      {
        id: 'export_activation:20000000-0000-4000-8000-000000000001',
        occurredAt: '2026-07-04T11:00:00.000Z',
        domain: 'export',
        sourceKind: 'export_activation',
        action: 'activate_release',
        actorId: identity.actorId,
        actorType: 'human',
        requestId: '10000000-0000-4000-8000-000000000001',
        target: { type: 'export_snapshot', id: 'a'.repeat(64) },
        secondaryTargets: [],
        reasonCode: 'activate_approved_release',
        summary: null,
        transition: null,
        sourceRecordId: '20000000-0000-4000-8000-000000000001',
      },
    ],
    hasMore: false,
  };
}

function context(overrides: { identity?: unknown; actorIds?: string; url?: string } = {}) {
  return {
    request: new Request(overrides.url ?? 'https://example.test/admin/api/audit-history'),
    env: {
      CPM_ADMIN_AUDIT_READ_ACTOR_IDS: overrides.actorIds ?? JSON.stringify([identity.actorId]),
    },
    params: {},
    data: {
      adminIdentity: overrides.identity === undefined ? identity : overrides.identity,
    },
    waitUntil: vi.fn(),
  };
}

describe('audit history endpoint', () => {
  it('returns protected normalized audit history for an authorized reader', async () => {
    const loadHistory = vi.fn(async () => history());
    const response = await createAuditHistoryHandler({
      loadHistory,
      now: () => now,
    })(context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(history());
    expect(loadHistory).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['audit:read'],
      },
      new URL('https://example.test/admin/api/audit-history'),
      expect.any(Object),
      now,
    );
  });

  it('rejects unauthorized readers before loading history', async () => {
    const loadHistory = vi.fn(async () => history());
    const response = await createAuditHistoryHandler({ loadHistory })(
      context({ actorIds: JSON.stringify(['another-actor']) }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'audit_history_denied' });
    expect(loadHistory).not.toHaveBeenCalled();
  });

  it('fails closed when the audit reader allowlist is not configured', async () => {
    const loadHistory = vi.fn(async () => history());
    const response = await createAuditHistoryHandler({ loadHistory })(context({ actorIds: '' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'audit_history_unavailable' });
    expect(loadHistory).not.toHaveBeenCalled();
  });

  it('maps invalid queries to bad request', async () => {
    const loadHistory = vi.fn(async () => {
      throw new AuditHistoryError('invalid_query', 'Invalid query.');
    });
    const response = await createAuditHistoryHandler({ loadHistory })(
      context({ url: 'https://example.test/admin/api/audit-history?limit=101' }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'audit_history_invalid_query' });
  });

  it('fails closed when the audit history backend is unavailable', async () => {
    const loadHistory = vi.fn(async () => {
      throw new AuditHistoryError('backend_failure', 'Unavailable.');
    });
    const response = await createAuditHistoryHandler({ loadHistory })(context());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'audit_history_unavailable' });
  });
});
