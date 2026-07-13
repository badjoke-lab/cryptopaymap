import {
  negativeReportEvidenceReceiptSchema,
  negativeReportEvidenceRequestSchema,
} from '../src/admin/submissions/negative-report-evidence';
import { negativeReportEvidenceEventSchema } from '../src/submissions/negative-report-evidence-contract';

const submissionId = '10000000-0000-4000-8000-000000000001';
const claimId = '20000000-0000-4000-8000-000000000001';
const evidenceId = '30000000-0000-4000-8000-000000000001';
const requestId = '40000000-0000-4000-8000-000000000001';
const decidedAt = '2026-07-13T06:00:00.000Z';

negativeReportEvidenceRequestSchema.parse({
  schemaVersion: 'negative-report-evidence-decision-v1',
  requestId,
  expectedStatus: 'in_review',
  expectedUpdatedAt: '2026-07-13T05:00:00.000Z',
  expectedPayloadUpdatedAt: '2026-07-13T05:00:00.000Z',
  claimId,
  expectedClaimUpdatedAt: '2026-07-13T04:00:00.000Z',
  expectedClaimStatus: 'confirmed',
  expectedClaimVisibility: 'public',
  decision: 'accept_and_prioritize_recheck',
  evidenceClass: 'b',
  evidenceVisibility: 'private',
  independenceKey: 'usage:negative-report-001',
  evidenceSummary: 'A failed payment report contradicts the current Claim.',
  reviewerNote: 'Review the Claim without changing its status automatically.',
});

negativeReportEvidenceEventSchema.parse({
  schemaVersion: 'negative-report-evidence-event-v1',
  requestFingerprint: 'a'.repeat(64),
  evidenceId,
  claimId,
  decision: 'accept_and_prioritize_recheck',
  evidenceSummary: 'A failed payment report contradicts the current Claim.',
  reviewerNote: 'Review the Claim without changing its status automatically.',
});

negativeReportEvidenceReceiptSchema.parse({
  state: 'committed',
  submissionId,
  evidenceId,
  claimId,
  decision: 'accept_and_prioritize_recheck',
  fromStatus: 'in_review',
  toStatus: 'resolved',
  resolution: 'approved',
  claimStatus: 'confirmed',
  recheckPrioritized: true,
  decidedAt,
});

console.log('P5-03F negative Evidence schemas are valid.');
