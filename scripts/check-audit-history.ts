import {
  auditHistoryItemSchema,
  auditHistoryQuerySchema,
  auditHistoryReadContextSchema,
} from '../src/admin/audit-history/contract';
import { loadAuditHistory, parseAuditHistoryQuery } from '../src/admin/audit-history/history';

for (const schema of [
  auditHistoryItemSchema,
  auditHistoryQuerySchema,
  auditHistoryReadContextSchema,
]) {
  if (typeof schema.safeParse !== 'function') {
    throw new Error('Audit history runtime schema is missing.');
  }
}

if (typeof loadAuditHistory !== 'function' || typeof parseAuditHistoryQuery !== 'function') {
  throw new Error('Audit history runtime boundary is missing.');
}

console.log('Audit history contract checks passed.');
