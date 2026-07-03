import { createDrizzleExportReleaseBackend } from '../src/admin/export-release/drizzle-backend';
import { isExportReleaseConflictCode } from '../src/admin/export-release/drizzle-errors';
import { replayExportReleaseDecision } from '../src/admin/export-release/drizzle-state';
import {
  committedExportReleaseReceipt,
  exportReleaseDecisionValues,
} from '../src/admin/export-release/drizzle-values';
import { exportReleaseDecisions } from '../src/db/schema';

for (const column of [
  exportReleaseDecisions.requestId,
  exportReleaseDecisions.snapshotDigest,
  exportReleaseDecisions.datasetVersion,
  exportReleaseDecisions.validationIssues,
  exportReleaseDecisions.requestFingerprint,
]) {
  if (column === undefined) throw new Error('Export release persistence column is missing.');
}

for (const runtimeExport of [
  createDrizzleExportReleaseBackend,
  isExportReleaseConflictCode,
  replayExportReleaseDecision,
  committedExportReleaseReceipt,
  exportReleaseDecisionValues,
]) {
  if (typeof runtimeExport !== 'function') {
    throw new Error('Export release persistence runtime export is missing.');
  }
}

console.log('Export release persistence checks passed.');
