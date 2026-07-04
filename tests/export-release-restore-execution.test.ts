import { describe, expect, it } from 'vitest';
import type { ExportPublicationMutationContext } from '../src/admin/export-release/publication-contract';
import {
  createExportRestoreExecutionService,
  ExportRestoreExecutionError,
  type ExportRestoreExecutionBackend,
  type ExportRestoreExecutionInput,
  type ExportRestoreExecutionRecord,
  type ExportRestorePointerInventory,
  type ExportRestorePointerSwitchReceipt,
} from '../src/admin/export-release/restore-execution';

const activeDigest = 'a'.repeat(64);
const targetDigest = 'b'.repeat(64);
const artifactDigest = 'c'.repeat(64);
const context: ExportPublicationMutationContext = {
  requestId: '10000000-0000-4000-8000-000000000001',
  actorId: 'cloudflare-access:restore-operator',
  actorType: 'human',
  capabilities: ['export:publish'],
};
const input: ExportRestoreExecutionInput = {
  targetSnapshotDigest: targetDigest,
  expectedActiveSnapshotDigest: activeDigest,
  restoredAt: '2026-07-04T05:00:00.000Z',
  reasonCode: 'restore_previous_release',
  internalNote: 'Restore previous release after bad activation.',
};
const inventory: ExportRestorePointerInventory = {
  targetSnapshotDigest: targetDigest,
  previousActiveSnapshotDigest: activeDigest,
  targetDatasetVersion: '2026.07.03.1',
  targetReleasePrefix: `export-releases/by-snapshot/${targetDigest}/`,
  activePointerKey: 'export-releases/active.json',
  items: [
    {
      pointerKey: 'export-releases/active.json',
      targetObjectKey: `export-releases/by-snapshot/${targetDigest}/manifest.json`,
      targetSha256: artifactDigest,
      targetEtag: 'etag-target-manifest',
      contentType: 'application/json',
      sizeBytes: 512,
    },
  ],
};
const pointerSwitches: ExportRestorePointerSwitchReceipt[] = [
  {
    pointerKey: 'export-releases/active.json',
    previousEtag: 'etag-active-before',
    newEtag: 'etag-active-after',
    switchedAt: input.restoredAt,
  },
];

function backend(existing: ExportRestoreExecutionRecord | null = null): {
  backend: ExportRestoreExecutionBackend;
  writes: ExportRestoreExecutionRecord[];
} {
  const writes: ExportRestoreExecutionRecord[] = [];
  return {
    writes,
    backend: {
      readRestoreRecord: async () => existing,
      writeRestoreRecord: async (record) => {
        writes.push(record);
        return record;
      },
    },
  };
}

describe('export restore execution record contract', () => {
  it('records a restore execution after pointer switches are provided', async () => {
    const state = backend();
    const record = await createExportRestoreExecutionService(state.backend).recordExecution({
      context,
      input,
      inventory,
      pointerSwitches,
    });

    expect(record).toMatchObject({
      requestId: context.requestId,
      actorId: context.actorId,
      previousActiveSnapshotDigest: activeDigest,
      restoredSnapshotDigest: targetDigest,
      restoredDatasetVersion: '2026.07.03.1',
      pointerSwitches,
    });
    expect(record.inventoryFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(record.requestFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(state.writes).toEqual([record]);
  });

  it('replays an identical restore request without writing again', async () => {
    const first = backend();
    const record = await createExportRestoreExecutionService(first.backend).recordExecution({
      context,
      input,
      inventory,
      pointerSwitches,
    });
    const replay = backend(record);

    await expect(
      createExportRestoreExecutionService(replay.backend).recordExecution({
        context,
        input,
        inventory,
        pointerSwitches,
      }),
    ).resolves.toEqual(record);
    expect(replay.writes).toEqual([]);
  });

  it('rejects request ID reuse with different content', async () => {
    const first = backend();
    const record = await createExportRestoreExecutionService(first.backend).recordExecution({
      context,
      input,
      inventory,
      pointerSwitches,
    });

    await expect(
      createExportRestoreExecutionService(backend(record).backend).recordExecution({
        context,
        input: { ...input, reasonCode: 'restore_manual_review' },
        inventory,
        pointerSwitches,
      }),
    ).rejects.toMatchObject({ code: 'request_conflict' });
  });

  it('requires export publication authority', async () => {
    await expect(
      createExportRestoreExecutionService(backend().backend).recordExecution({
        context: { ...context, capabilities: [] },
        input,
        inventory,
        pointerSwitches,
      }),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('requires pointer switches to match the pointer inventory', async () => {
    await expect(
      createExportRestoreExecutionService(backend().backend).recordExecution({
        context,
        input,
        inventory,
        pointerSwitches: [{ ...pointerSwitches[0], pointerKey: 'export-releases/other.json' }],
      }),
    ).rejects.toMatchObject({ code: 'pointer_mismatch' });
  });

  it('rejects inventory that does not match the expected active snapshot', async () => {
    await expect(
      createExportRestoreExecutionService(backend().backend).recordExecution({
        context,
        input,
        inventory: { ...inventory, previousActiveSnapshotDigest: 'd'.repeat(64) },
        pointerSwitches,
      }),
    ).rejects.toBeInstanceOf(ExportRestoreExecutionError);
  });
});
