import { describe, expect, it, vi } from 'vitest';
import { createExportDetailGetHandler } from '../functions/admin/api/export-detail';
import type { ExportReleaseDetailResponse } from '../src/admin/export-release/workspace';

const identity = {
  actorId: 'cloudflare-access:export-reviewer',
  actorType: 'human' as const,
  subject: 'export-reviewer',
  email: 'reviewer@example.test',
};
const digest = 'a'.repeat(64);
const now = new Date('2026-07-04T01:00:00.000Z');

function detail(): ExportReleaseDetailResponse {
  return {
    generatedAt: now.toISOString(),
    candidate: {
      status: 'eligible',
      snapshotDigest: digest,
      artifactCount: 12,
      metadata: {
        datasetVersion: '2026.07.04.1',
        schemaVersion: '1.0.0',
        generatedAt: '2026-07-04T00:00:00.000Z',
      },
      validationIssues: [],
    },
    artifacts: [],
    decisions: [],
  };
}

function context(
  overrides: { identity?: unknown; actorIds?: string; digest?: string | null } = {},
) {
  const value = overrides.digest === undefined ? digest : overrides.digest;
  const query = value === null ? '' : `?snapshotDigest=${value}`;
  return {
    request: new Request(`https://example.test/admin/api/export-detail${query}`),
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

describe('protected export release detail endpoint', () => {
  it('returns exact candidate and artifact detail', async () => {
    const loadDetail = vi.fn(async () => detail());
    const response = await createExportDetailGetHandler({ loadDetail, now: () => now })(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual(detail());
    expect(loadDetail).toHaveBeenCalledWith(
      expect.objectContaining({ capabilities: ['export:release'] }),
      digest,
      expect.any(Object),
      now,
    );
  });

  it('rejects a missing snapshot digest before loading the candidate', async () => {
    const loadDetail = vi.fn(async () => detail());
    const response = await createExportDetailGetHandler({ loadDetail })(context({ digest: null }));

    expect(response.status).toBe(400);
    expect(loadDetail).not.toHaveBeenCalled();
  });

  it('denies an unauthorized actor before reading private artifacts', async () => {
    const loadDetail = vi.fn(async () => detail());
    const response = await createExportDetailGetHandler({ loadDetail })(
      context({ actorIds: JSON.stringify(['another-actor']) }),
    );

    expect(response.status).toBe(403);
    expect(loadDetail).not.toHaveBeenCalled();
  });
});
