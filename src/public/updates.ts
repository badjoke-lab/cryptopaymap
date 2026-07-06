import { z } from 'zod';
import { publicUpdateSchema, publicUpdatesFileSchema } from '../schemas/public-exports';

export type PublicUpdate = z.infer<typeof publicUpdateSchema>;

export interface PublicUpdateGroup {
  monthKey: string;
  monthLabel: string;
  updates: PublicUpdate[];
}

export interface PublicUpdatesViewModel {
  total: number;
  latestEffectiveAt: string | null;
  groups: PublicUpdateGroup[];
}

function monthKey(value: string): string {
  return value.slice(0, 7);
}

function monthLabel(value: string): string {
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${value}-01T00:00:00Z`));
}

export function parsePublicUpdatesDocument(value: unknown): PublicUpdate[] {
  return publicUpdatesFileSchema.parse(value).records;
}

export function buildPublicUpdatesViewModel(
  updates: readonly PublicUpdate[],
): PublicUpdatesViewModel {
  const sorted = [...updates].sort(
    (left, right) =>
      Date.parse(right.effectiveAt) - Date.parse(left.effectiveAt) ||
      left.updateKey.localeCompare(right.updateKey),
  );
  const groups = new Map<string, PublicUpdate[]>();

  for (const update of sorted) {
    const key = monthKey(update.effectiveAt);
    const current = groups.get(key) ?? [];
    current.push(update);
    groups.set(key, current);
  }

  return {
    total: sorted.length,
    latestEffectiveAt: sorted[0]?.effectiveAt ?? null,
    groups: [...groups.entries()].map(([key, records]) => ({
      monthKey: key,
      monthLabel: monthLabel(key),
      updates: records,
    })),
  };
}
