import { createAggregatedAuditHistoryBackend } from '../src/admin/audit-history/aggregation';
import { evidenceReviewDecisionAuditItem } from '../src/admin/audit-history/normalizers';

if (typeof createAggregatedAuditHistoryBackend !== 'function') {
  throw new Error('Audit aggregation factory is missing.');
}

if (typeof evidenceReviewDecisionAuditItem !== 'function') {
  throw new Error('Audit normalizer is missing.');
}

console.log('Audit history aggregation checks passed.');
