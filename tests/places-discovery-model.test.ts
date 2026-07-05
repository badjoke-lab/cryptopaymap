import { describe, expect, it } from 'vitest';
import {
  buildPublicPlaceFilterFacets,
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
  {
    placeSlug: 'second-bitcoin-cafe',
    name: 'Second Bitcoin Cafe',
    categorySlug: 'cafe',
    countryCode: 'JP',
    locality: 'Kyoto',
    latitude: 35.0116,
    longitude: 135.7681,
    status: 'confirmed',
    assetSlugs: ['bitcoin'],
    networkSlugs: ['lightning'],
    routeTypes: ['direct_wallet'],
    lastConfirmedAt: '2026-06-25T00:00:00Z',
    thumbnail: null,
  },
];

describe('Places discovery public model', () => {
  it('keeps Confirmed as the default public result set', () => {
    const results = filterPublicPlacePins(pins, defaultDiscoveryUrlState);
    expect(results.map((pin) => pin.placeSlug)).toEqual([
      'example-coffee-tokyo',
      'second-bitcoin-cafe',
    ]);
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

  it('derives deterministic public facets and counts without duplicate values per Place', () => {
    const facets = buildPublicPlaceFilterFacets(
      [
        pins[0] ? { ...pins[0], assetSlugs: ['bitcoin', 'bitcoin'] } : pins[0],
        ...pins.slice(1),
      ].filter((pin): pin is PublicPlacePin => pin !== undefined),
    );

    expect(facets.assets).toEqual([
      { value: 'bitcoin', count: 2 },
      { value: 'usdc', count: 1 },
    ]);
    expect(facets.categories).toEqual([
      { value: 'cafe', count: 2 },
      { value: 'grocery', count: 1 },
    ]);
    expect(facets.statuses).toEqual([
      { value: 'confirmed', count: 2 },
      { value: 'stale', count: 1 },
    ]);
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
