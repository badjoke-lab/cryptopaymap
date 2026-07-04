import { describe, expect, it, vi } from 'vitest';
import type { ExportPublicationMutationContext } from '../src/admin/export-release/publication-contract';
import type {
  ExportRestoreExecutionBackend,
  ExportRestoreExecutionInput,
  ExportRestoreExecutionRecord,
  ExportRestorePointerInventory,
} from '../src/admin/export-release/restore-execution';
import type {
  ExportRestoreInspectedObject,
  ExportRestorePointerSwitchAdapter,
} from '../src/admin/export-release/restore-pointer-switch';
import {
  createExportRestoreWorkflow,
  ExportRestoreWorkflowError,
} from '../src/admin/export-release/restore-workflow';

const activeDigest = 'a'.repeat(64);
const targetDigest = 'b'.repeat(64);
const artifactDigest = 'c'.repeat(64);
const restoredAt = '2026-07-04T07:00:00.000Z';
const context: ExportPublicationMutationContext = {
  requestId: '10000000-0000-4000-8000-000000000011',
  actorId: 'cloudflare-access:restore-operator',
  actorType: 'human',
  capabilities: ['export:publish'],
};
const input: ExportRestoreExecutionInput = {
  targetSnapshotDigest: targetDigest,
  expectedActiveSnapshotDigest: activeDigest,
  restoredAt,
  reasonCode: 'restore_previous_release',
  internalNote: 'Restore previous release after verification.',
};
const inventoryItem = {
  pointerKey: 'export-releases/active.json',
  targetObjectKey: `export-releases/by-snapshot/${targetDigest}/manifest.json`,
  targetSha256: artifactDigest,
  targetEtag: 'etag-target-manifest',
  contentType: 'application/json',
  sizeBytes: 512,
} as const;
const inventory: ExportRestorePointerInventory = {
  targetSnapshotDigest: targetDigest,
  previousActiveSnapshotDigest: activeDigest,
  targetDatasetVersion: '2026.07.03.1',
  targetReleasePrefix: `export-releases/by-snapshot/${targetDigest}/`,
  activePointerKey: 'export-releases/active.json',
  items: [inventoryItem],
};
const targetObject: ExportRestoreInspectedObject = {
  key: inventoryItem.targetObjectKey,
  etag: inventoryItem.targetEtag,
  sha256: inventoryItem.targetSha256,
  contentType: inventoryItem.contentType,
  sizeBytes: inventoryItem.sizeBytes,
};
const pointerExpectations = [
  { pointerKey: 'export-releases/active.json', expectedCurrentEtag: 'etag-active-before' },
];

function executionBackend(
  options: { existing?: ExportRestoreExecutionRecord | null; failWrite?: boolean } = {},
) {
  let current = options.existing ?? null;
  const writes: ExportRestoreExecutionRecord[] = [];
  const backend: ExportRestoreExecutionBackend = {
    readRestoreRecord: vi.fn(async () => current),
    writeRestoreRecord: vi.fn(async (record) => {
      if (options.failWrite) throw new Error('database unavailable');
      current = record;
      writes.push(record);
      return record;
    }),
  };
  return { backend, writes };
}

function pointerAdapter(options: { failReplace?: boolean } = {}) {
  const replacePointer = vi.fn(async (args) => {
    if (options.failReplace) throw new Error('conditional replacement failed');
    return {
      pointerKey: args.pointerKey,
      previousEtag: args.expectedCurrentEtag,
      newEtag: args.targetEtag,
      switchedAt: args.switchedAt,
    };
  });
  const adapter: ExportRestorePointerSwitchAdapter = {
    inspectTargetObject: vi.fn(async () => targetObject),
    replacePointer,
  };
  return { adapter, replacePointer };
}

function workflowArgs() {
  return { context, input, inventory, pointerExpectations };
}

describe('export restore workflow', () => {
  it('switches validated pointers and then records the completed execution', async () => {
    const database = executionBackend();
    const objects = pointerAdapter();
    const record = await createExportRestoreWorkflow({
      executionBackend: database.backend,
      pointerSwitchAdapter: objects.adapter,
    }).execute(workflowArgs());

    expect(objects.replacePointer).toHaveBeenCalledTimes(1);
    expect(database.writes).toEqual([record]);
    expect(record).toMatchObject({
      previousActiveSnapshotDigest: activeDigest,
      restoredSnapshotDigest: targetDigest,
      pointerSwitches: [
        {
          pointerKey: 'export-releases/active.json',
          previousEtag: 'etag-active-before',
          newEtag: 'etag-target-manifest',
          switchedAt: restoredAt,
        },
      ],
    });
  });

  it('replays an existing execution record without switching pointers again', async () => {
    const firstDatabase = executionBackend();
    const firstObjects = pointerAdapter();
    const existing = await createExportRestoreWorkflow({
      executionBackend: firstDatabase.backend,
      pointerSwitchAdapter: firstObjects.adapter,
    }).execute(workflowArgs());

    const replayDatabase = executionBackend({ existing });
    const replayObjects = pointerAdapter();
    await expect(
      createExportRestoreWorkflow({
        executionBackend: replayDatabase.backend,
        pointerSwitchAdapter: replayObjects.adapter,
      }).execute(workflowArgs()),
    ).resolves.toEqual(existing);

    expect(replayObjects.replacePointer).not.toHaveBeenCalled();
    expect(replayDatabase.writes).toEqual([]);
  });

  it('rejects conflicting replay content before switching pointers', async () => {
    const firstDatabase = executionBackend();
    const firstObjects = pointerAdapter();
    const existing = await createExportRestoreWorkflow({
      executionBackend: firstDatabase.backend,
      pointerSwitchAdapter: firstObjects.adapter,
    }).execute(workflowArgs());

    const replayDatabase = executionBackend({ existing });
    const replayObjects = pointerAdapter();
    await expect(
      createExportRestoreWorkflow({
        executionBackend: replayDatabase.backend,
        pointerSwitchAdapter: replayObjects.adapter,
      }).execute({
        ...workflowArgs(),
        input: { ...input, internalNote: 'Different restore note.' },
      }),
    ).rejects.toMatchObject({ code: 'replay_validation_failed' });

    expect(replayObjects.replacePointer).not.toHaveBeenCalled();
    expect(replayDatabase.writes).toEqual([]);
  });

  it('fails closed before object-store mutation for unauthorized actors', async () => {
    const database = executionBackend();
    const objects = pointerAdapter();

    await expect(
      createExportRestoreWorkflow({
        executionBackend: database.backend,
        pointerSwitchAdapter: objects.adapter,
      }).execute({ ...workflowArgs(), context: { ...context, capabilities: [] } }),
    ).rejects.toMatchObject({ code: 'unauthorized' });

    expect(objects.replacePointer).not.toHaveBeenCalled();
    expect(database.writes).toEqual([]);
  });

  it('rejects request and inventory target mismatch before switching pointers', async () => {
    const database = executionBackend();
    const objects = pointerAdapter();

    await expect(
      createExportRestoreWorkflow({
        executionBackend: database.backend,
        pointerSwitchAdapter: objects.adapter,
      }).execute({
        ...workflowArgs(),
        input: { ...input, targetSnapshotDigest: 'd'.repeat(64) },
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });

    expect(objects.replacePointer).not.toHaveBeenCalled();
    expect(database.writes).toEqual([]);
  });

  it('does not record completion when pointer switching fails', async () => {
    const database = executionBackend();
    const objects = pointerAdapter({ failReplace: true });

    await expect(
      createExportRestoreWorkflow({
        executionBackend: database.backend,
        pointerSwitchAdapter: objects.adapter,
      }).execute(workflowArgs()),
    ).rejects.toMatchObject({ code: 'pointer_switch_failed' });

    expect(database.writes).toEqual([]);
  });

  it('surfaces switch receipts when execution recording fails after mutation', async () => {
    const database = executionBackend({ failWrite: true });
    const objects = pointerAdapter();

    try {
      await createExportRestoreWorkflow({
        executionBackend: database.backend,
        pointerSwitchAdapter: objects.adapter,
      }).execute(workflowArgs());
      throw new Error('expected workflow failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ExportRestoreWorkflowError);
      expect(error).toMatchObject({
        code: 'execution_record_failed_after_switch',
        pointerSwitches: [
          {
            pointerKey: 'export-releases/active.json',
            previousEtag: 'etag-active-before',
            newEtag: 'etag-target-manifest',
          },
        ],
      });
    }
  });
});
