import {
  problemReportDecisionReceiptSchema,
  problemReportDecisionRequestSchema,
} from '../src/admin/submissions/problem-report-decision';
import { problemReportDecisionEventSchema } from '../src/submissions/problem-report-decision-contract';

const submissionId = '10000000-0000-4000-8000-000000000001';
const claimId = '20000000-0000-4000-8000-000000000001';
const evidenceId = '30000000-0000-4000-8000-000000000001';
const requestId = '40000000-0000-4000-8000-000000000001';
const verificationEventId = '50000000-0000-4000-8000-000000000001';

problemReportDecisionRequestSchema.parse({
  schemaVersion: 'problem-report-decision-v1',
  requestId,
  operation: 'apply_negative_claim_action',
  expectedSubmissionStatus: 'resolved',
  expectedSubmissionResolution: 'approved',
  expectedSubmissionUpdatedAt: '2026-07-13T08:00:00.000Z',
  expectedPayloadUpdatedAt: '2026-07-13T08:00:00.000Z',
  claimId,
  expectedClaimUpdatedAt: '2026-07-13T07:00:00.000Z',
  expectedClaimStatus: 'confirmed',
  expectedClaimVisibility: 'public',
  evidenceId,
  claimAction: 'mark_stale',
  nextReviewAt: '2026-08-13T09:00:00.000Z',
  endedReason: null,
  publicSummary: 'Claim marked stale after explicit negative Evidence review.',
  internalNote: null,
});

problemReportDecisionEventSchema.parse({
  schemaVersion: 'problem-report-decision-event-v1',
  requestFingerprint: 'a'.repeat(64),
  operation: 'apply_negative_claim_action',
  reportType: 'failed_payment',
  claimId,
  evidenceId,
  verificationEventId,
  claimAction: 'mark_stale',
  proposedCorrection: null,
  duplicateTarget: null,
  publicSummary: 'Claim marked stale after explicit negative Evidence review.',
  internalNote: null,
});

problemReportDecisionReceiptSchema.parse({
  state: 'committed',
  submissionId,
  operation: 'apply_negative_claim_action',
  submissionStatus: 'resolved',
  submissionResolution: 'approved',
  claimId,
  claimStatus: 'stale',
  claimVisibility: 'public',
  verificationEventId,
  decidedAt: '2026-07-13T09:00:00.000Z',
});

console.log('P5-03G problem report decision schemas are valid.');
