import { createExportHistoryHandler } from '../functions/admin/api/export-history';
import { createDrizzleExportReleaseHistoryBackend } from '../src/admin/export-release/history-backend';
import {
  exportReleaseHistoryItemSchema,
  exportReleaseHistoryResponseSchema,
  loadExportReleaseHistory,
  parseExportReleaseHistoryQuery,
} from '../src/admin/export-release/history';

for (const runtimeExport of [
  createExportHistoryHandler,
  createDrizzleExportReleaseHistoryBackend,
  loadExportReleaseHistory,
  parseExportReleaseHistoryQuery,
]) {
  if (typeof runtimeExport !== 'function') {
    throw new Error('Export release history runtime export is missing.');
  }
}

for (const schema of [exportReleaseHistoryItemSchema, exportReleaseHistoryResponseSchema]) {
  if (typeof schema.safeParse !== 'function') {
    throw new Error('Export release history runtime schema is missing.');
  }
}

console.log('Export release history checks passed.');
