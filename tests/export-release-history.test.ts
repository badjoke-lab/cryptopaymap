import { describe, expect, it } from 'vitest';
import {
  ExportReleaseHistoryError,
  loadExportReleaseHistory,
  parseExportReleaseHistoryQuery,
  type ExportReleaseHistoryBackend,
  type ExportReleaseHistoryItem,
} from '../src/admin/export-release/history';

const digest = 'a'.repeat(64);
const item: ExportReleaseHistoryItem = {
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
  actorId: 'cloudflare-access:release-reader',
  actorType: 'human',
  reasonCode: 'activate_approved_release',
  isCurrent: false,
};

function backend(items: ExportReleaseHistoryItem[]): ExportReleaseHistoryBackend {
  return { loadReleaseHistory: async () => ({ items, hasMore: false }) };
}

describe('release history read model', () => {
  it('parses bounded history queries', () => {
    expect(parseExportReleaseHistoryQuery(new URL('https://example.test/admin/api/export-history?limit=50'))).toEqual({ limit: 50 });
    expect(() => parseExportReleaseHistoryQuery(new URL('https://example.test/admin/api/export-history?limit=101'))).toThrow(ExportReleaseHistoryError);
  });

  it('marks the newest entry as the current snapshot', async () => {
    const result = await loadExportReleaseHistory(
      {
        actorId: 'cloudflare-access:release-reader',
        actorType: 'human',
        capabilities: ['export:release'],
      },
      backend([item]),
      { limit: 25 },
      new Date('2026-07-04T03:00:00.000Z'),
    );

    expect(result.currentSnapshotDigest).toBe(digest);
    expect(result.items[0]).toMatchObject({ snapshotDigest: digest, isCurrent: true });
  });

  it('requires the export release read capability', async () => {
    await expect(
      loadExportReleaseHistory(
        { actorId: 'reader', actorType: 'human', capabilities: [] },
        backend([item]),
        { limit: 25 },
        new Date('2026-07-04T03:00:00.000Z'),
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });
});
