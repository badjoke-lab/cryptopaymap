import { describe, expect, it } from 'vitest';
import {
  buildPublicStatsViewModel,
  parsePublicStatsDocument,
  type PublicStats,
} from '../src/public/stats';

const stats: PublicStats = {
  schemaVersion: '1.0.0',
  generatedAt: '2026-07-05T00:00:00Z',
  counts: {
    confirmedPhysicalPlaces: 10,
    confirmedOnlineServices: 5,
    countries: 4,
    cities: 7,
    staleRecords: 2,
    endedRecords: 1,
    directWalletClaims: 8,
    processorCheckoutClaims: 7,
  },
  topAssets: [
    { slug: 'bitcoin', count: 8 },
    { slug: 'usdc', count: 4 },
    { slug: 'xrp', count: 2 },
  ],
  topNetworks: [
    { slug: 'lightning', count: 6 },
    { slug: 'base', count: 3 },
  ],
  quality: {
    howToPayCoverage: 1,
    networkSpecifiedRate: 1,
    evidenceBackedRate: 1,
    reconfirmedWithin90Days: 0.8,
    reconfirmedWithin180Days: 0.9,
    staleRate: 0.1,
  },
  changes: {
    newlyConfirmed: 3,
    reconfirmed: 5,
    markedStale: 1,
    ended: 1,
  },
};

describe('public Stats view model', () => {
  it('enforces public display and ranking thresholds', () => {
    const model = buildPublicStatsViewModel(stats);

    expect(model.topAssets).toEqual([
      { slug: 'bitcoin', count: 8, rank: 1 },
      { slug: 'usdc', count: 4, rank: null },
    ]);
    expect(model.topNetworks).toEqual([
      { slug: 'lightning', count: 6, rank: 1 },
      { slug: 'base', count: 3, rank: null },
    ]);
  });

  it('rejects private or non-contract fields in the public Stats document', () => {
    expect(() => parsePublicStatsDocument({ ...stats, candidateCount: 500 })).toThrow();
  });
});
