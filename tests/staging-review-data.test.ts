import { describe, expect, it } from 'vitest';
import { buildStagingReviewData } from '../scripts/staging-review-data';

describe('staging review data', () => {
  it('covers public discovery, status, route, and long-content review states', () => {
    const data = buildStagingReviewData();

    expect(data.places.records).toHaveLength(18);
    expect(data.placePins.records).toHaveLength(16);
    expect(data.onlineServices.records).toHaveLength(9);
    expect(data.places.records.some((place) => place.claims[0]?.status === 'stale')).toBe(true);
    expect(data.places.records.some((place) => place.claims[0]?.status === 'ended')).toBe(true);
    expect(data.onlineServices.records.some((service) => service.claims[0]?.status === 'ended')).toBe(
      true,
    );
    expect(
      data.places.records.some((place) => place.claims[0]?.routeType === 'processor_checkout'),
    ).toBe(true);
    expect(data.places.records.some((place) => place.claims[0]?.restrictions !== null)).toBe(true);
    expect(data.onlineServices.records.some((service) => service.name.length > 60)).toBe(true);
  });

  it('never exposes ended physical records as active map pins', () => {
    const data = buildStagingReviewData();
    const endedSlugs = new Set(
      data.places.records
        .filter((place) => place.claims.some((claim) => claim.status === 'ended'))
        .map((place) => place.placeSlug),
    );

    expect(data.placePins.records.some((pin) => endedSlugs.has(pin.placeSlug))).toBe(false);
  });

  it('uses unmistakably synthetic public names and produces useful Stats coverage', () => {
    const data = buildStagingReviewData();

    for (const record of [...data.places.records, ...data.onlineServices.records]) {
      expect(record.name.startsWith('Staging ')).toBe(true);
    }
    expect(data.stats.confirmedPhysicalPlaces).toBeGreaterThanOrEqual(10);
    expect(data.stats.confirmedOnlineServices).toBeGreaterThanOrEqual(5);
    expect(data.stats.topAssets.length).toBeGreaterThan(1);
    expect(data.stats.topNetworks.length).toBeGreaterThan(1);
  });
});
