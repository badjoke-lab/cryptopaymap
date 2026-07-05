import { describe, expect, it } from 'vitest';
import {
  buildOnlineServiceCardModel,
  buildOnlineServiceDetailModel,
  filterPublicOnlineServices,
  parsePublicOnlineServicesDocument,
  type PublicOnlineService,
} from '../src/public/online-services';

const service: PublicOnlineService = {
  serviceSlug: 'example-vpn',
  name: 'Example VPN',
  categorySlug: 'vpn',
  entityStatus: 'active',
  countryCode: null,
  websiteUrl: 'https://example.com',
  claims: [
    {
      claimKey: 'example-vpn-checkout',
      entitySlug: 'example-vpn',
      locationSlug: null,
      claimScope: 'online_service',
      acceptanceScope: 'all_checkout',
      status: 'confirmed',
      routeType: 'processor_checkout',
      processorSlug: 'example-processor',
      howToPay: 'Choose cryptocurrency at checkout and complete the processor payment request.',
      instructionsLanguage: 'en',
      merchantReceives: 'fiat',
      restrictions: null,
      firstConfirmedAt: '2026-05-01T00:00:00Z',
      lastConfirmedAt: '2026-06-20T00:00:00Z',
      nextReviewAt: '2026-12-17T00:00:00Z',
      endedAt: null,
      endedReason: null,
      paymentAssets: [
        {
          assetSlug: 'bitcoin',
          assetSymbol: 'BTC',
          networkSlug: 'bitcoin',
          paymentMethod: 'processor_checkout',
          contractAddress: null,
          isPrimary: true,
          notes: null,
        },
      ],
      evidence: [
        {
          kind: 'official_payment_page',
          evidenceClass: 'a',
          sourceType: 'official_page',
          polarity: 'supporting',
          sourceName: 'Example VPN payments',
          sourceUrl: 'https://example.com/payments',
          archiveUrl: null,
          observedAt: '2026-06-20T00:00:00Z',
          publishedAt: null,
          summary: 'The official payment page documents cryptocurrency checkout availability.',
        },
      ],
    },
  ],
  media: [],
  provenance: [
    {
      sourceName: 'Example VPN',
      sourceUrl: 'https://example.com/payments',
      licenseSlug: null,
      attribution: null,
      fields: ['websiteUrl', 'claims'],
    },
  ],
};

describe('Online Services public model', () => {
  it('builds a status-aware payment detail model', () => {
    const model = buildOnlineServiceDetailModel(service);

    expect(model.status).toBe('confirmed');
    expect(model.assetSymbols).toEqual(['BTC']);
    expect(model.networkSlugs).toEqual(['bitcoin']);
    expect(model.processorSlugs).toEqual(['example-processor']);
    expect(model.acceptanceScopes).toEqual(['all_checkout']);
    expect(model.lastConfirmedAt).toBe('2026-06-20T00:00:00Z');
  });

  it('builds a compact public card model', () => {
    expect(buildOnlineServiceCardModel(service)).toMatchObject({
      serviceSlug: 'example-vpn',
      name: 'Example VPN',
      categorySlug: 'vpn',
      status: 'confirmed',
      assetSymbols: ['BTC'],
      networkSlugs: ['bitcoin'],
      acceptanceScopes: ['all_checkout'],
    });
  });

  it('filters public services by name, category, and country', () => {
    expect(filterPublicOnlineServices([service], 'vpn')).toHaveLength(1);
    expect(filterPublicOnlineServices([service], 'hosting')).toHaveLength(0);
  });

  it('rejects non-contract fields from published Online Services input', () => {
    expect(() =>
      parsePublicOnlineServicesDocument({
        schemaVersion: '1.0.0',
        generatedAt: '2026-07-05T00:00:00Z',
        records: [{ ...service, internalNote: 'private' }],
      }),
    ).toThrow();
  });
});
