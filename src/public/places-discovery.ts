import { z } from 'zod';
import {
  publicPlacePinSchema,
  publicPlacePinsFileSchema,
} from '../schemas/public-exports';
import type { DiscoveryUrlState } from '../state/discovery-url';

export type PublicPlacePin = z.infer<typeof publicPlacePinSchema>;

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
