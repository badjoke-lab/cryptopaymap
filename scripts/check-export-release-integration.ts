import type { ExportPublicationMutationContext } from '../src/admin/export-release/publication-contract';
import {
  createExportRestoreService,
  type ExportRestoreBackend,
  type ExportRestoreInput,
  type ExportRestoreSnapshot,
} from '../src/admin/export-release/restore-contract';
import type {
  ExportRestoreExecutionBackend,
  ExportRestoreExecutionRecord,
  ExportRestorePointerInventory,
} from '../src/admin/export-release/restore-execution';
import type { ExportRestorePointerSwitchAdapter } from '../src/admin/export-release/restore-pointer-switch';
import { createExportRestoreWorkflow } from '../src/admin/export-release/restore-workflow';

const activeDigest = 'a'.repeat(64);
const targetDigest = 'b'.repeat(64);
const artifactDigest = 'c'.repeat(64);
const restoredAt = '2026-07-04T08:00:00.000Z';
const context: ExportPublicationMutationContext = {
  requestId: '10000000-0000-4000-8000-000000000021',
  actorId: 'system:export-release-integration-check',
  actorType: 'system',
  capabilities: ['export:publish'],
};
const input: ExportRestoreInput = {
  targetSnapshotDigest: targetDigest,
  expectedActiveSnapshotDigest: activeDigest,
  restoredAt,
  reasonCode: 'restore_integration_check',
  internalNote: null,
};

function snapshot(snapshotDigest: string, hasPointerInventory: boolean): ExportRestoreSnapshot {
  return {
    snapshotDigest,
    datasetVersion: snapshotDigest === activeDigest ? '2026.07.04.1' : '2026.07.03.1',
    schemaVersion: '1.0.0',
    generatedAt: '2026-07-04T00:00:00.000Z',
    publishedAt: '2026-07-04T02:00:00.000Z',
    pointerKey: 'export-releases/active.json',
    releasePrefix: `export-releases/by-snapshot/${snapshotDigest}/`,
    artifactCount: 1,
    hasPointerInventory,
  };
}

const restoreBackend: ExportRestoreBackend = {
  loadActiveSnapshot: async () => snapshot(activeDigest, true),
  loadSnapshot: async (snapshotDigest) =>
    snapshotDigest === targetDigest ? snapshot(targetDigest, true) : null,
};

const readiness = await createExportRestoreService(restoreBackend).prepareRestore(context, input);

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

let storedRecord: ExportRestoreExecutionRecord | null = null;
let writeCount = 0;
const executionBackend: ExportRestoreExecutionBackend = {
  readRestoreRecord: async () => storedRecord,
  writeRestoreRecord: async (record) => {
    storedRecord = record;
    writeCount += 1;
    return record;
  },
};

let switchCount = 0;
const pointerSwitchAdapter: ExportRestorePointerSwitchAdapter = {
  inspectTargetObject: async (key) =>
    key === inventoryItem.targetObjectKey
      ? {
          key,
          etag: inventoryItem.targetEtag,
          sha256: inventoryItem.targetSha256,
          contentType: inventoryItem.contentType,
          sizeBytes: inventoryItem.sizeBytes,
        }
      : null,
  replacePointer: async (args) => {
    switchCount += 1;
    return {
      pointerKey: args.pointerKey,
      previousEtag: args.expectedCurrentEtag,
      newEtag: args.targetEtag,
      switchedAt: args.switchedAt,
    };
  },
};

const workflow = createExportRestoreWorkflow({ executionBackend, pointerSwitchAdapter });
const execution = await workflow.execute({
  context,
  input,
  inventory,
  pointerExpectations: [
    { pointerKey: inventoryItem.pointerKey, expectedCurrentEtag: 'etag-active-before' },
  ],
});
const replay = await workflow.execute({
  context,
  input,
  inventory,
  pointerExpectations: [
    { pointerKey: inventoryItem.pointerKey, expectedCurrentEtag: 'etag-active-before' },
  ],
});

if (
  readiness.state !== 'ready_for_execution' ||
  readiness.issues.length !== 0 ||
  execution.restoredSnapshotDigest !== targetDigest ||
  replay.requestFingerprint !== execution.requestFingerprint ||
  switchCount !== 1 ||
  writeCount !== 1
) {
  throw new Error('Export release integration check produced an invalid restore result.');
}

console.log('Export release integration checks passed.');
