import { describe, expect, it } from 'vitest';
import {
  filterPublicPlacePins,
  parsePublicPlacePinsDocument,
  type PublicPlacePin,
} from '../src/public/places-discovery';
import { defaultDiscoveryUrlState } from '../src/state/discovery-url';

const pins: PublicPlacePin[] = [
  {
    placeSlug: 'example-coffee-tokyo',
    name: 'Example Coffee',
    categorySlug: 'cafe',
    countryCode: 'JP',
    locality: 'Tokyo',
    latitude: 35.681236,
    longitude: 139.767125,
    status: 'confirmed',
    assetSlugs: ['bitcoin'],
    networkSlugs: ['lightning'],
    routeTypes: ['direct_wallet'],
    lastConfirmedAt: '2026-06-20T00:00:00Z',
    thumbnail: null,
  },
  {
    placeSlug: 'example-market-osaka',
    name: 'Example Market',
    categorySlug: 'grocery',
    countryCode: 'JP',
    locality: 'Osaka',
    latitude: 34.6937,
    longitude: 135.5023,
    status: 'stale',
    assetSlugs: ['usdc'],
    networkSlugs: ['base'],
    routeTypes: ['processor_checkout'],
    lastConfirmedAt: '2026-01-15T00:00:00Z',
    thumbnail: null,
  },
];

describe('Places discovery public model', () => {
  it('keeps Confirmed as the default public result set', () => {
    const results = filterPublicPlacePins(pins, defaultDiscoveryUrlState);
    expect(results.map((pin) => pin.placeSlug)).toEqual(['example-coffee-tokyo']);
  });

  it('combines public search and facet filters', () => {
    const results = filterPublicPlacePins(pins, {
      ...defaultDiscoveryUrlState,
      search: 'osaka',
      assets: ['usdc'],
      networks: ['base'],
      categories: ['grocery'],
      routes: ['processor_checkout'],
      statuses: ['stale'],
    });

    expect(results.map((pin) => pin.placeSlug)).toEqual(['example-market-osaka']);
  });

  it('rejects private or non-contract fields in published pin input', () => {
    expect(() =>
      parsePublicPlacePinsDocument({
        schemaVersion: '1.0.0',
        generatedAt: '2026-07-05T00:00:00Z',
        records: [{ ...pins[0], internalNote: 'private' }],
      }),
    ).toThrow();
  });
});
