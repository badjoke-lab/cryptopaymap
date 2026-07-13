import { createInMemorySubmissionPersistenceBackend } from '../src/submissions/in-memory-persistence';
import { createReportSubmissionPrivateIntakeService } from '../src/submissions/report-intake-service';
import { createHmacSubmissionStatusSecretProvider } from '../src/submissions/status-secret-provider';

const persistence = createInMemorySubmissionPersistenceBackend();
let generated = 0;
const intake = createReportSubmissionPrivateIntakeService({
  persistence,
  statusSecrets: createHmacSubmissionStatusSecretProvider(new Uint8Array(32).fill(9)),
  contactProtector: {
    async protectEmail() {
      throw new Error('contact protection must not run for no-contact fixtures');
    },
  },
  generateSubmissionId: () => {
    generated += 1;
    return generated === 1
      ? '10000000-0000-4000-8000-000000000001'
      : '10000000-0000-4000-8000-000000000002';
  },
});

const common = {
  schemaVersion: 'submission-common-v1' as const,
  targetType: 'location' as const,
  targetId: '30000000-0000-4000-8000-000000000001',
  relationship: null,
  contact: null,
  evidenceLinks: [],
  acknowledgements: {
    privacyNoticeAccepted: true as const,
    submissionTermsAccepted: true as const,
  },
};

const paymentReceipt = await intake.submit(
  '20000000-0000-4000-8000-000000000001',
  {
    ...common,
    submissionType: 'payment_report',
    originalPayload: {
      schemaVersion: 'payment-report-v1',
      result: 'successful',
      paymentDate: '2026-07-12',
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
  },
  new Date('2026-07-13T00:00:00.000Z'),
);

const problemReceipt = await intake.submit(
  '20000000-0000-4000-8000-000000000002',
  {
    ...common,
    submissionType: 'problem_report',
    originalPayload: {
      schemaVersion: 'problem-report-v1',
      reportType: 'wrong_network',
      observedAt: '2026-07-12',
      explanation: 'The public record names the wrong network.',
      proposedCorrection: { kind: 'network', networkSlug: 'base' },
      duplicateTarget: null,
      privateEvidenceUrl: 'https://merchant.example/private/network-proof',
    },
  },
  new Date('2026-07-13T00:00:00.000Z'),
);

const [payment, problem] = persistence.snapshot();
if (
  paymentReceipt.state !== 'committed' ||
  problemReceipt.state !== 'committed' ||
  payment?.submissionType !== 'payment_report' ||
  payment.normalizedPayload?.reportKind !== 'payment_report' ||
  payment.normalizedPayload?.result !== 'successful' ||
  problem?.submissionType !== 'problem_report' ||
  problem.normalizedPayload?.reportKind !== 'problem_report' ||
  problem.normalizedPayload?.reportType !== 'wrong_network' ||
  JSON.stringify(payment.normalizedPayload).includes('private-review-reference') ||
  JSON.stringify(problem.normalizedPayload).includes('/private/network-proof')
) {
  throw new Error('Report private intake check produced an invalid result.');
}

console.log('Payment and problem report private intake checks passed.');
