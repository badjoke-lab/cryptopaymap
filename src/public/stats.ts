import { z } from 'zod';
import { publicStatsSchema } from '../schemas/public-exports';

export type PublicStats = z.infer<typeof publicStatsSchema>;
export type PublicStatRankingEntry = PublicStats['topAssets'][number];

export interface PublicStatDisplayEntry extends PublicStatRankingEntry {
  rank: number | null;
}

export interface PublicStatsViewModel {
  stats: PublicStats;
  topAssets: PublicStatDisplayEntry[];
  topNetworks: PublicStatDisplayEntry[];
}

function buildDisplayEntries(entries: readonly PublicStatRankingEntry[]): PublicStatDisplayEntry[] {
  return [...entries]
    .filter((entry) => entry.count >= 3)
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .map((entry, index) => ({
      ...entry,
      rank: entry.count >= 5 ? index + 1 : null,
    }));
}

export function buildPublicStatsViewModel(stats: PublicStats): PublicStatsViewModel {
  return {
    stats,
    topAssets: buildDisplayEntries(stats.topAssets),
    topNetworks: buildDisplayEntries(stats.topNetworks),
  };
}

export function parsePublicStatsDocument(value: unknown): PublicStats {
  return publicStatsSchema.parse(value);
}
