import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

beforeEach(() => {
  window.history.replaceState({}, '', '/places');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('PlacesApp shell', () => {
  it('renders reviewed public results and coordinates selection with the URL', async () => {
    render(<PlacesApp pins={pins} />);

    expect(await screen.findByText('Example Coffee')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Select Example Coffee on map/ }));

    expect(screen.getByText('Selected place')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View payment details' })).toHaveAttribute(
      'href',
      '/place/example-coffee-tokyo',
    );
    await waitFor(() => expect(window.location.search).toContain('place=example-coffee-tokyo'));
  });

  it('filters public results with URL-owned facets and clears hidden selection', async () => {
    render(<PlacesApp pins={pins} />);

    fireEvent.click(screen.getByRole('button', { name: /Select Example Coffee on map/ }));
    await waitFor(() => expect(window.location.search).toContain('place=example-coffee-tokyo'));

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByRole('button', { name: 'Bitcoin (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usdc (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stale (1)' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stale (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Usdc (1)' }));

    expect(await screen.findByText('Example Market')).toBeInTheDocument();
    expect(screen.queryByText('Example Coffee')).not.toBeInTheDocument();
    expect(screen.queryByText('Selected place')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.search).toContain('asset=usdc');
      expect(window.location.search).toContain('status=confirmed%2Cstale');
      expect(window.location.search).not.toContain('place=');
    });
  });

  it('replaces search typing but pushes explicit discovery selection', async () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    render(<PlacesApp pins={pins} />);

    const search = screen.getByRole('searchbox', { name: 'Search places' });
    fireEvent.change(search, { target: { value: 'coffee' } });
    await waitFor(() => expect(window.location.search).toContain('q=coffee'));
    expect(pushState).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Select Example Coffee on map/ }));
    await waitFor(() => expect(window.location.search).toContain('place=example-coffee-tokyo'));
    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it('restores URL and UI state from popstate without adding a history entry', async () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    render(<PlacesApp pins={pins} />);
    await screen.findByText('Example Coffee');

    const restoredState = {
      cpmDiscovery: {
        bottomSheet: 'peek',
        listScrollOffset: 180,
        filterPanelOpen: true,
        activeBounds: null,
      },
    };
    window.history.replaceState(
      restoredState,
      '',
      '/places?q=coffee&place=example-coffee-tokyo&view=list',
    );
    window.dispatchEvent(new PopStateEvent('popstate', { state: restoredState }));

    await waitFor(() =>
      expect(screen.getByRole('searchbox', { name: 'Search places' })).toHaveValue('coffee'),
    );
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Selected place')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bitcoin (1)' })).toBeInTheDocument();
    expect(pushState).not.toHaveBeenCalled();
  });

  it('never substitutes private candidates when public filters return no results', async () => {
    render(<PlacesApp pins={pins} />);

    const search = screen.getByRole('searchbox', { name: 'Search places' });
    fireEvent.change(search, { target: { value: 'missing place' } });

    expect(await screen.findByText('No public places match')).toBeInTheDocument();
    expect(screen.getByText(/Candidate records are not used as substitutes/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('Example Coffee')).toBeInTheDocument();
  });

  it('restores public URL state on initial client load', async () => {
    window.history.replaceState({}, '', '/places?q=coffee&view=list');
    render(<PlacesApp pins={pins} />);

    await waitFor(() =>
      expect(screen.getByRole('searchbox', { name: 'Search places' })).toHaveValue('coffee'),
    );
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
  });
});
