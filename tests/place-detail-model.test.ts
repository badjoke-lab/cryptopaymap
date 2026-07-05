import { describe, expect, it } from 'vitest';
import {
  buildPlaceDetailModel,
  loadPublishedPlaces,
  parsePublicPlacesDocument,
  type PublicPlace,
} from '../src/public/place-detail';

const evidence = {
  kind: 'official_payment_page' as const,
  evidenceClass: 'a' as const,
  sourceType: 'official_page' as const,
  polarity: 'supporting' as const,
  sourceName: 'Example Coffee',
  sourceUrl: 'https://example.com/payments',
  archiveUrl: null,
  observedAt: '2026-06-20T00:00:00Z',
  publishedAt: null,
  summary: 'The official payment page documents Lightning checkout.',
};

const confirmedClaim = {
  claimKey: 'example-coffee-lightning',
  entitySlug: 'example-coffee',
  locationSlug: 'example-coffee-tokyo',
  claimScope: 'location_specific' as const,
  acceptanceScope: 'all_checkout' as const,
  status: 'confirmed' as const,
  routeType: 'direct_wallet' as const,
  processorSlug: null,
  howToPay: 'Ask staff to display a Lightning invoice and scan the QR code.',
  instructionsLanguage: 'en',
  merchantReceives: 'crypto' as const,
  restrictions: null,
  firstConfirmedAt: '2026-06-01T00:00:00Z',
  lastConfirmedAt: '2026-06-20T00:00:00Z',
  nextReviewAt: '2026-12-17T00:00:00Z',
  endedAt: null,
  endedReason: null,
  paymentAssets: [
    {
      assetSlug: 'bitcoin',
      assetSymbol: 'BTC',
      networkSlug: 'lightning',
      paymentMethod: 'lightning_invoice' as const,
      contractAddress: null,
      isPrimary: true,
      notes: null,
    },
  ],
  evidence: [evidence],
};

const place: PublicPlace = {
  placeSlug: 'example-coffee-tokyo',
  entitySlug: 'example-coffee',
  name: 'Example Coffee',
  categorySlug: 'cafe',
  entityStatus: 'active',
  locationStatus: 'active',
  addressLine: '1 Example Street',
  locality: 'Tokyo',
  region: 'Tokyo',
  postalCode: '100-0001',
  countryCode: 'JP',
  latitude: 35.681236,
  longitude: 139.767125,
  websiteUrl: 'https://example.com',
  claims: [
    {
      ...confirmedClaim,
      claimKey: 'example-coffee-old-btc',
      status: 'stale',
      lastConfirmedAt: '2026-05-01T00:00:00Z',
      paymentAssets: [
        ...confirmedClaim.paymentAssets,
        {
          assetSlug: 'bitcoin',
          assetSymbol: 'BTC',
          networkSlug: 'bitcoin',
          paymentMethod: 'onchain' as const,
          contractAddress: null,
          isPrimary: false,
          notes: null,
        },
      ],
    },
    confirmedClaim,
  ],
  media: [
    {
      role: 'cover',
      url: 'https://media.example.com/cover.webp',
      mimeType: 'image/webp',
      width: 960,
      height: 540,
      altText: 'Exterior of Example Coffee.',
      attribution: 'Example Coffee',
      licenseSlug: 'merchant-permission',
    },
    {
      role: 'interior',
      url: 'https://media.example.com/interior.webp',
      mimeType: 'image/webp',
      width: 960,
      height: 720,
      altText: 'Interior of Example Coffee.',
      attribution: 'Example Coffee',
      licenseSlug: 'merchant-permission',
    },
  ],
  provenance: [
    {
      sourceName: 'OpenStreetMap contributors',
      sourceUrl: 'https://www.openstreetmap.org/node/123',
      licenseSlug: 'odbl-1-0',
      attribution: '© OpenStreetMap contributors',
      fields: ['addressLine', 'latitude', 'longitude'],
    },
  ],
};

describe('Place detail public model', () => {
  it('derives a confirmed public summary from mixed public Claim states', () => {
    const model = buildPlaceDetailModel(place);

    expect(model.status).toBe('confirmed');
    expect(model.claims.map((claim) => claim.status)).toEqual(['confirmed', 'stale']);
    expect(model.assetSymbols).toEqual(['BTC']);
    expect(model.networkSlugs).toEqual(['lightning', 'bitcoin']);
    expect(model.lastConfirmedAt).toBe('2026-06-20T00:00:00Z');
    expect(model.address).toBe('1 Example Street, Tokyo, 100-0001, JP');
  });

  it('separates the cover image from approved gallery media', () => {
    const model = buildPlaceDetailModel(place);

    expect(model.cover?.role).toBe('cover');
    expect(model.gallery.map((media) => media.role)).toEqual(['interior']);
  });

  it('rejects non-contract fields before Place detail rendering', () => {
    expect(() =>
      parsePublicPlacesDocument({
        schemaVersion: '1.0.0',
        generatedAt: '2026-07-05T00:00:00Z',
        records: [{ ...place, internalNote: 'private' }],
      }),
    ).toThrow();
  });

  it('returns no public routes when the published Places file is absent', async () => {
    await expect(loadPublishedPlaces('/tmp/cryptopaymap-missing-places.json')).resolves.toEqual([]);
  });
});
