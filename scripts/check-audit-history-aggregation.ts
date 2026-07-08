import { createAggregatedAuditHistoryBackend } from '../src/admin/audit-history/aggregation';
import { createDrizzleAuditHistorySources } from '../src/admin/audit-history/drizzle-sources';
import { createDrizzleLocationCorrectionAuditSource } from '../src/admin/audit-history/location-correction-source';
import {
  evidenceReviewDecisionAuditItem,
  locationProfileCorrectionAuditItem,
} from '../src/admin/audit-history/normalizers';

if (typeof createAggregatedAuditHistoryBackend !== 'function') {
  throw new Error('missing aggregation');
}
if (typeof createDrizzleAuditHistorySources !== 'function') throw new Error('missing sources');
if (typeof createDrizzleLocationCorrectionAuditSource !== 'function') {
  throw new Error('missing Location correction Audit source');
}
if (typeof evidenceReviewDecisionAuditItem !== 'function') throw new Error('missing normalizer');
if (typeof locationProfileCorrectionAuditItem !== 'function') {
  throw new Error('missing Location correction normalizer');
}

console.log('Audit history aggregation checks passed.');
