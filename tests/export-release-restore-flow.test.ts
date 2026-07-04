import { describe, expect, it, vi } from 'vitest';
import type { ExportPublicationMutationContext } from '../src/admin/export-release/publication-contract';
import type {
  ExportRestoreExecutionBackend,
  ExportRestoreExecutionInput,
  ExportRestoreExecutionRecord,
  ExportRestorePointerInventory,
} from '../src/admin/export-release/restore-execution';
import {
  createExportRestoreFlowService,
  ExportRestoreFlowError,
} from '../src/admin/export-release/restore-flow';
import type {
  ExportRestoreInspectedObject,
  ExportRestorePointerSwitchAdapter,
} from '../src/admin/export-release/restore-pointer-switch';

const activeDigest = 'a'.repeat(64);
const targetDigest = 'b'.repeat(64);
const artifactDigest = 'c'.repeat(64);
const restoredAt = '2026-07-04T07:00:00.000Z';
const context: ExportPublicationMutationContext = {
  requestId: '10000000-0000-4000-8000-000000000001',
  actorId: 'cloudflare-access:restore-operator',
  actorType: 'human',
  capabilities: ['export:publish'],
};
const input: ExportRestoreExecutionInput = {
  targetSnapshotDigest: targetDigest,
  expectedActiveSnapshotDigest: activeDigest,
  restoredAt,
  reasonCode: 'restore_previous_release',
  internalNote: 'Restore after bad release.',
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
  activePointerKey: inventoryItem.pointerKey,
  items: [inventoryItem],
};
const inspectedTarget: ExportRestoreInspectedObject = {
  key: inventoryItem.targetObjectKey,
  etag: inventoryItem.targetEtag,
  sha256: inventoryItem.targetSha256,
  contentType: inventoryItem.contentType,
  sizeBytes: inventoryItem.sizeBytes,
};
const pointerExpectations = [
  { pointerKey: inventoryItem.pointerKey, expectedCurrentEtag: 'etag-active-before' },
];

function harness(options: { failSwitch?: boolean; failWrite?: boolean } = {}) {
  let stored: ExportRestoreExecutionRecord | null = null;
  const readRestoreRecord = vi.fn(async () => stored);
  const writeRestoreRecord = vi.fn(async (record: ExportRestoreExecutionRecord) => {
    if (options.failWrite) throw new Error('database unavailable');
    stored = record;
    return record;
  });
  const inspectTargetObject = vi.fn(async () => inspectedTarget);
  const replacePointer = vi.fn(async (args) => {
    if (options.failSwitch) throw new Error('conditional write failed');
    return {
      pointerKey: args.pointerKey,
      previousEtag: args.expectedCurrentEtag,
      newEtag: args.targetEtag,
      switchedAt: args.switchedAt,
    };
  });

  const executionBackend: ExportRestoreExecutionBackend = {
    readRestoreRecord,
    writeRestoreRecord,
  };
  const pointerSwitchAdapter: ExportRestorePointerSwitchAdapter = {
    inspectTargetObject,
    replacePointer,
  };

  return {
    service: createExportRestoreFlowService({ executionBackend, pointerSwitchAdapter }),
    readRestoreRecord,
    writeRestoreRecord,
    inspectTargetObject,
    replacePointer,
    getStored: () => stored,
  };
}

describe('export restore integrated flow', () => {
  it('switches pointers and then records the completed restore', async () => {
    const state = harness();
    const result = await state.service.executeRestore({
      context,
      input,
      inventory,
      pointerExpectations,
    });

    expect(result.state).toBe('restored');
    expect(result.record).toMatchObject({
      requestId: context.requestId,
      restoredSnapshotDigest: targetDigest,
      previousActiveSnapshotDigest: activeDigest,
    });
    expect(state.replacePointer).toHaveBeenCalledTimes(1);
    expect(state.writeRestoreRecord).toHaveBeenCalledTimes(1);
    expect(state.getStored()).toEqual(result.record);
  });

  it('replays an existing completed restore without switching pointers again', async () => {
    const state = harness();
    const first = await state.service.executeRestore({
      context,
      input,
      inventory,
      pointerExpectations,
    });
    state.replacePointer.mockClear();
    state.inspectTargetObject.mockClear();

    const replay = await state.service.executeRestore({
      context,
      input,
      inventory,
      pointerExpectations,
    });

    expect(first.state).toBe('restored');
    expect(replay).toEqual({ state: 'replayed', record: first.record });
    expect(state.inspectTargetObject).not.toHaveBeenCalled();
    expect(state.replacePointer).not.toHaveBeenCalled();
    expect(state.writeRestoreRecord).toHaveBeenCalledTimes(1);
  });

  it('rejects conflicting request reuse before pointer switching', async () => {
    const state = harness();
    await state.service.executeRestore({ context, input, inventory, pointerExpectations });
    state.replacePointer.mockClear();

    await expect(
      state.service.executeRestore({
        context,
        input: { ...input, internalNote: 'Different restore note.' },
        inventory,
        pointerExpectations,
      }),
    ).rejects.toMatchObject({ code: 'request_conflict' });
    expect(state.replacePointer).not.toHaveBeenCalled();
  });

  it('does not write an execution record when pointer switching fails', async () => {
    const state = harness({ failSwitch: true });

    await expect(
      state.service.executeRestore({ context, input, inventory, pointerExpectations }),
    ).rejects.toMatchObject({ code: 'pointer_switch_failed' });
    expect(state.writeRestoreRecord).not.toHaveBeenCalled();
    expect(state.getStored()).toBeNull();
  });

  it('surfaces switched pointer receipts when record persistence fails', async () => {
    const state = harness({ failWrite: true });

    try {
      await state.service.executeRestore({ context, input, inventory, pointerExpectations });
      throw new Error('Expected restore flow to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(ExportRestoreFlowError);
      expect(error).toMatchObject({ code: 'record_failed_after_switch' });
      expect((error as ExportRestoreFlowError).pointerSwitches).toEqual([
        {
          pointerKey: inventoryItem.pointerKey,
          previousEtag: 'etag-active-before',
          newEtag: inventoryItem.targetEtag,
          switchedAt: restoredAt,
        },
      ]);
    }
  });
});
