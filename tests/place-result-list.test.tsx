import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaceResultList } from '../src/components/places/PlaceResultList';
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
  {
    placeSlug: 'example-market-osaka',
    name: 'Example Market',
    categorySlug: 'grocery',
    countryCode: 'JP',
    locality: 'Osaka',
    latitude: 34.6937,
    longitude: 135.5023,
    status: 'stale',
    assetSlugs: ['usdc'],
    networkSlugs: ['base'],
    routeTypes: ['processor_checkout'],
    lastConfirmedAt: '2026-01-15T00:00:00Z',
    thumbnail: null,
  },
];

afterEach(cleanup);

describe('PlaceResultList', () => {
  it('renders public payment summary and freshness for every result', () => {
    render(
      <PlaceResultList
        pins={pins}
        selectedPlace={null}
        onSelectPlace={vi.fn()}
        onClearFilters={vi.fn()}
      />,
    );

    expect(screen.getByText('2 results')).toBeInTheDocument();
    expect(screen.getByText('Example Coffee')).toBeInTheDocument();
    expect(screen.getByText('Example Market')).toBeInTheDocument();
    expect(screen.getByText('Bitcoin')).toBeInTheDocument();
    expect(screen.getByText('Lightning')).toBeInTheDocument();
    expect(screen.getByText('Direct Wallet')).toBeInTheDocument();
    expect(screen.getByText('Jun 20, 2026')).toBeInTheDocument();
    expect(screen.getByText('Stale')).toBeInTheDocument();
  });

  it('separates map selection from detail navigation', () => {
    const onSelectPlace = vi.fn();
    render(
      <PlaceResultList
        pins={pins}
        selectedPlace="example-coffee-tokyo"
        onSelectPlace={onSelectPlace}
        onClearFilters={vi.fn()}
      />,
    );

    const selectedButton = screen.getByRole('button', { name: 'Select Example Coffee on map' });
    expect(selectedButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: 'Payment details', exact: true })).toHaveAttribute(
      'href',
      '/place/example-coffee-tokyo',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select Example Market on map' }));
    expect(onSelectPlace).toHaveBeenCalledWith('example-market-osaka');
  });

  it('preserves the Candidate-free empty state and actions', () => {
    const onClearFilters = vi.fn();
    render(
      <PlaceResultList
        pins={[]}
        selectedPlace={null}
        onSelectPlace={vi.fn()}
        onClearFilters={onClearFilters}
      />,
    );

    expect(screen.getByText('No public places match')).toBeInTheDocument();
    expect(screen.getByText(/Candidate records are not used as substitutes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Suggest a place' })).toHaveAttribute(
      'href',
      '/suggest',
    );
  });
});
