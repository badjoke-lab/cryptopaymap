import {
  publicOnlineServicesFileSchema,
  publicPlacePinsFileSchema,
  publicPlacesFileSchema,
  publicStatsSchema,
} from '../src/schemas/public-exports';

const generatedAt = '2026-08-31T00:00:00Z';
const schemaVersion = '1.0.0';

export function buildStagingReviewData() {
  return {
    places: publicPlacesFileSchema.parse({
      schemaVersion,
      generatedAt,
      records: [],
    }),
    placePins: publicPlacePinsFileSchema.parse({
      schemaVersion,
      generatedAt,
      records: [],
    }),
    onlineServices: publicOnlineServicesFileSchema.parse({
      schemaVersion,
      generatedAt,
      records: [],
    }),
    stats: publicStatsSchema.parse({
      confirmedPhysicalPlaces: 0,
      confirmedOnlineServices: 0,
      countries: 0,
      cities: 0,
      staleRecords: 0,
      endedRecords: 0,
      directWalletClaims: 0,
      processorCheckoutClaims: 0,
      howToPayCoverage: 0,
      networkSpecifiedRate: 0,
      evidenceBackedRate: 0,
      reconfirmedWithin90Days: 0,
      reconfirmedWithin180Days: 0,
      staleRate: 0,
      topAssets: [],
      topNetworks: [],
    }),
  };
}
