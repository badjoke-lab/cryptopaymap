import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockReset();
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
});

afterEach(cleanup);

describe('PlaceResultList', () => {
  it('renders public payment summary and freshness for every result', () => {
    render(
      <PlaceResultList
        pins={pins}
        selectedPlace={null}
        scrollOffset={0}
        onScrollOffsetChange={vi.fn()}
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
        scrollOffset={0}
        onScrollOffsetChange={vi.fn()}
        onSelectPlace={onSelectPlace}
        onClearFilters={vi.fn()}
      />,
    );

    const selectedButton = screen.getByRole('button', { name: 'Select Example Coffee on map' });
    expect(selectedButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('link', { name: 'Payment details' })[0]).toHaveAttribute(
      'href',
      '/place/example-coffee-tokyo',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select Example Market on map' }));
    expect(onSelectPlace).toHaveBeenCalledWith('example-market-osaka');
  });

  it('keeps the selected card visible when map selection changes', () => {
    const { rerender } = render(
      <PlaceResultList
        pins={pins}
        selectedPlace={null}
        scrollOffset={0}
        onScrollOffsetChange={vi.fn()}
        onSelectPlace={vi.fn()}
        onClearFilters={vi.fn()}
      />,
    );

    rerender(
      <PlaceResultList
        pins={pins}
        selectedPlace="example-market-osaka"
        scrollOffset={0}
        onScrollOffsetChange={vi.fn()}
        onSelectPlace={vi.fn()}
        onClearFilters={vi.fn()}
      />,
    );

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' });
  });

  it('restores and reports the result-list scroll offset', () => {
    const onScrollOffsetChange = vi.fn();
    render(
      <PlaceResultList
        pins={pins}
        selectedPlace={null}
        scrollOffset={240}
        onScrollOffsetChange={onScrollOffsetChange}
        onSelectPlace={vi.fn()}
        onClearFilters={vi.fn()}
      />,
    );

    const list = screen.getByRole('list', { name: 'Place results' });
    expect(list.scrollTop).toBe(240);

    list.scrollTop = 360;
    fireEvent.scroll(list);
    expect(onScrollOffsetChange).toHaveBeenCalledWith(360);
  });

  it('preserves the Candidate-free empty state and actions', () => {
    const onClearFilters = vi.fn();
    render(
      <PlaceResultList
        pins={[]}
        selectedPlace={null}
        scrollOffset={0}
        onScrollOffsetChange={vi.fn()}
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
