import { describe, expect, it } from 'vitest';
import { createDrizzleExportReleaseHistoryBackend } from '../src/admin/export-release/history-backend';
import type { CryptoPayMapDatabase } from '../src/db/client';

const digest = 'a'.repeat(64);
const olderDigest = 'b'.repeat(64);

function row(snapshotDigest = digest) {
  return {
    requestId: '10000000-0000-4000-8000-000000000001',
    approvalRequestId: '10000000-0000-4000-8000-000000000002',
    snapshotDigest,
    datasetVersion: snapshotDigest === digest ? '2026.07.04.1' : '2026.07.03.1',
    schemaVersion: '1.0.0',
    generatedAt: new Date('2026-07-04T00:00:00.000Z'),
    publishedAt: new Date('2026-07-04T02:00:00.000Z'),
    previousSnapshotDigest: snapshotDigest === digest ? olderDigest : null,
    pointerKey: 'export-releases/active.json',
    releasePrefix: `export-releases/by-snapshot/${snapshotDigest}/`,
    artifactCount: 12,
    actorId: 'cloudflare-access:release-reader',
    actorType: 'human' as const,
    reasonCode: 'activate_approved_release',
  };
}

function fakeDatabase(rows: Array<ReturnType<typeof row>>) {
  const calls: string[] = [];
  const database = {
    select() {
      calls.push('select');
      return {
        from() {
          calls.push('from');
          return {
            orderBy() {
              calls.push('orderBy');
              return {
                async limit(value: number) {
                  calls.push(`limit:${value}`);
                  return rows.slice(0, value);
                },
              };
            },
          };
        },
      };
    },
  };
  return { database: database as unknown as CryptoPayMapDatabase, calls };
}

describe('export release history database backend', () => {
  it('loads one extra row to detect pagination and maps dates to ISO strings', async () => {
    const { database, calls } = fakeDatabase([row(), row(olderDigest)]);
    const result = await createDrizzleExportReleaseHistoryBackend(database).loadReleaseHistory({
      limit: 1,
    });

    expect(calls).toContain('limit:2');
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      snapshotDigest: digest,
      generatedAt: '2026-07-04T00:00:00.000Z',
      publishedAt: '2026-07-04T02:00:00.000Z',
      isCurrent: false,
    });
  });
});
