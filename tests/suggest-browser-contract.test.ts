import { describe, expect, it } from 'vitest';
import {
  buildSuggestSubmissionIntakeFromBrowserForm,
  emptySuggestBrowserFormValues,
} from '../src/submissions/suggest-browser-contract';

function baseValues() {
  return {
    ...emptySuggestBrowserFormValues('2026-07-10'),
    name: 'Example Coffee',
    countryCode: 'jp',
    addressLine: '1-2-3 Example Street',
    assetSlug: 'bitcoin',
    networkSlug: 'lightning',
    routeType: 'direct_wallet' as const,
    paymentMethod: 'lightning_invoice' as const,
    howToPay: 'Ask staff to display a Lightning invoice and scan the QR code.',
    relationship: 'customer' as const,
    privacyNoticeAccepted: true,
    submissionTermsAccepted: true,
  };
}

describe('P5-02P browser Suggest payload builder', () => {
  it('builds a strict physical Place Suggest intake without adding public state', () => {
    const intake = buildSuggestSubmissionIntakeFromBrowserForm({
      ...baseValues(),
      websiteUrl: 'https://coffee.example/',
      categorySlug: 'cafe',
      evidenceUrl: 'https://coffee.example/payments',
      evidenceSummary: 'Official payment page lists Lightning.',
      contactEmail: 'submitter@example.test',
      contactAllowed: true,
    });

    expect(intake).toEqual(
      expect.objectContaining({
        schemaVersion: 'submission-common-v1',
        submissionType: 'suggest',
        targetType: null,
        targetId: null,
        relationship: 'customer',
        contact: {
          email: 'submitter@example.test',
          contactAllowed: true,
        },
        acknowledgements: {
          privacyNoticeAccepted: true,
          submissionTermsAccepted: true,
        },
      }),
    );
    expect(intake.originalPayload).toEqual(
      expect.objectContaining({
        schemaVersion: 'suggest-v1',
        suggestionKind: 'physical_place',
        entity: expect.objectContaining({
          name: 'Example Coffee',
          countryCode: 'JP',
          websiteUrl: 'https://coffee.example/',
        }),
        place: expect.objectContaining({
          addressLine: '1-2-3 Example Street',
          countryCode: 'JP',
          latitude: null,
          longitude: null,
        }),
        categories: [{ slug: 'cafe', isPrimary: true }],
        paymentProposals: [
          expect.objectContaining({
            assetSlug: 'bitcoin',
            networkSlug: 'lightning',
            routeType: 'direct_wallet',
            paymentMethod: 'lightning_invoice',
            processor: null,
            isPrimary: true,
          }),
        ],
      }),
    );
    expect(intake.evidenceLinks).toEqual([
      {
        url: 'https://coffee.example/payments',
        observedAt: null,
        summary: 'Official payment page lists Lightning.',
      },
    ]);
  });

  it('builds an Online Service Suggest with processor details', () => {
    const intake = buildSuggestSubmissionIntakeFromBrowserForm({
      ...baseValues(),
      suggestionKind: 'online_service',
      name: 'Example Hosting',
      websiteUrl: 'https://hosting.example/',
      addressLine: '',
      assetSlug: 'tether',
      networkSlug: 'tron',
      routeType: 'processor_checkout',
      paymentMethod: 'processor_checkout',
      processorName: 'Example Processor',
      processorWebsiteUrl: 'https://processor.example/',
      restrictions: 'Available on selected plans.',
      contactEmail: '',
      contactAllowed: false,
    });

    expect(intake.originalPayload.suggestionKind).toBe('online_service');
    expect(intake.originalPayload.place).toBeNull();
    expect(intake.originalPayload.entity.websiteUrl).toBe('https://hosting.example/');
    expect(intake.originalPayload.paymentProposals[0]).toEqual(
      expect.objectContaining({
        routeType: 'processor_checkout',
        processor: {
          name: 'Example Processor',
          websiteUrl: 'https://processor.example/',
        },
      }),
    );
    expect(intake.contact).toBeNull();
  });

  it('rejects physical suggestions without an address', () => {
    expect(() =>
      buildSuggestSubmissionIntakeFromBrowserForm({
        ...baseValues(),
        addressLine: '',
      }),
    ).toThrow();
  });

  it('rejects processor checkout without a processor name', () => {
    expect(() =>
      buildSuggestSubmissionIntakeFromBrowserForm({
        ...baseValues(),
        routeType: 'processor_checkout',
        paymentMethod: 'processor_checkout',
        processorName: '',
      }),
    ).toThrow();
  });

  it('rejects missing required acknowledgements', () => {
    expect(() =>
      buildSuggestSubmissionIntakeFromBrowserForm({
        ...baseValues(),
        privacyNoticeAccepted: false,
      }),
    ).toThrow();
  });
});
