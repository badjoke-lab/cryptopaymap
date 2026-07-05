import { describe, expect, it } from 'vitest';
import { buildPublicHomeModel } from '../src/public/home';
import type { PublicOnlineService } from '../src/public/online-services';
import type { PublicPlace } from '../src/public/place-detail';

const place = {
  placeSlug: 'example-coffee-tokyo',
  name: 'Example Coffee',
  categorySlug: 'cafe',
  countryCode: 'JP',
  addressLine: null,
  locality: 'Tokyo',
  region: null,
  postalCode: null,
  media: [],
  claims: [
    {
      status: 'confirmed',
      lastConfirmedAt: '2026-06-20T00:00:00Z',
      paymentAssets: [
        {
          assetSlug: 'bitcoin',
          assetSymbol: 'BTC',
          networkSlug: 'lightning',
          paymentMethod: 'lightning_invoice',
          isPrimary: true,
          notes: null,
        },
      ],
    },
  ],
} as PublicPlace;

const service = {
  serviceSlug: 'example-vpn',
  name: 'Example VPN',
  categorySlug: 'vpn',
  countryCode: null,
  media: [],
  claims: [
    {
      status: 'confirmed',
      lastConfirmedAt: '2026-06-25T00:00:00Z',
      routeType: 'processor_checkout',
      processorSlug: 'example-processor',
      acceptanceScope: 'all_checkout',
      paymentAssets: [
        {
          assetSlug: 'bitcoin',
          assetSymbol: 'BTC',
          networkSlug: 'bitcoin',
          paymentMethod: 'processor_checkout',
          isPrimary: true,
        },
      ],
    },
  ],
} as PublicOnlineService;

describe('public Home model', () => {
  it('counts only confirmed public records and orders recent records by freshness', () => {
    const stalePlace = {
      ...place,
      placeSlug: 'stale-place',
      claims: place.claims.map((claim) => ({ ...claim, status: 'stale' as const })),
    };
    const model = buildPublicHomeModel([place, stalePlace], [service]);

    expect(model.confirmedPhysicalCount).toBe(1);
    expect(model.confirmedOnlineCount).toBe(1);
    expect(model.recentRecords.map((record) => record.name)).toEqual([
      'Example VPN',
      'Example Coffee',
    ]);
  });

  it('keeps canonical asset slugs while showing symbols and aggregates public browse counts', () => {
    const model = buildPublicHomeModel([place], [service]);

    expect(model.assets).toEqual([{ value: 'bitcoin', label: 'BTC', count: 2 }]);
    expect(model.networks).toEqual([
      { value: 'bitcoin', label: 'bitcoin', count: 1 },
      { value: 'lightning', label: 'lightning', count: 1 },
    ]);
    expect(model.regions).toEqual([{ value: 'JP', label: 'JP', count: 1 }]);
    expect(model.onlineHighlights.map((record) => record.slug)).toEqual(['example-vpn']);
  });

  it('returns explicit zero-data Home states without candidate substitutes', () => {
    expect(buildPublicHomeModel([], [])).toEqual({
      confirmedPhysicalCount: 0,
      confirmedOnlineCount: 0,
      recentRecords: [],
      assets: [],
      networks: [],
      regions: [],
      onlineHighlights: [],
    });
  });
});
