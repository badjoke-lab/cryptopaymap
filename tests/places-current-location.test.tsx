import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlacesApp } from '../src/components/places/PlacesApp';
import type { PublicPlacePin } from '../src/public/places-discovery';

const pins: PublicPlacePin[] = [
  {
    placeSlug: 'example-coffee-tokyo',
    name: 'Example Coffee',
    categorySlug: 'cafe',
    countryCode: 'JP',
    locality: 'Tokyo',
    latitude: 35.681236,
    longitude: 139.767125,
    status: 'confirmed',
    assetSlugs: ['bitcoin'],
    networkSlugs: ['lightning'],
    routeTypes: ['direct_wallet'],
    lastConfirmedAt: '2026-06-20T00:00:00Z',
    thumbnail: null,
  },
];

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation');
  window.history.replaceState({}, '', '/');
});

describe('Places current location', () => {
  it('focuses the map without immediately committing raw coordinates to the URL', () => {
    window.history.replaceState({}, '', '/places');
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: {
          latitude: 35.6895,
          longitude: 139.6917,
          accuracy: 50,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      });
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });

    render(<PlacesApp pins={pins} places={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Current location' }));

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(window.location.search).not.toContain('lat=');
    expect(window.location.search).not.toContain('lng=');
    expect(window.location.search).not.toContain('zoom=14');
  });
});
