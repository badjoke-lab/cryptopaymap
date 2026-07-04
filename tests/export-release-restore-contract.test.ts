import { describe, expect, it } from 'vitest';
import {
  createExportRestoreService,
  ExportRestoreError,
  type ExportRestoreBackend,
  type ExportRestoreInput,
  type ExportRestoreSnapshot,
} from '../src/admin/export-release/restore-contract';
import type { ExportPublicationMutationContext } from '../src/admin/export-release/publication-contract';

const activeDigest = 'a'.repeat(64);
const targetDigest = 'b'.repeat(64);
const context: ExportPublicationMutationContext = {
  requestId: '10000000-0000-4000-8000-000000000001',
  actorId: 'cloudflare-access:release-activator',
  actorType: 'human',
  capabilities: ['export:publish'],
};
const input: ExportRestoreInput = {
  targetSnapshotDigest: targetDigest,
  expectedActiveSnapshotDigest: activeDigest,
  restoredAt: '2026-07-04T04:00:00.000Z',
  reasonCode: 'restore_previous_release',
  internalNote: null,
};

function snapshot(
  snapshotDigest: string,
  hasPointerInventory = false,
): ExportRestoreSnapshot {
  return {
    snapshotDigest,
    datasetVersion: snapshotDigest === activeDigest ? '2026.07.04.1' : '2026.07.03.1',
    schemaVersion: '1.0.0',
    generatedAt: '2026-07-04T00:00:00.000Z',
    publishedAt: '2026-07-04T02:00:00.000Z',
    pointerKey: 'export-releases/active.json',
    releasePrefix: `export-releases/by-snapshot/${snapshotDigest}/`,
    artifactCount: 12,
    hasPointerInventory,
  };
}

function backend(overrides: Partial<{ active: ExportRestoreSnapshot | null; target: ExportRestoreSnapshot | null }> = {}): ExportRestoreBackend {
  return {
    loadActiveSnapshot: async () => overrides.active ?? snapshot(activeDigest),
    loadSnapshot: async () => overrides.target ?? snapshot(targetDigest),
  };
}

describe('export release restore contract', () => {
  it('blocks restore preparation when the target pointer inventory is not durable yet', async () => {
    await expect(createExportRestoreService(backend()).prepareRestore(context, input)).resolves.toEqual({
      requestId: context.requestId,
      actorId: context.actorId,
      targetSnapshotDigest: targetDigest,
      previousActiveSnapshotDigest: activeDigest,
      restoredAt: input.restoredAt,
      reasonCode: input.reasonCode,
      state: 'blocked_missing_pointer_inventory',
      issues: ['targetPointerInventoryMissing'],
    });
  });

  it('requires export publication authority', async () => {
    await expect(
      createExportRestoreService(backend()).prepareRestore(
        { ...context, capabilities: [] },
        input,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('rejects restoring the already active snapshot', async () => {
    await expect(
      createExportRestoreService(backend()).prepareRestore(context, {
        ...input,
        targetSnapshotDigest: activeDigest,
      }),
    ).rejects.toBeInstanceOf(ExportRestoreError);
  });

  it('detects an active snapshot race before restore preparation', async () => {
    await expect(
      createExportRestoreService(backend({ active: snapshot('c'.repeat(64)) })).prepareRestore(
        context,
        input,
      ),
    ).rejects.toMatchObject({ code: 'active_mismatch' });
  });

  it('requires the target snapshot to exist in durable history', async () => {
    await expect(
      createExportRestoreService(backend({ target: null })).prepareRestore(context, input),
    ).rejects.toMatchObject({ code: 'target_not_found' });
  });
});
