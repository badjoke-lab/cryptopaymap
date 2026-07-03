import { createDrizzleExportActivationHistoryBackend } from '../src/admin/export-release/activation-history-backend';
import { isActivationHistoryConflictCode } from '../src/admin/export-release/activation-history-errors';
import { createDurableExportPublicationService } from '../src/admin/export-release/activation-history';
import {
  exportActivationRecordValues,
  publishedActivationReceipt,
} from '../src/admin/export-release/activation-history-values';
import { exportActivationRecords } from '../src/db/schema';

for (const column of [
  exportActivationRecords.requestId,
  exportActivationRecords.approvalRequestId,
  exportActivationRecords.snapshotDigest,
  exportActivationRecords.requestFingerprint,
]) {
  if (column === undefined) throw new Error('Export activation record column is missing.');
}

for (const runtimeExport of [
  createDrizzleExportActivationHistoryBackend,
  createDurableExportPublicationService,
  isActivationHistoryConflictCode,
  exportActivationRecordValues,
  publishedActivationReceipt,
]) {
  if (typeof runtimeExport !== 'function') {
    throw new Error('Export activation history runtime export is missing.');
  }
}

console.log('Export activation history checks passed.');
