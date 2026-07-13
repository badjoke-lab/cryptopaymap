import {
  normalizePaymentReportSubmissionIntake,
  normalizeProblemReportSubmissionIntake,
} from '../src/submissions/report-contract';

const targetId = '10000000-0000-4000-8000-000000000001';
const common = {
  schemaVersion: 'submission-common-v1' as const,
  targetType: 'location' as const,
  targetId,
  relationship: null,
  contact: null,
  evidenceLinks: [],
  acknowledgements: {
    privacyNoticeAccepted: true as const,
    submissionTermsAccepted: true as const,
  },
};

const payment = normalizePaymentReportSubmissionIntake({
  ...common,
  submissionType: 'payment_report',
  originalPayload: {
    schemaVersion: 'payment-report-v1',
    result: 'successful',
    paymentDate: '2026-07-10',
    payment: {
      assetSlug: 'btc',
      networkSlug: 'bitcoin',
      routeType: 'direct_wallet',
      paymentMethod: 'wallet_qr',
      processor: null,
      context: 'qr_code',
      observedSteps: 'The cashier displayed a Bitcoin QR code.',
    },
    privateTransactionUrl: 'https://explorer.example/tx/private-review-reference',
    notes: null,
  },
});

const problem = normalizeProblemReportSubmissionIntake({
  ...common,
  submissionType: 'problem_report',
  originalPayload: {
    schemaVersion: 'problem-report-v1',
    reportType: 'wrong_network',
    observedAt: '2026-07-11',
    explanation: 'The public record names the wrong network.',
    proposedCorrection: { kind: 'network', networkSlug: 'base' },
    duplicateTarget: null,
    privateEvidenceUrl: 'https://merchant.example/private/network-proof',
  },
});

if (
  payment.reportKind !== 'payment_report' ||
  payment.targetId !== targetId ||
  payment.payment.networkSlug !== 'bitcoin' ||
  !payment.restrictedEvidence.privateTransactionUrlPresent ||
  problem.reportKind !== 'problem_report' ||
  problem.reportType !== 'wrong_network' ||
  problem.proposedCorrection?.kind !== 'network' ||
  !problem.restrictedEvidence.privateEvidenceUrlPresent ||
  JSON.stringify(payment).includes('private-review-reference') ||
  JSON.stringify(problem).includes('/private/network-proof')
) {
  throw new Error('Report submission contract check produced an invalid result.');
}

console.log('Payment and problem report contract checks passed.');
