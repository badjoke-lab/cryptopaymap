import { describe, expect, it } from 'vitest';
import { createDrizzleExportActivationHistoryBackend } from '../src/admin/export-release/activation-history-backend';
import { isActivationHistoryConflictCode } from '../src/admin/export-release/activation-history-errors';
import {
  exportActivationRecordValues,
  publishedActivationReceipt,
} from '../src/admin/export-release/activation-history-values';
import type { ExportActivationHistoryCommand } from '../src/admin/export-release/activation-history';
import { exportActivationRecords } from '../src/db/schema';
import type { CryptoPayMapDatabase } from '../src/db/client';

const digest = 'a'.repeat(64);
const command: ExportActivationHistoryCommand = {
  requestId: '10000000-0000-4000-8000-000000000001',
  approvalRequestId: '10000000-0000-4000-8000-000000000002',
  snapshotDigest: digest,
  datasetVersion: '2026.07.04.1',
  schemaVersion: '1.0.0',
  generatedAt: new Date('2026-07-04T00:00:00.000Z'),
  publishedAt: new Date('2026-07-04T02:00:00.000Z'),
  previousSnapshotDigest: null,
  pointerKey: 'export-releases/active.json',
  releasePrefix: `export-releases/by-snapshot/${digest}/`,
  artifactCount: 12,
  actorId: 'cloudflare-access:release-activator',
  actorType: 'human',
  reasonCode: 'activate_approved_release',
  internalNote: null,
  requestFingerprint: 'fingerprint',
};

function fakeDatabase() {
  const rows: Array<Record<string, unknown>> = [];
  const database = {
    select() {
      return { from: () => ({ where: () => ({ limit: async () => rows.slice(0, 1) }) }) };
    },
    insert() {
      return { values: async (value: Record<string, unknown>) => rows.push(value) };
    },
  };
  return { database: database as unknown as CryptoPayMapDatabase, rows };
}

describe('activation store backend', () => {
  it('exposes activation store columns', () => {
    expect(exportActivationRecords.requestId.name).toBe('request_id');
    expect(exportActivationRecords.approvalRequestId.name).toBe('approval_request_id');
    expect(exportActivationRecords.snapshotDigest.name).toBe('snapshot_digest');
    expect(exportActivationRecords.requestFingerprint.name).toBe('request_fingerprint');
  });

  it('maps a successful activation to values and receipt', () => {
    expect(exportActivationRecordValues(command)).toMatchObject({
      requestId: command.requestId,
      approvalRequestId: command.approvalRequestId,
      activationStatus: 'active',
      snapshotDigest: command.snapshotDigest,
    });
    expect(publishedActivationReceipt(command)).toMatchObject({
      requestId: command.requestId,
      state: 'published',
      snapshotDigest: command.snapshotDigest,
    });
  });

  it('commits once and replays the stored activation receipt', async () => {
    const { database, rows } = fakeDatabase();
    const backend = createDrizzleExportActivationHistoryBackend(database);

    await expect(backend.commitActivation(command)).resolves.toMatchObject({ state: 'published' });
    expect(rows).toHaveLength(1);
    await expect(backend.commitActivation(command)).resolves.toMatchObject({ state: 'replayed' });
    expect(rows).toHaveLength(1);
  });

  it('rejects request ID reuse with different content', async () => {
    const { database } = fakeDatabase();
    const backend = createDrizzleExportActivationHistoryBackend(database);
    await backend.commitActivation(command);

    await expect(
      backend.commitActivation({ ...command, requestFingerprint: 'different' }),
    ).rejects.toMatchObject({ code: 'pointer_conflict' });
  });

  it('exports conflict classification', () => {
    expect(isActivationHistoryConflictCode('23505')).toBe(true);
    expect(isActivationHistoryConflictCode('23514')).toBe(true);
    expect(isActivationHistoryConflictCode('08006')).toBe(false);
  });
});
