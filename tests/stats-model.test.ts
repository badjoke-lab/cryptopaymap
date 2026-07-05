import { describe, expect, it } from 'vitest';
import {
  buildPublicStatsViewModel,
  parsePublicStatsDocument,
  type PublicStats,
} from '../src/public/stats';

const stats: PublicStats = {
  confirmedPhysicalPlaces: 10,
  confirmedOnlineServices: 5,
  countries: 4,
  cities: 7,
  staleRecords: 2,
  endedRecords: 1,
  directWalletClaims: 8,
  processorCheckoutClaims: 7,
  howToPayCoverage: 1,
  networkSpecifiedRate: 1,
  evidenceBackedRate: 1,
  reconfirmedWithin90Days: 0.8,
  reconfirmedWithin180Days: 0.9,
  staleRate: 0.1,
  topAssets: [
    { key: 'bitcoin', count: 8 },
    { key: 'usdc', count: 4 },
    { key: 'xrp', count: 2 },
  ],
  topNetworks: [
    { key: 'lightning', count: 6 },
    { key: 'base', count: 3 },
  ],
};

describe('public Stats view model', () => {
  it('enforces public display and ranking thresholds', () => {
    const model = buildPublicStatsViewModel(stats);

    expect(model.topAssets).toEqual([
      { key: 'bitcoin', count: 8, rank: 1 },
      { key: 'usdc', count: 4, rank: null },
    ]);
    expect(model.topNetworks).toEqual([
      { key: 'lightning', count: 6, rank: 1 },
      { key: 'base', count: 3, rank: null },
    ]);
  });

  it('rejects private or non-contract fields in the public Stats document', () => {
    expect(() => parsePublicStatsDocument({ ...stats, candidateCount: 500 })).toThrow();
  });
});
