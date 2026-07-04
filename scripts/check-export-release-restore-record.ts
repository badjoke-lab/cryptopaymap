import {
  createExportRestoreExecutionService,
  exportRestoreExecutionRecordSchema,
  exportRestorePointerInventoryItemSchema,
  exportRestorePointerInventorySchema,
  exportRestorePointerSwitchReceiptSchema,
  exportRestoreInventoryFingerprint,
  exportRestoreRequestFingerprint,
} from '../src/admin/export-release/restore-execution';

for (const runtimeExport of [
  createExportRestoreExecutionService,
  exportRestoreInventoryFingerprint,
  exportRestoreRequestFingerprint,
]) {
  if (typeof runtimeExport !== 'function') {
    throw new Error('Export restore record runtime export is missing.');
  }
}

for (const schema of [
  exportRestorePointerInventoryItemSchema,
  exportRestorePointerInventorySchema,
  exportRestorePointerSwitchReceiptSchema,
  exportRestoreExecutionRecordSchema,
]) {
  if (typeof schema.safeParse !== 'function') {
    throw new Error('Export restore record runtime schema is missing.');
  }
}

console.log('Export release restore record checks passed.');
