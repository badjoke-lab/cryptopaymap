import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlaceResultList } from '../src/components/places/PlaceResultList';
import type { PublicPlacePin } from '../src/public/places-discovery';

const pin: PublicPlacePin = {
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
};

describe('PlaceResultList desktop selected overlay', () => {
  it('hides the covered desktop result list when a Place is selected', () => {
    const { rerender } = render(
      <PlaceResultList
        pins={[pin]}
        selectedPlace="example-coffee-tokyo"
        scrollOffset={0}
        onScrollOffsetChange={vi.fn()}
        onSelectPlace={vi.fn()}
        onClearFilters={vi.fn()}
      />,
    );

    const results = screen.getByRole('region', { name: 'Public results' });
    expect(results).toHaveClass('lg:invisible');

    rerender(
      <PlaceResultList
        pins={[pin]}
        selectedPlace={null}
        scrollOffset={0}
        onScrollOffsetChange={vi.fn()}
        onSelectPlace={vi.fn()}
        onClearFilters={vi.fn()}
      />,
    );

    expect(results).not.toHaveClass('lg:invisible');
  });
});
