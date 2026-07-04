import { describe, expect, it, vi } from 'vitest';
import type { ExportRestorePointerInventory } from '../src/admin/export-release/restore-execution';
import {
  ExportRestorePointerSwitchError,
  switchExportRestorePointers,
  type ExportRestoreInspectedObject,
  type ExportRestorePointerSwitchAdapter,
} from '../src/admin/export-release/restore-pointer-switch';

const activeDigest = 'a'.repeat(64);
const targetDigest = 'b'.repeat(64);
const artifactDigest = 'c'.repeat(64);
const switchedAt = '2026-07-04T06:00:00.000Z';
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

function adapter(overrides: Partial<{ target: ExportRestoreInspectedObject | null }> = {}) {
  const replacePointer = vi.fn(async (args) => ({
    pointerKey: args.pointerKey,
    previousEtag: args.expectedCurrentEtag,
    newEtag: args.targetEtag,
    switchedAt: args.switchedAt,
  }));
  const fake: ExportRestorePointerSwitchAdapter = {
    inspectTargetObject: vi.fn(async () =>
      Object.hasOwn(overrides, 'target') ? (overrides.target ?? null) : targetObject,
    ),
    replacePointer,
  };
  return { adapter: fake, replacePointer };
}

describe('export restore pointer switch boundary', () => {
  it('inspects target objects and conditionally replaces each pointer', async () => {
    const fake = adapter();
    const receipts = await switchExportRestorePointers({
      inventory,
      pointerExpectations: [
        { pointerKey: 'export-releases/active.json', expectedCurrentEtag: 'etag-active-before' },
      ],
      adapter: fake.adapter,
      switchedAt,
    });

    expect(receipts).toEqual([
      {
        pointerKey: 'export-releases/active.json',
        previousEtag: 'etag-active-before',
        newEtag: 'etag-target-manifest',
        switchedAt,
      },
    ]);
    expect(fake.replacePointer).toHaveBeenCalledWith({
      pointerKey: 'export-releases/active.json',
      targetObjectKey: inventoryItem.targetObjectKey,
      expectedCurrentEtag: 'etag-active-before',
      targetEtag: 'etag-target-manifest',
      switchedAt,
    });
  });

  it('fails before switching when the target object is missing', async () => {
    const fake = adapter({ target: null });

    await expect(
      switchExportRestorePointers({
        inventory,
        pointerExpectations: [
          { pointerKey: 'export-releases/active.json', expectedCurrentEtag: 'etag-active-before' },
        ],
        adapter: fake.adapter,
        switchedAt,
      }),
    ).rejects.toMatchObject({ code: 'target_missing' });
    expect(fake.replacePointer).not.toHaveBeenCalled();
  });

  it('fails before switching when the target object changed', async () => {
    const fake = adapter({ target: { ...targetObject, etag: 'etag-mutated' } });

    await expect(
      switchExportRestorePointers({
        inventory,
        pointerExpectations: [
          { pointerKey: 'export-releases/active.json', expectedCurrentEtag: 'etag-active-before' },
        ],
        adapter: fake.adapter,
        switchedAt,
      }),
    ).rejects.toMatchObject({ code: 'target_mismatch' });
    expect(fake.replacePointer).not.toHaveBeenCalled();
  });

  it('requires exact pointer expectation coverage', async () => {
    await expect(
      switchExportRestorePointers({
        inventory,
        pointerExpectations: [],
        adapter: adapter().adapter,
        switchedAt,
      }),
    ).rejects.toBeInstanceOf(ExportRestorePointerSwitchError);
  });
});
