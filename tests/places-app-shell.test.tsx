import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

beforeEach(() => {
  window.history.replaceState({}, '', '/places');
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('PlacesApp shell', () => {
  it('renders reviewed public results and coordinates selection with the URL', async () => {
    render(<PlacesApp pins={pins} />);

    expect(await screen.findByText('Example Coffee')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Example Coffee/ }));

    expect(screen.getByText('Selected place')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View payment details' })).toHaveAttribute(
      'href',
      '/place/example-coffee-tokyo',
    );
    await waitFor(() => expect(window.location.search).toContain('place=example-coffee-tokyo'));
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
