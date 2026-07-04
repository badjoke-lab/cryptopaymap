import {
  exportRestoreInspectedObjectSchema,
  exportRestorePointerExpectationSchema,
  switchExportRestorePointers,
} from '../src/admin/export-release/restore-pointer-switch';

if (typeof switchExportRestorePointers !== 'function') {
  throw new Error('Export restore pointer switch runtime export is missing.');
}

for (const schema of [exportRestorePointerExpectationSchema, exportRestoreInspectedObjectSchema]) {
  if (typeof schema.safeParse !== 'function') {
    throw new Error('Export restore pointer switch runtime schema is missing.');
  }
}

console.log('Export release restore pointer switch checks passed.');
