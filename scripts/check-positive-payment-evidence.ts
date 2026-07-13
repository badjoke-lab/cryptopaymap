import {
  positivePaymentEvidenceReceiptSchema,
  positivePaymentEvidenceRequestSchema,
} from '../src/admin/submissions/payment-report-evidence';
import { positivePaymentEvidenceEventSchema } from '../src/submissions/payment-report-evidence-contract';

const submissionId = '10000000-0000-4000-8000-000000000001';
const claimId = '20000000-0000-4000-8000-000000000001';
const evidenceId = '30000000-0000-4000-8000-000000000001';
const requestId = '40000000-0000-4000-8000-000000000001';
const claimAssetId = '50000000-0000-4000-8000-000000000001';
const decidedAt = '2026-07-13T05:00:00.000Z';

positivePaymentEvidenceRequestSchema.parse({
  schemaVersion: 'positive-payment-evidence-decision-v1',
  requestId,
  expectedStatus: 'in_review',
  expectedUpdatedAt: '2026-07-13T04:00:00.000Z',
  expectedPayloadUpdatedAt: '2026-07-13T04:00:00.000Z',
  claimId,
  expectedClaimUpdatedAt: '2026-07-13T03:00:00.000Z',
  expectedClaimStatus: 'confirmed',
  expectedClaimVisibility: 'public',
  expectedClaimAssetIds: [claimAssetId],
  decision: 'accept_and_reconfirm',
  evidenceClass: 'a',
  evidenceVisibility: 'restricted',
  independenceKey: null,
  summary: 'A successful payment report supports the reviewed Claim.',
  reviewerNote: 'Restricted transaction proof was reviewed privately.',
  nextReviewAt: '2027-01-09T05:00:00.000Z',
});

positivePaymentEvidenceEventSchema.parse({
  schemaVersion: 'positive-payment-evidence-event-v1',
  requestFingerprint: 'a'.repeat(64),
  evidenceId,
  claimId,
  decision: 'accept_and_reconfirm',
  verificationEventId: '60000000-0000-4000-8000-000000000001',
  summary: 'A successful payment report supports the reviewed Claim.',
  reviewerNote: 'Restricted transaction proof was reviewed privately.',
});

positivePaymentEvidenceReceiptSchema.parse({
  state: 'committed',
  submissionId,
  evidenceId,
  claimId,
  decision: 'accept_and_reconfirm',
  fromStatus: 'in_review',
  toStatus: 'resolved',
  resolution: 'approved',
  claimStatus: 'confirmed',
  verificationEventType: 'reconfirmed',
  decidedAt,
});

console.log('P5-03E positive payment Evidence schemas are valid.');
