import { describe, expect, it } from 'vitest';
import { evaluateEvidenceReviewPaymentPrerequisites } from '../src/admin/evidence-review/payment-prerequisites';

const base = {
  id: '10000000-0000-4000-8000-000000000001',
  assetSymbol: 'BTC',
  assetStatus: 'active' as const,
  networkSlug: 'bitcoin',
  networkStatus: 'active' as const,
  paymentMethodSlug: 'onchain' as const,
  paymentMethodStatus: 'active' as const,
  isPrimary: true,
};

describe('Evidence confirmation payment prerequisites', () => {
  it('accepts one active compatible primary payment combination', () => {
    expect(evaluateEvidenceReviewPaymentPrerequisites('direct_wallet', [base])).toEqual({
      eligible: true,
      issues: [],
    });
  });

  it('rejects an empty combination set and a set without exactly one primary row', () => {
    expect(evaluateEvidenceReviewPaymentPrerequisites('direct_wallet', [])).toMatchObject({
      eligible: false,
      issues: expect.arrayContaining([
        'At least one payment combination is required before confirmation.',
        'Exactly one primary payment combination is required before confirmation.',
      ]),
    });

    expect(
      evaluateEvidenceReviewPaymentPrerequisites('direct_wallet', [{ ...base, isPrimary: false }]),
    ).toMatchObject({ eligible: false });
  });

  it('rejects deprecated registries and incompatible method/network or route combinations', () => {
    const deprecated = evaluateEvidenceReviewPaymentPrerequisites('direct_wallet', [
      { ...base, assetStatus: 'deprecated' },
    ]);
    expect(deprecated.eligible).toBe(false);
    expect(deprecated.issues.join(' ')).toContain('active');

    const lightningMismatch = evaluateEvidenceReviewPaymentPrerequisites('direct_wallet', [
      {
        ...base,
        paymentMethodSlug: 'lightning_invoice',
        networkSlug: 'bitcoin',
      },
    ]);
    expect(lightningMismatch.eligible).toBe(false);
    expect(lightningMismatch.issues.join(' ')).toContain('Lightning');

    const processorMismatch = evaluateEvidenceReviewPaymentPrerequisites('direct_wallet', [
      {
        ...base,
        paymentMethodSlug: 'processor_checkout',
      },
    ]);
    expect(processorMismatch.eligible).toBe(false);
    expect(processorMismatch.issues.join(' ')).toContain('processor checkout route');
  });
});