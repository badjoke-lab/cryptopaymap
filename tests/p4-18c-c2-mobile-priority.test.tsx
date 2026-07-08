import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobilePlaceSheet } from '../src/components/places/MobilePlaceSheet';
import { PlaceFilterPanel } from '../src/components/places/PlaceFilterPanel';
import type { PublicPlace } from '../src/public/place-detail';
import type { PublicPlaceFilterFacets, PublicPlacePin } from '../src/public/places-discovery';
import type { DiscoveryUrlState } from '../src/state/discovery-url';

const pin: PublicPlacePin = {
  placeSlug: 'payment-first-cafe',
  name: 'Payment First Cafe',
  categorySlug: 'cafe',
  countryCode: 'JP',
  locality: 'Tokyo',
  latitude: 35.681236,
  longitude: 139.767125,
  status: 'confirmed',
  assetSlugs: ['bitcoin'],
  networkSlugs: ['lightning'],
  routeTypes: ['direct_wallet'],
  lastConfirmedAt: '2026-07-01T00:00:00Z',
  thumbnail: null,
};

const detail: PublicPlace = {
  placeSlug: 'payment-first-cafe',
  entitySlug: 'payment-first-cafe',
  name: 'Payment First Cafe',
  categorySlug: 'cafe',
  entityStatus: 'active',
  locationStatus: 'active',
  addressLine: '1 Example Street',
  locality: 'Tokyo',
  region: 'Tokyo',
  postalCode: '100-0001',
  countryCode: 'JP',
  latitude: 35.681236,
  longitude: 139.767125,
  websiteUrl: 'https://example.test',
  phone: '+81 3 0000 0000',
  description: 'Long practical profile content that must follow payment information.',
  openingHours: 'Mon-Fri 08:00-18:00',
  amenities: ['wifi'],
  socialLinks: [],
  claims: [
    {
      claimKey: 'payment-first-lightning',
      entitySlug: 'payment-first-cafe',
      locationSlug: 'payment-first-cafe',
      claimScope: 'location_specific',
      acceptanceScope: 'all_checkout',
      status: 'confirmed',
      routeType: 'direct_wallet',
      processorSlug: null,
      howToPay: 'Ask staff for a Lightning invoice and scan the QR code.',
      instructionsLanguage: 'en',
      merchantReceives: 'crypto',
      restrictions: null,
      firstConfirmedAt: '2026-06-01T00:00:00Z',
      lastConfirmedAt: '2026-07-01T00:00:00Z',
      nextReviewAt: '2026-10-01T00:00:00Z',
      endedAt: null,
      endedReason: null,
      paymentAssets: [
        {
          assetSlug: 'bitcoin',
          assetSymbol: 'BTC',
          networkSlug: 'lightning',
          paymentMethod: 'lightning_invoice',
          contractAddress: null,
          isPrimary: true,
          notes: null,
        },
      ],
      evidence: [],
    },
  ],
  media: [],
  provenance: [],
};

const facets: PublicPlaceFilterFacets = {
  assets: [{ value: 'bitcoin', count: 3 }],
  networks: [{ value: 'lightning', count: 3 }],
  categories: [{ value: 'cafe', count: 3 }],
  routes: [{ value: 'direct_wallet', count: 3 }],
  statuses: [
    { value: 'confirmed', count: 3 },
    { value: 'stale', count: 1 },
  ],
};

const state: DiscoveryUrlState = {
  query: '',
  assets: [],
  networks: [],
  categories: [],
  routes: [],
  statuses: ['confirmed'],
  view: 'map',
  selectedPlace: null,
  bottomSheet: 'closed',
  lat: null,
  lng: null,
  zoom: null,
};

beforeEach(() => {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('P4-18C C2 mobile payment and filter completion contracts', () => {
  it('places payment information before long practical-profile content in the expanded sheet', () => {
    render(
      <MobilePlaceSheet place={pin} detail={detail} state="expanded" onStateChange={vi.fn()} />,
    );

    const navigate = screen.getByRole('region', { name: 'Navigate' });
    const payment = screen.getByRole('region', { name: 'Payment information' });
    const about = screen.getByRole('region', { name: 'About this place' });

    expect(
      navigate.compareDocumentPosition(payment) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(payment.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      screen.getByText('Ask staff for a Lightning invoice and scan the QR code.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Lightning Invoice')).toBeInTheDocument();
  });

  it('provides an explicit mobile completion action with the live result count', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <PlaceFilterPanel
        facets={facets}
        state={state}
        resultCount={3}
        onPatch={vi.fn()}
        onClear={vi.fn()}
        onWidenArea={vi.fn()}
        onClose={onClose}
      />,
    );

    const completion = screen.getByRole('button', { name: 'Show 3 places' });
    await user.click(completion);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps zero-result Clear, Widen area, and Include Stale recovery actions', async () => {
    const onClear = vi.fn();
    const onWidenArea = vi.fn();
    const onPatch = vi.fn();
    const user = userEvent.setup();
    render(
      <PlaceFilterPanel
        facets={facets}
        state={state}
        resultCount={0}
        onPatch={onPatch}
        onClear={onClear}
        onWidenArea={onWidenArea}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await user.click(screen.getByRole('button', { name: 'Widen area' }));
    await user.click(screen.getByRole('button', { name: 'Include Stale' }));

    expect(onClear).toHaveBeenCalledOnce();
    expect(onWidenArea).toHaveBeenCalledOnce();
    expect(onPatch).toHaveBeenCalledWith({
      statuses: ['confirmed', 'stale'],
      selectedPlace: null,
    });
    expect(screen.getByRole('button', { name: 'Show 0 places' })).toBeInTheDocument();
  });
});
