import { createDrizzleAuditHistoryBackend } from '../src/admin/audit-history/drizzle-backend';
import {
  createDrizzleAuditHistorySources,
  createDrizzleCandidateDuplicateAuditSource,
  createDrizzleCandidatePromotionAuditSource,
  createDrizzleEvidenceReviewAuditSource,
  createDrizzleExportActivationAuditSource,
  createDrizzleExportReleaseDecisionAuditSource,
  createDrizzleMediaReviewAuditSource,
  createDrizzleReconfirmationAuditSource,
} from '../src/admin/audit-history/drizzle-sources';

for (const runtimeExport of [
  createDrizzleAuditHistoryBackend,
  createDrizzleAuditHistorySources,
  createDrizzleCandidateDuplicateAuditSource,
  createDrizzleCandidatePromotionAuditSource,
  createDrizzleEvidenceReviewAuditSource,
  createDrizzleReconfirmationAuditSource,
  createDrizzleMediaReviewAuditSource,
  createDrizzleExportReleaseDecisionAuditSource,
  createDrizzleExportActivationAuditSource,
]) {
  if (typeof runtimeExport !== 'function') {
    throw new Error('Audit history Drizzle runtime export is missing.');
  }
}

console.log('Audit history Drizzle checks passed.');
