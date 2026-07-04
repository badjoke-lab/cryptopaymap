import { describe, expect, it, vi } from 'vitest';
import { createExportHistoryHandler } from '../functions/admin/api/export-history';
import {
  ExportReleaseHistoryError,
  type ExportReleaseHistoryResponse,
} from '../src/admin/export-release/history';

const identity = {
  actorId: 'cloudflare-access:release-reader',
  actorType: 'human' as const,
  subject: 'release-reader',
  email: 'reader@example.test',
};
const digest = 'a'.repeat(64);
const now = new Date('2026-07-04T03:00:00.000Z');

function history(): ExportReleaseHistoryResponse {
  return {
    generatedAt: now.toISOString(),
    query: { limit: 25 },
    currentSnapshotDigest: digest,
    items: [
      {
        requestId: '10000000-0000-4000-8000-000000000001',
        approvalRequestId: '10000000-0000-4000-8000-000000000002',
        snapshotDigest: digest,
        datasetVersion: '2026.07.04.1',
        schemaVersion: '1.0.0',
        generatedAt: '2026-07-04T00:00:00.000Z',
        publishedAt: '2026-07-04T02:00:00.000Z',
        previousSnapshotDigest: null,
        pointerKey: 'export-releases/active.json',
        releasePrefix: `export-releases/by-snapshot/${digest}/`,
        artifactCount: 12,
        actorId: identity.actorId,
        actorType: 'human',
        reasonCode: 'activate_approved_release',
        isCurrent: true,
      },
    ],
    hasMore: false,
  };
}

function context(overrides: { identity?: unknown; actorIds?: string; url?: string } = {}) {
  return {
    request: new Request(overrides.url ?? 'https://example.test/admin/api/export-history'),
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

describe('export release history endpoint', () => {
  it('returns protected release history for an authorized reader', async () => {
    const loadHistory = vi.fn(async () => history());
    const response = await createExportHistoryHandler({ loadHistory, now: () => now })(context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(history());
    expect(loadHistory).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['export:release'],
      },
      new URL('https://example.test/admin/api/export-history'),
      expect.any(Object),
      now,
    );
  });

  it('rejects unauthorized readers before loading history', async () => {
    const loadHistory = vi.fn(async () => history());
    const response = await createExportHistoryHandler({ loadHistory })(
      context({ actorIds: JSON.stringify(['another-actor']) }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'export_history_denied' });
    expect(loadHistory).not.toHaveBeenCalled();
  });

  it('maps invalid history queries to bad request', async () => {
    const loadHistory = vi.fn(async () => {
      throw new ExportReleaseHistoryError('invalid_query', 'Invalid query.');
    });
    const response = await createExportHistoryHandler({ loadHistory })(
      context({ url: 'https://example.test/admin/api/export-history?limit=101' }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'export_history_invalid_query' });
  });

  it('fails closed when the history backend is unavailable', async () => {
    const loadHistory = vi.fn(async () => {
      throw new ExportReleaseHistoryError('backend_failure', 'Unavailable.');
    });
    const response = await createExportHistoryHandler({ loadHistory })(context());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'export_history_unavailable' });
  });
});
