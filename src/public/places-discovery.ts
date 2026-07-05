import type { z } from 'zod';
import { type publicPlacePinSchema, publicPlacePinsFileSchema } from '../schemas/public-exports';
import type { DiscoveryUrlState } from '../state/discovery-url';

export type PublicPlacePin = z.infer<typeof publicPlacePinSchema>;

export interface PublicPlaceFilterFacet {
  value: string;
  count: number;
}

export interface PublicPlaceFilterFacets {
  assets: PublicPlaceFilterFacet[];
  networks: PublicPlaceFilterFacet[];
  categories: PublicPlaceFilterFacet[];
  routes: PublicPlaceFilterFacet[];
  statuses: PublicPlaceFilterFacet[];
}

function includesSearch(pin: PublicPlacePin, search: string): boolean {
  if (!search) return true;
  const haystack = [pin.name, pin.categorySlug, pin.locality ?? '', pin.countryCode]
    .join(' ')
    .toLowerCase();
  return haystack.includes(search.toLowerCase());
}

function intersects(values: readonly string[], selected: readonly string[]): boolean {
  return selected.length === 0 || selected.some((value) => values.includes(value));
}

function countFacetValues(values: readonly string[]): PublicPlaceFilterFacet[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => left.value.localeCompare(right.value));
}

export function buildPublicPlaceFilterFacets(
  pins: readonly PublicPlacePin[],
): PublicPlaceFilterFacets {
  return {
    assets: countFacetValues(pins.flatMap((pin) => [...new Set(pin.assetSlugs)])),
    networks: countFacetValues(pins.flatMap((pin) => [...new Set(pin.networkSlugs)])),
    categories: countFacetValues(pins.map((pin) => pin.categorySlug)),
    routes: countFacetValues(pins.flatMap((pin) => [...new Set(pin.routeTypes)])),
    statuses: countFacetValues(pins.map((pin) => pin.status)),
  };
}

export function filterPublicPlacePins(
  pins: readonly PublicPlacePin[],
  state: DiscoveryUrlState,
): PublicPlacePin[] {
  return pins.filter(
    (pin) =>
      includesSearch(pin, state.search) &&
      intersects(pin.assetSlugs, state.assets) &&
      intersects(pin.networkSlugs, state.networks) &&
      (state.categories.length === 0 || state.categories.includes(pin.categorySlug)) &&
      intersects(pin.routeTypes, state.routes) &&
      state.statuses.includes(pin.status),
  );
}

export function parsePublicPlacePinsDocument(value: unknown): PublicPlacePin[] {
  return publicPlacePinsFileSchema.parse(value).records;
}
