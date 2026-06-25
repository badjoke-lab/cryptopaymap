export const discoveryViewModes = ['map', 'list'] as const;
export const discoveryRouteFilters = ['direct_wallet', 'processor_checkout'] as const;
export const discoveryStatusFilters = ['confirmed', 'stale', 'ended'] as const;

export type DiscoveryViewMode = (typeof discoveryViewModes)[number];
export type DiscoveryRouteFilter = (typeof discoveryRouteFilters)[number];
export type DiscoveryStatusFilter = (typeof discoveryStatusFilters)[number];

export interface DiscoveryViewport {
  latitude: number;
  longitude: number;
  zoom: number;
}

export interface DiscoveryUrlState {
  search: string;
  assets: string[];
  networks: string[];
  categories: string[];
  routes: DiscoveryRouteFilter[];
  statuses: DiscoveryStatusFilter[];
  viewport: DiscoveryViewport | null;
  selectedPlace: string | null;
  view: DiscoveryViewMode;
}

export const defaultDiscoveryUrlState: DiscoveryUrlState = {
  search: '',
  assets: [],
  networks: [],
  categories: [],
  routes: [],
  statuses: ['confirmed'],
  viewport: null,
  selectedPlace: null,
  view: 'map',
};

const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function normalizeSearch(value: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function normalizeSlug(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return slugPattern.test(normalized) ? normalized : null;
}

function readSlugList(params: URLSearchParams, key: string, limit = 12): string[] {
  const values = params
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map(normalizeSlug)
    .filter((value): value is string => value !== null);

  return [...new Set(values)].sort().slice(0, limit);
}

function readEnumList<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
): T[] {
  const allowedValues = new Set<string>(allowed);

  return [...new Set(
    params
      .getAll(key)
      .flatMap((value) => value.split(','))
      .map((value) => value.trim().toLowerCase())
      .filter((value): value is T => allowedValues.has(value)),
  )].sort();
}

function readFiniteNumber(params: URLSearchParams, key: string): number | null {
  const value = params.get(key);
  if (value === null || value.trim() === '') return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function readViewport(params: URLSearchParams): DiscoveryViewport | null {
  const latitude = readFiniteNumber(params, 'lat');
  const longitude = readFiniteNumber(params, 'lng');
  const zoom = readFiniteNumber(params, 'z');

  if (latitude === null || longitude === null || zoom === null) return null;

  return {
    latitude: clamp(latitude, -90, 90),
    longitude: clamp(longitude, -180, 180),
    zoom: clamp(zoom, 1, 22),
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function parseDiscoveryUrlState(input: string | URLSearchParams): DiscoveryUrlState {
  const params = typeof input === 'string' ? new URLSearchParams(input) : input;
  const selectedPlace = normalizeSlug(params.get('place') ?? '');
  const viewValue = params.get('view');
  const view: DiscoveryViewMode = discoveryViewModes.includes(viewValue as DiscoveryViewMode)
    ? (viewValue as DiscoveryViewMode)
    : defaultDiscoveryUrlState.view;
  const statuses = readEnumList(params, 'status', discoveryStatusFilters);

  return {
    search: normalizeSearch(params.get('q')),
    assets: readSlugList(params, 'asset'),
    networks: readSlugList(params, 'network'),
    categories: readSlugList(params, 'category'),
    routes: readEnumList(params, 'route', discoveryRouteFilters),
    statuses: statuses.length > 0 ? statuses : [...defaultDiscoveryUrlState.statuses],
    viewport: readViewport(params),
    selectedPlace,
    view,
  };
}

function appendList(params: URLSearchParams, key: string, values: readonly string[]): void {
  if (values.length > 0) params.set(key, [...new Set(values)].sort().join(','));
}

export function serializeDiscoveryUrlState(state: DiscoveryUrlState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.search) params.set('q', normalizeSearch(state.search));
  appendList(params, 'asset', state.assets.map((value) => normalizeSlug(value)).filter((value): value is string => value !== null));
  appendList(params, 'network', state.networks.map((value) => normalizeSlug(value)).filter((value): value is string => value !== null));
  appendList(params, 'category', state.categories.map((value) => normalizeSlug(value)).filter((value): value is string => value !== null));
  appendList(params, 'route', state.routes.filter((value) => discoveryRouteFilters.includes(value)));

  const statuses = state.statuses.filter((value) => discoveryStatusFilters.includes(value));
  if (!(statuses.length === 1 && statuses[0] === 'confirmed')) appendList(params, 'status', statuses);

  if (state.viewport) {
    params.set('lat', String(round(clamp(state.viewport.latitude, -90, 90), 5)));
    params.set('lng', String(round(clamp(state.viewport.longitude, -180, 180), 5)));
    params.set('z', String(round(clamp(state.viewport.zoom, 1, 22), 2)));
  }

  const selectedPlace = state.selectedPlace ? normalizeSlug(state.selectedPlace) : null;
  if (selectedPlace) params.set('place', selectedPlace);
  if (state.view !== defaultDiscoveryUrlState.view) params.set('view', state.view);

  return params;
}

export function mergeDiscoveryUrlState(
  current: DiscoveryUrlState,
  patch: Partial<DiscoveryUrlState>,
): DiscoveryUrlState {
  return parseDiscoveryUrlState(serializeDiscoveryUrlState({ ...current, ...patch }));
}
