import type { PublicPlacePin } from '../../public/places-discovery';
import type { DiscoveryViewport } from '../../state/discovery-url';

export interface PlaceMapFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: string;
    geometry: {
      type: 'Point';
      coordinates: [number, number];
    };
    properties: {
      placeSlug: string;
      name: string;
      status: PublicPlacePin['status'];
      selected: boolean;
    };
  }>;
}

export interface PlaceMapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function buildPlaceMapFeatureCollection(
  pins: readonly PublicPlacePin[],
  selectedPlace: string | null,
): PlaceMapFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pins.map((pin) => ({
      type: 'Feature',
      id: pin.placeSlug,
      geometry: {
        type: 'Point',
        coordinates: [pin.longitude, pin.latitude],
      },
      properties: {
        placeSlug: pin.placeSlug,
        name: pin.name,
        status: pin.status,
        selected: pin.placeSlug === selectedPlace,
      },
    })),
  };
}

export function normalizeMapBounds(bounds: PlaceMapBounds): PlaceMapBounds {
  return {
    west: round(clamp(bounds.west, -180, 180), 5),
    south: round(clamp(bounds.south, -90, 90), 5),
    east: round(clamp(bounds.east, -180, 180), 5),
    north: round(clamp(bounds.north, -90, 90), 5),
  };
}

export function pinIsInsideMapBounds(pin: PublicPlacePin, bounds: PlaceMapBounds): boolean {
  const normalized = normalizeMapBounds(bounds);
  const insideLatitude = pin.latitude >= normalized.south && pin.latitude <= normalized.north;
  const insideLongitude =
    normalized.west <= normalized.east
      ? pin.longitude >= normalized.west && pin.longitude <= normalized.east
      : pin.longitude >= normalized.west || pin.longitude <= normalized.east;

  return insideLatitude && insideLongitude;
}

export function filterPinsByMapBounds(
  pins: readonly PublicPlacePin[],
  bounds: PlaceMapBounds | null,
): PublicPlacePin[] {
  return bounds ? pins.filter((pin) => pinIsInsideMapBounds(pin, bounds)) : [...pins];
}

export function normalizeMapViewport(viewport: DiscoveryViewport): DiscoveryViewport {
  return {
    latitude: round(clamp(viewport.latitude, -90, 90), 5),
    longitude: round(clamp(viewport.longitude, -180, 180), 5),
    zoom: round(clamp(viewport.zoom, 1, 22), 2),
  };
}

export function mapViewportChanged(
  current: DiscoveryViewport | null,
  next: DiscoveryViewport,
): boolean {
  if (current === null) return true;
  const previous = normalizeMapViewport(current);
  const candidate = normalizeMapViewport(next);

  return (
    previous.latitude !== candidate.latitude ||
    previous.longitude !== candidate.longitude ||
    previous.zoom !== candidate.zoom
  );
}
