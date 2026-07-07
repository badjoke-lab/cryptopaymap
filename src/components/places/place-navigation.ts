export interface PlaceNavigationInput {
  latitude: number;
  longitude: number;
}

export interface PlaceNavigationLinks {
  googleMapsUrl: string;
  appleMapsUrl: string;
}

function coordinateDestination({ latitude, longitude }: PlaceNavigationInput): string {
  return `${latitude},${longitude}`;
}

export function buildPlaceNavigationLinks(input: PlaceNavigationInput): PlaceNavigationLinks {
  const destination = coordinateDestination(input);
  const googleMaps = new URL('https://www.google.com/maps/dir/');
  googleMaps.searchParams.set('api', '1');
  googleMaps.searchParams.set('destination', destination);

  const appleMaps = new URL('https://maps.apple.com/');
  appleMaps.searchParams.set('daddr', destination);

  return {
    googleMapsUrl: googleMaps.toString(),
    appleMapsUrl: appleMaps.toString(),
  };
}
