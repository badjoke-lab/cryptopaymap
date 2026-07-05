import { describe, expect, it } from 'vitest';
import {
  buildPlaceMapFeatureCollection,
  mapViewportChanged,
  normalizeMapViewport,
} from '../src/components/places/map-data';
import type { PublicPlacePin } from '../src/public/places-discovery';

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

describe('Places map data contract', () => {
  it('builds deterministic point features from public Place pins', () => {
    const source = buildPlaceMapFeatureCollection(pins, 'example-market-osaka');

    expect(source.type).toBe('FeatureCollection');
    expect(source.features).toHaveLength(2);
    expect(source.features[0]?.geometry.coordinates).toEqual([139.767125, 35.681236]);
    expect(source.features[1]?.properties.selected).toBe(true);
    expect(source.features[0]?.properties.selected).toBe(false);
  });

  it('normalizes map camera state to the public URL boundary', () => {
    expect(
      normalizeMapViewport({ latitude: 91.1234567, longitude: -181.1234567, zoom: 25.555 }),
    ).toEqual({ latitude: 90, longitude: -180, zoom: 22 });
  });

  it('compares camera state after public normalization', () => {
    expect(
      mapViewportChanged(
        { latitude: 35.6812361, longitude: 139.7671251, zoom: 12.3441 },
        { latitude: 35.6812362, longitude: 139.7671252, zoom: 12.3442 },
      ),
    ).toBe(false);

    expect(mapViewportChanged(null, { latitude: 35.68, longitude: 139.77, zoom: 12 })).toBe(true);
  });
});
