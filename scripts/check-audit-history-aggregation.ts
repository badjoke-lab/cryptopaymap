import { createAggregatedAuditHistoryBackend } from '../src/admin/audit-history/aggregation';
import { createDrizzleAuditHistorySources } from '../src/admin/audit-history/drizzle-sources';
import { evidenceReviewDecisionAuditItem } from '../src/admin/audit-history/normalizers';

if (typeof createAggregatedAuditHistoryBackend !== 'function')
  throw new Error('missing aggregation');
if (typeof createDrizzleAuditHistorySources !== 'function') throw new Error('missing sources');
if (typeof evidenceReviewDecisionAuditItem !== 'function') throw new Error('missing normalizer');

console.log('Audit history aggregation checks passed.');
