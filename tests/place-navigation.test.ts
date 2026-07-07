import { describe, expect, it } from 'vitest';
import { buildPlaceNavigationLinks } from '../src/components/places/place-navigation';

describe('Place navigation links', () => {
  it('builds Google Maps and Apple Maps destination handoff URLs from public coordinates', () => {
    const links = buildPlaceNavigationLinks({ latitude: 35.681236, longitude: 139.767125 });

    const google = new URL(links.googleMapsUrl);
    expect(google.origin).toBe('https://www.google.com');
    expect(google.pathname).toBe('/maps/dir/');
    expect(google.searchParams.get('api')).toBe('1');
    expect(google.searchParams.get('destination')).toBe('35.681236,139.767125');

    const apple = new URL(links.appleMapsUrl);
    expect(apple.origin).toBe('https://maps.apple.com');
    expect(apple.searchParams.get('daddr')).toBe('35.681236,139.767125');
  });
});
