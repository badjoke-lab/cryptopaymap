import { createAuditHistoryHandler } from '../functions/admin/api/audit-history';
import {
  authorizeAuditHistoryRead,
  readAuditHistoryAuthorizationPolicy,
} from '../src/admin/audit-history/authorization';
import { auditHistoryDatabase } from '../src/admin/audit-history/http-environment';

for (const runtimeExport of [
  createAuditHistoryHandler,
  authorizeAuditHistoryRead,
  readAuditHistoryAuthorizationPolicy,
  auditHistoryDatabase,
]) {
  if (typeof runtimeExport !== 'function') {
    throw new Error('Audit history route runtime export is missing.');
  }
}

console.log('Audit history route checks passed.');
