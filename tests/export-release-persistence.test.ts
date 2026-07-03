import { describe, expect, it } from 'vitest';
import type { CryptoPayMapDatabase } from '../src/db/client';
import { exportReleaseDecisions } from '../src/db/schema';
import { createDrizzleExportReleaseBackend } from '../src/admin/export-release/drizzle-backend';
import { isExportReleaseConflictCode } from '../src/admin/export-release/drizzle-errors';
import { replayExportReleaseDecision } from '../src/admin/export-release/drizzle-state';
import {
  committedExportReleaseReceipt,
  exportReleaseDecisionValues,
} from '../src/admin/export-release/drizzle-values';
import type { ExportReleaseDecisionCommand } from '../src/admin/export-release/decision';

const command: ExportReleaseDecisionCommand = {
  requestId: '10000000-0000-4000-8000-000000000001',
  actorId: 'cloudflare-access:export-reviewer',
  actorType: 'human',
  action: 'approve',
  snapshotDigest: 'a'.repeat(64),
  artifactCount: 12,
  datasetVersion: '2026.07.04.1',
  schemaVersion: '1.0.0',
  generatedAt: new Date('2026-07-04T00:00:00.000Z'),
  candidateStatus: 'eligible',
  validationIssues: [],
  decidedAt: new Date('2026-07-04T01:00:00.000Z'),
  reasonCode: 'release_approved',
  publicSummary: 'Validated public export snapshot approved.',
  internalNote: null,
  requestFingerprint: 'fingerprint',
};

function fakeDatabase(options: { duplicate?: boolean } = {}) {
  const rows: Array<Record<string, unknown>> = [];
  const database = {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                async limit() {
                  return rows.slice(0, 1);
                },
              };
            },
          };
        },
      };
    },
    insert() {
      return {
        async values(value: Record<string, unknown>) {
          if (options.duplicate) throw { code: '23505' };
          rows.push(value);
        },
      };
    },
  };
  return { database: database as unknown as CryptoPayMapDatabase, rows };
}

describe('export release persistence', () => {
  it('exposes the durable request, snapshot, validation, and receipt columns', () => {
    expect(exportReleaseDecisions.requestId.name).toBe('request_id');
    expect(exportReleaseDecisions.snapshotDigest.name).toBe('snapshot_digest');
    expect(exportReleaseDecisions.datasetVersion.name).toBe('dataset_version');
    expect(exportReleaseDecisions.candidateStatus.name).toBe('candidate_status');
    expect(exportReleaseDecisions.validationIssues.name).toBe('validation_issues');
    expect(exportReleaseDecisions.requestFingerprint.name).toBe('request_fingerprint');
  });

  it('maps a validated approval to durable values and receipt', () => {
    const values = exportReleaseDecisionValues(command);
    expect(values).toMatchObject({
      requestId: command.requestId,
      action: 'approve',
      releaseStatus: 'approved',
      snapshotDigest: command.snapshotDigest,
      candidateStatus: 'eligible',
      validationIssues: [],
    });
    expect(committedExportReleaseReceipt(command)).toMatchObject({
      requestId: command.requestId,
      releaseStatus: 'approved',
      state: 'committed',
    });
  });

  it('commits once and replays the stored receipt', async () => {
    const { database, rows } = fakeDatabase();
    const backend = createDrizzleExportReleaseBackend(database);

    await expect(backend.commitDecision(command)).resolves.toMatchObject({
      releaseStatus: 'approved',
      state: 'committed',
    });
    expect(rows).toHaveLength(1);
    await expect(backend.commitDecision(command)).resolves.toMatchObject({
      releaseStatus: 'approved',
      state: 'replayed',
    });
    expect(rows).toHaveLength(1);
  });

  it('rejects request ID reuse with a different fingerprint', async () => {
    const { database } = fakeDatabase();
    const backend = createDrizzleExportReleaseBackend(database);
    await backend.commitDecision(command);

    await expect(
      backend.commitDecision({ ...command, requestFingerprint: 'different' }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('classifies duplicate approved release state as a conflict', async () => {
    const { database } = fakeDatabase({ duplicate: true });
    await expect(
      createDrizzleExportReleaseBackend(database).commitDecision(command),
    ).rejects.toMatchObject({
      code: 'conflict',
      issues: ['PostgreSQL rejected the release receipt with code 23505.'],
    });
  });

  it('replays a durable release receipt without changing its outcome', () => {
    expect(
      replayExportReleaseDecision({
        requestId: command.requestId,
        action: command.action,
        releaseStatus: 'approved',
        snapshotDigest: command.snapshotDigest,
        artifactCount: command.artifactCount,
        datasetVersion: command.datasetVersion,
        schemaVersion: command.schemaVersion,
        generatedAt: command.generatedAt,
        decidedAt: command.decidedAt,
        requestFingerprint: command.requestFingerprint,
      }),
    ).toMatchObject({ state: 'replayed', releaseStatus: 'approved' });
  });

  it('exports the production backend and conflict classification', () => {
    expect(createDrizzleExportReleaseBackend).toBeTypeOf('function');
    expect(isExportReleaseConflictCode('23505')).toBe(true);
    expect(isExportReleaseConflictCode('23514')).toBe(true);
    expect(isExportReleaseConflictCode('08006')).toBe(false);
  });
});
