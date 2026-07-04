import {
  createExportRestoreFlowService,
  exportRestoreFlowResultSchema,
} from '../src/admin/export-release/restore-flow';

if (typeof createExportRestoreFlowService !== 'function') {
  throw new Error('Export restore flow runtime export is missing.');
}

if (typeof exportRestoreFlowResultSchema.safeParse !== 'function') {
  throw new Error('Export restore flow runtime schema is missing.');
}

console.log('Export release restore flow checks passed.');
