import {
  createExportRestoreWorkflow,
  ExportRestoreWorkflowError,
} from '../src/admin/export-release/restore-workflow';

if (typeof createExportRestoreWorkflow !== 'function') {
  throw new Error('Export restore workflow factory is missing.');
}

if (typeof ExportRestoreWorkflowError !== 'function') {
  throw new Error('Export restore workflow error contract is missing.');
}

console.log('Export release restore workflow checks passed.');
