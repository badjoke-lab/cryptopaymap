import {
  createExportRestoreService,
  exportRestoreInputSchema,
  exportRestoreReceiptSchema,
  exportRestoreSnapshotSchema,
} from '../src/admin/export-release/restore-contract';

for (const runtimeExport of [createExportRestoreService]) {
  if (typeof runtimeExport !== 'function') {
    throw new Error('Export restore runtime export is missing.');
  }
}

for (const schema of [
  exportRestoreInputSchema,
  exportRestoreSnapshotSchema,
  exportRestoreReceiptSchema,
]) {
  if (typeof schema.safeParse !== 'function') {
    throw new Error('Export restore runtime schema is missing.');
  }
}

console.log('Export release restore checks passed.');
