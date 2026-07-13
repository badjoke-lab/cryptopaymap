import { describe, expect, it } from 'vitest';
import {
  normalizePaymentReportSubmissionIntake,
  normalizeProblemReportSubmissionIntake,
  normalizeReportSubmissionIntake,
  paymentReportSubmissionIntakeSchema,
  problemReportSubmissionIntakeSchema,
  reportSubmissionIntakeSchema,
} from '../src/submissions/report-contract';

const targetId = '10000000-0000-4000-8000-000000000001';
const otherTargetId = '20000000-0000-4000-8000-000000000002';

function commonEnvelope(
  submissionType: 'payment_report' | 'problem_report',
  originalPayload: unknown,
) {
  return {
    schemaVersion: 'submission-common-v1',
    submissionType,
    targetType: 'location',
    targetId,
    relationship: null,
    contact: null,
    evidenceLinks: [
      {
        url: 'https://merchant.example/payments',
        observedAt: '2026-07-10',
        summary: 'Public payment information for reviewer comparison.',
      },
    ],
    originalPayload,
    acknowledgements: {
      privacyNoticeAccepted: true,
      submissionTermsAccepted: true,
    },
  };
}

function directWalletPaymentPayload() {
  return {
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
      observedSteps: 'The cashier displayed a Bitcoin QR code after the order was confirmed.',
    },
    privateTransactionUrl: 'https://explorer.example/tx/private-review-reference',
    notes: 'The payment completed during the observed checkout.',
  };
}

function failedPaymentPayload() {
  return {
    schemaVersion: 'payment-report-v1',
    result: 'failed',
    paymentDate: '2026-07-11',
    payment: {
      assetSlug: 'usdt',
      networkSlug: null,
      routeType: null,
      paymentMethod: null,
      processor: null,
      context: 'hosted_checkout',
      observedSteps:
        'The checkout offered USDT, but the network was not identified and payment failed.',
    },
    privateTransactionUrl: null,
    notes: null,
  };
}

function wrongNetworkProblemPayload() {
  return {
    schemaVersion: 'problem-report-v1',
    reportType: 'wrong_network',
    observedAt: '2026-07-11',
    explanation: 'The public record names the wrong network for the listed USDT option.',
    proposedCorrection: {
      kind: 'network',
      networkSlug: 'base',
    },
    duplicateTarget: null,
    privateEvidenceUrl: 'https://merchant.example/private/network-proof',
  };
}

describe('P5-03A payment and problem report contract', () => {
  it('accepts and normalizes a target-aware successful payment report', () => {
    const projection = normalizePaymentReportSubmissionIntake(
      commonEnvelope('payment_report', directWalletPaymentPayload()),
    );

    expect(projection).toMatchObject({
      reportKind: 'payment_report',
      targetType: 'location',
      targetId,
      result: 'successful',
      paymentDate: '2026-07-10',
      payment: {
        assetSlug: 'btc',
        networkSlug: 'bitcoin',
        routeType: 'direct_wallet',
        paymentMethod: 'wallet_qr',
        context: 'qr_code',
      },
      restrictedEvidence: { privateTransactionUrlPresent: true },
    });
    expect(projection.evidenceLinks).toHaveLength(1);
    expect(JSON.stringify(projection)).not.toContain('private-review-reference');
  });

  it('preserves explicit payment uncertainty without inferring a network', () => {
    const projection = normalizePaymentReportSubmissionIntake(
      commonEnvelope('payment_report', failedPaymentPayload()),
    );

    expect(projection).toMatchObject({
      result: 'failed',
      payment: {
        assetSlug: 'usdt',
        networkSlug: null,
        routeType: null,
        paymentMethod: null,
      },
      restrictedEvidence: { privateTransactionUrlPresent: false },
    });
  });

  it('requires an existing entity, location, or claim target', () => {
    const noTarget = {
      ...commonEnvelope('payment_report', directWalletPaymentPayload()),
      targetType: null,
      targetId: null,
    };
    const newRecordTarget = {
      ...commonEnvelope('payment_report', directWalletPaymentPayload()),
      targetType: 'new_record',
    };

    expect(paymentReportSubmissionIntakeSchema.safeParse(noTarget).success).toBe(false);
    expect(paymentReportSubmissionIntakeSchema.safeParse(newRecordTarget).success).toBe(false);
  });

  it('keeps relationship disclosure outside ordinary report intake', () => {
    const input = {
      ...commonEnvelope('payment_report', directWalletPaymentPayload()),
      relationship: 'customer',
    };

    expect(paymentReportSubmissionIntakeSchema.safeParse(input).success).toBe(false);
  });

  it('requires a concrete payment detail and enforces known route and processor consistency', () => {
    const payload = directWalletPaymentPayload();
    const emptyPayment = {
      assetSlug: null,
      networkSlug: null,
      routeType: null,
      paymentMethod: null,
      processor: null,
      context: null,
      observedSteps: null,
    };
    expect(
      paymentReportSubmissionIntakeSchema.safeParse(
        commonEnvelope('payment_report', { ...payload, payment: emptyPayment }),
      ).success,
    ).toBe(false);

    const directWithProcessor = {
      ...payload.payment,
      processor: { name: 'Unexpected Processor', websiteUrl: 'https://processor.example/' },
    };
    expect(
      paymentReportSubmissionIntakeSchema.safeParse(
        commonEnvelope('payment_report', { ...payload, payment: directWithProcessor }),
      ).success,
    ).toBe(false);

    const processorWithoutIdentity = {
      ...payload.payment,
      routeType: 'processor_checkout',
      paymentMethod: 'processor_checkout',
      processor: null,
    };
    expect(
      paymentReportSubmissionIntakeSchema.safeParse(
        commonEnvelope('payment_report', { ...payload, payment: processorWithoutIdentity }),
      ).success,
    ).toBe(false);
  });

  it('rejects amount, wallet, transaction-id, and other undeclared payment fields', () => {
    const payload = directWalletPaymentPayload();
    for (const extra of [
      { amount: '1000' },
      { walletAddress: 'not-collected' },
      { transactionId: 'not-collected' },
      { submitterName: 'not-collected' },
    ]) {
      expect(
        paymentReportSubmissionIntakeSchema.safeParse(
          commonEnvelope('payment_report', { ...payload, ...extra }),
        ).success,
      ).toBe(false);
    }
  });

  it('accepts and normalizes a wrong-network problem report', () => {
    const projection = normalizeProblemReportSubmissionIntake(
      commonEnvelope('problem_report', wrongNetworkProblemPayload()),
    );

    expect(projection).toMatchObject({
      reportKind: 'problem_report',
      targetType: 'location',
      targetId,
      reportType: 'wrong_network',
      observedAt: '2026-07-11',
      proposedCorrection: {
        kind: 'network',
        networkSlug: 'base',
      },
      restrictedEvidence: { privateEvidenceUrlPresent: true },
    });
    expect(JSON.stringify(projection)).not.toContain('/private/network-proof');
  });

  it('accepts a bounded location-profile correction and normalizes reusable fields', () => {
    const input = commonEnvelope('problem_report', {
      schemaVersion: 'problem-report-v1',
      reportType: 'wrong_address',
      observedAt: '2026-07-11',
      explanation: 'The listed address points to the previous branch location.',
      proposedCorrection: {
        kind: 'location_profile',
        addressLine: '2-3-4 Jingumae',
        locality: 'Shibuya',
        countryCode: 'jp',
        latitude: 35.67,
        longitude: 139.7,
        amenities: ['wifi', 'wifi', 'outdoor seating'],
      },
      duplicateTarget: null,
      privateEvidenceUrl: null,
    });

    const projection = normalizeProblemReportSubmissionIntake(input);
    expect(projection.proposedCorrection).toMatchObject({
      kind: 'location_profile',
      countryCode: 'JP',
      amenities: ['wifi', 'outdoor seating'],
      latitude: 35.67,
      longitude: 139.7,
    });
  });

  it('rejects one-sided coordinate corrections and empty location-profile corrections', () => {
    const base = {
      schemaVersion: 'problem-report-v1',
      reportType: 'wrong_address',
      observedAt: '2026-07-11',
      explanation: 'The map position is incorrect.',
      duplicateTarget: null,
      privateEvidenceUrl: null,
    };

    expect(
      problemReportSubmissionIntakeSchema.safeParse(
        commonEnvelope('problem_report', {
          ...base,
          proposedCorrection: { kind: 'location_profile', latitude: 35.67 },
        }),
      ).success,
    ).toBe(false);
    expect(
      problemReportSubmissionIntakeSchema.safeParse(
        commonEnvelope('problem_report', {
          ...base,
          proposedCorrection: { kind: 'location_profile' },
        }),
      ).success,
    ).toBe(false);
  });

  it('rejects correction kinds that do not match the selected problem type', () => {
    const payload = wrongNetworkProblemPayload();
    const mismatched = {
      ...payload,
      proposedCorrection: { kind: 'asset', assetSlug: 'usdc' },
    };
    expect(
      problemReportSubmissionIntakeSchema.safeParse(commonEnvelope('problem_report', mismatched))
        .success,
    ).toBe(false);

    const privacyCorrection = {
      ...payload,
      reportType: 'privacy_issue',
      proposedCorrection: { kind: 'other', description: 'Remove the private information.' },
    };
    expect(
      problemReportSubmissionIntakeSchema.safeParse(
        commonEnvelope('problem_report', privacyCorrection),
      ).success,
    ).toBe(false);
  });

  it('allows duplicate-target metadata only on duplicate reports and rejects self-duplication', () => {
    const duplicatePayload = {
      schemaVersion: 'problem-report-v1',
      reportType: 'duplicate',
      observedAt: '2026-07-11',
      explanation: 'This record appears to duplicate another public location.',
      proposedCorrection: null,
      duplicateTarget: { targetType: 'location', targetId: otherTargetId },
      privateEvidenceUrl: null,
    };
    expect(
      problemReportSubmissionIntakeSchema.safeParse(
        commonEnvelope('problem_report', duplicatePayload),
      ).success,
    ).toBe(true);

    expect(
      problemReportSubmissionIntakeSchema.safeParse(
        commonEnvelope('problem_report', {
          ...duplicatePayload,
          duplicateTarget: { targetType: 'location', targetId },
        }),
      ).success,
    ).toBe(false);

    expect(
      problemReportSubmissionIntakeSchema.safeParse(
        commonEnvelope('problem_report', {
          ...wrongNetworkProblemPayload(),
          duplicateTarget: { targetType: 'location', targetId: otherTargetId },
        }),
      ).success,
    ).toBe(false);
  });

  it('excludes contact and private evidence values from review-safe projections', () => {
    const input = {
      ...commonEnvelope('problem_report', wrongNetworkProblemPayload()),
      contact: { email: 'review-probe@example.com', contactAllowed: true },
    };
    const projection = normalizeProblemReportSubmissionIntake(input);
    const serialized = JSON.stringify(projection);

    expect(serialized).not.toContain('review-probe@example.com');
    expect(serialized).not.toContain('/private/network-proof');
    expect(projection.restrictedEvidence.privateEvidenceUrlPresent).toBe(true);
  });

  it('rejects HTML-like explanation text and extra problem payload keys', () => {
    const payload = wrongNetworkProblemPayload();
    expect(
      problemReportSubmissionIntakeSchema.safeParse(
        commonEnvelope('problem_report', {
          ...payload,
          explanation: '<script>unsafe</script>',
        }),
      ).success,
    ).toBe(false);
    expect(
      problemReportSubmissionIntakeSchema.safeParse(
        commonEnvelope('problem_report', { ...payload, hideImmediately: true }),
      ).success,
    ).toBe(false);
  });

  it('parses both report families through the combined contract', () => {
    const paymentInput = commonEnvelope('payment_report', directWalletPaymentPayload());
    const problemInput = commonEnvelope('problem_report', wrongNetworkProblemPayload());

    expect(reportSubmissionIntakeSchema.safeParse(paymentInput).success).toBe(true);
    expect(reportSubmissionIntakeSchema.safeParse(problemInput).success).toBe(true);
    expect(normalizeReportSubmissionIntake(paymentInput).reportKind).toBe('payment_report');
    expect(normalizeReportSubmissionIntake(problemInput).reportKind).toBe('problem_report');
  });
});
