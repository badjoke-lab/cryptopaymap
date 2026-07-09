import { describe, expect, it } from 'vitest';
import {
  normalizeSuggestSubmissionIntake,
  suggestSubmissionIntakeSchema,
} from '../src/submissions/suggest-contract';

function commonEnvelope(originalPayload: unknown) {
  return {
    schemaVersion: 'submission-common-v1',
    submissionType: 'suggest',
    targetType: null,
    targetId: null,
    relationship: 'customer',
    contact: null,
    evidenceLinks: [
      {
        url: 'https://merchant.example/payments',
        observedAt: '2026-07-01',
        summary: 'Official payment information.',
      },
    ],
    originalPayload,
    acknowledgements: {
      privacyNoticeAccepted: true,
      submissionTermsAccepted: true,
    },
  };
}

function paymentProposal() {
  return {
    assetSlug: 'btc',
    networkSlug: 'bitcoin',
    routeType: 'direct_wallet',
    paymentMethod: 'onchain',
    processor: null,
    contractAddress: null,
    howToPay: 'Ask for the Bitcoin payment QR code at checkout.',
    restrictions: null,
    isPrimary: true,
  };
}

function physicalPayload() {
  return {
    schemaVersion: 'suggest-v1',
    suggestionKind: 'physical_place',
    entity: {
      name: 'Example Coffee',
      legalName: null,
      websiteUrl: 'https://coffee.example/',
      countryCode: 'jp',
    },
    place: {
      branchName: 'Shibuya',
      addressLine: '1-2-3 Jingumae',
      locality: 'Shibuya',
      region: 'Tokyo',
      postalCode: '150-0001',
      countryCode: 'jp',
      latitude: 35.6695,
      longitude: 139.7026,
      websiteUrl: 'https://coffee.example/shibuya',
      phone: '+81-3-0000-0000',
      description: 'Coffee shop with in-person Bitcoin payment.',
      openingHours: 'Mo-Su 08:00-20:00',
      amenities: ['wifi', 'wifi', 'outdoor seating'],
      socialLinks: [
        {
          platform: 'x',
          url: 'https://x.com/examplecoffee',
          handle: '@examplecoffee',
        },
      ],
    },
    categories: [{ slug: 'coffee-shop', isPrimary: true }],
    paymentProposals: [paymentProposal()],
    observedAt: '2026-07-01',
  };
}

function onlinePayload() {
  return {
    schemaVersion: 'suggest-v1',
    suggestionKind: 'online_service',
    entity: {
      name: 'Example Hosting',
      legalName: null,
      websiteUrl: 'https://hosting.example/',
      countryCode: 'us',
    },
    place: null,
    categories: [{ slug: 'web-hosting', isPrimary: true }],
    paymentProposals: [
      {
        assetSlug: 'usdc',
        networkSlug: 'base',
        routeType: 'processor_checkout',
        paymentMethod: 'processor_checkout',
        processor: {
          name: 'Example Processor',
          websiteUrl: 'https://processor.example/',
        },
        contractAddress: null,
        howToPay: 'Choose crypto during hosted checkout and select USDC on Base.',
        restrictions: null,
        isPrimary: true,
      },
    ],
    observedAt: '2026-07-02',
  };
}

describe('P5-02A Suggest submission contract', () => {
  it('accepts and normalizes a physical Place suggestion', () => {
    const projection = normalizeSuggestSubmissionIntake(commonEnvelope(physicalPayload()));

    expect(projection).toMatchObject({
      suggestionKind: 'physical_place',
      entityType: 'merchant',
      entity: {
        name: 'Example Coffee',
        countryCode: 'JP',
      },
      place: {
        branchName: 'Shibuya',
        countryCode: 'JP',
        latitude: 35.6695,
        longitude: 139.7026,
        amenities: ['wifi', 'outdoor seating'],
      },
      categories: [{ slug: 'coffee-shop', isPrimary: true }],
      relationship: 'customer',
      observedAt: '2026-07-01',
    });
    expect(projection.evidenceLinks).toHaveLength(1);
  });

  it('accepts and normalizes an Online Service suggestion without a Location proposal', () => {
    const projection = normalizeSuggestSubmissionIntake(commonEnvelope(onlinePayload()));

    expect(projection).toMatchObject({
      suggestionKind: 'online_service',
      entityType: 'online_service',
      place: null,
      entity: {
        name: 'Example Hosting',
        websiteUrl: 'https://hosting.example/',
        countryCode: 'US',
      },
      paymentProposals: [
        {
          assetSlug: 'usdc',
          networkSlug: 'base',
          routeType: 'processor_checkout',
          paymentMethod: 'processor_checkout',
          processor: { name: 'Example Processor' },
        },
      ],
    });
  });

  it('rejects Suggest intake that targets an existing canonical record', () => {
    const input = {
      ...commonEnvelope(physicalPayload()),
      targetType: 'location',
      targetId: '10000000-0000-4000-8000-000000000001',
    };

    expect(suggestSubmissionIntakeSchema.safeParse(input).success).toBe(false);
  });

  it('requires relationship disclosure for Suggest intake', () => {
    const input = { ...commonEnvelope(physicalPayload()), relationship: null };
    expect(suggestSubmissionIntakeSchema.safeParse(input).success).toBe(false);
  });

  it('requires an official HTTPS website for Online Service suggestions', () => {
    const payload = onlinePayload();
    const input = commonEnvelope({
      ...payload,
      entity: { ...payload.entity, websiteUrl: null },
    });

    const result = suggestSubmissionIntakeSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('websiteUrl'))).toBe(true);
    }
  });

  it('accepts a Place suggestion with address but no coordinates', () => {
    const payload = physicalPayload();
    const input = commonEnvelope({
      ...payload,
      place: { ...payload.place, latitude: null, longitude: null },
    });

    expect(suggestSubmissionIntakeSchema.safeParse(input).success).toBe(true);
  });

  it('accepts a Place suggestion with coordinates but no address line', () => {
    const payload = physicalPayload();
    const input = commonEnvelope({
      ...payload,
      place: { ...payload.place, addressLine: null },
    });

    expect(suggestSubmissionIntakeSchema.safeParse(input).success).toBe(true);
  });

  it('rejects a Place suggestion with neither address nor coordinates', () => {
    const payload = physicalPayload();
    const input = commonEnvelope({
      ...payload,
      place: {
        ...payload.place,
        addressLine: null,
        latitude: null,
        longitude: null,
      },
    });

    expect(suggestSubmissionIntakeSchema.safeParse(input).success).toBe(false);
  });

  it('rejects one-sided or out-of-range Place coordinates', () => {
    const payload = physicalPayload();
    expect(
      suggestSubmissionIntakeSchema.safeParse(
        commonEnvelope({
          ...payload,
          place: { ...payload.place, latitude: 91 },
        }),
      ).success,
    ).toBe(false);
    expect(
      suggestSubmissionIntakeSchema.safeParse(
        commonEnvelope({
          ...payload,
          place: { ...payload.place, latitude: null, longitude: 139.7 },
        }),
      ).success,
    ).toBe(false);
  });

  it('allows categories to remain unclassified but rejects duplicates and multiple primary categories', () => {
    const payload = physicalPayload();
    expect(
      suggestSubmissionIntakeSchema.safeParse(
        commonEnvelope({ ...payload, categories: [] }),
      ).success,
    ).toBe(true);

    const duplicateCategories = [
      { slug: 'coffee-shop', isPrimary: false },
      { slug: 'coffee-shop', isPrimary: false },
    ];
    expect(
      suggestSubmissionIntakeSchema.safeParse(
        commonEnvelope({ ...payload, categories: duplicateCategories }),
      ).success,
    ).toBe(false);

    const multiplePrimary = [
      { slug: 'coffee-shop', isPrimary: true },
      { slug: 'restaurant', isPrimary: true },
    ];
    expect(
      suggestSubmissionIntakeSchema.safeParse(
        commonEnvelope({ ...payload, categories: multiplePrimary }),
      ).success,
    ).toBe(false);
  });

  it('preserves reviewable incomplete payment details without inferring a network', () => {
    const payload = physicalPayload();
    const partialPayment = {
      assetSlug: 'usdt',
      networkSlug: null,
      routeType: null,
      paymentMethod: null,
      processor: null,
      contractAddress: null,
      howToPay: 'The merchant says USDT is accepted; network is not yet confirmed.',
      restrictions: null,
      isPrimary: false,
    };
    const projection = normalizeSuggestSubmissionIntake(
      commonEnvelope({ ...payload, paymentProposals: [partialPayment] }),
    );

    expect(projection.paymentProposals[0]).toMatchObject({
      assetSlug: 'usdt',
      networkSlug: null,
      routeType: null,
      paymentMethod: null,
      isPrimary: false,
    });
  });

  it('rejects an empty payment proposal and duplicate proposal content', () => {
    const payload = physicalPayload();
    const emptyPayment = {
      assetSlug: null,
      networkSlug: null,
      routeType: null,
      paymentMethod: null,
      processor: null,
      contractAddress: null,
      howToPay: null,
      restrictions: null,
      isPrimary: false,
    };
    expect(
      suggestSubmissionIntakeSchema.safeParse(
        commonEnvelope({ ...payload, paymentProposals: [emptyPayment] }),
      ).success,
    ).toBe(false);

    expect(
      suggestSubmissionIntakeSchema.safeParse(
        commonEnvelope({ ...payload, paymentProposals: [paymentProposal(), paymentProposal()] }),
      ).success,
    ).toBe(false);
  });

  it('allows no primary payment option but rejects multiple primary options', () => {
    const payload = physicalPayload();
    const first = { ...paymentProposal(), isPrimary: false };
    const second = {
      ...paymentProposal(),
      assetSlug: 'ltc',
      networkSlug: 'litecoin',
      isPrimary: false,
    };
    expect(
      suggestSubmissionIntakeSchema.safeParse(
        commonEnvelope({ ...payload, paymentProposals: [first, second] }),
      ).success,
    ).toBe(true);

    expect(
      suggestSubmissionIntakeSchema.safeParse(
        commonEnvelope({
          ...payload,
          paymentProposals: [
            { ...first, isPrimary: true },
            { ...second, isPrimary: true },
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it('requires processor metadata for known processor checkout and forbids it on direct wallet proposals', () => {
    const processorPayload = onlinePayload();
    const processorPayment = processorPayload.paymentProposals[0]!;
    expect(
      suggestSubmissionIntakeSchema.safeParse(
        commonEnvelope({
          ...processorPayload,
          paymentProposals: [{ ...processorPayment, processor: null }],
        }),
      ).success,
    ).toBe(false);

    const directPayload = physicalPayload();
    const directPayment = directPayload.paymentProposals[0]!;
    expect(
      suggestSubmissionIntakeSchema.safeParse(
        commonEnvelope({
          ...directPayload,
          paymentProposals: [
            {
              ...directPayment,
              processor: {
                name: 'Unexpected Processor',
                websiteUrl: 'https://processor.example/',
              },
            },
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it('rejects extra type-specific payload keys', () => {
    const payload = { ...physicalPayload(), publishImmediately: true };
    expect(suggestSubmissionIntakeSchema.safeParse(commonEnvelope(payload)).success).toBe(false);
  });
});
