import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobilePlaceSheet } from '../src/components/places/MobilePlaceSheet';
import type { PublicPlace } from '../src/public/place-detail';
import type { PublicPlacePin } from '../src/public/places-discovery';
import type { BottomSheetState } from '../src/state/discovery-store';

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

const detail: PublicPlace = {
  placeSlug: 'example-coffee-tokyo',
  entitySlug: 'example-coffee',
  name: 'Example Coffee',
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
  websiteUrl: 'https://example.com',
  phone: '+81-3-0000-0000',
  description: 'Independent coffee shop with counter and table seating.',
  openingHours: 'Mon–Fri 08:00–18:00',
  amenities: ['wifi', 'outdoor-seating'],
  socialLinks: [
    {
      platform: 'instagram',
      url: 'https://www.instagram.com/examplecoffee',
      handle: '@examplecoffee',
    },
  ],
  claims: [
    {
      claimKey: 'example-coffee-lightning',
      entitySlug: 'example-coffee',
      locationSlug: 'example-coffee-tokyo',
      claimScope: 'location_specific',
      acceptanceScope: 'all_checkout',
      status: 'confirmed',
      routeType: 'direct_wallet',
      processorSlug: null,
      howToPay: 'Ask staff to display a Lightning invoice and scan the QR code.',
      instructionsLanguage: 'en',
      merchantReceives: 'crypto',
      restrictions: 'Minimum purchase ¥500.',
      firstConfirmedAt: '2026-06-01T00:00:00Z',
      lastConfirmedAt: '2026-06-20T00:00:00Z',
      nextReviewAt: '2026-12-17T00:00:00Z',
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
      evidence: [
        {
          kind: 'official_payment_page',
          evidenceClass: 'a',
          sourceType: 'official_page',
          polarity: 'supporting',
          sourceName: 'Example Coffee',
          sourceUrl: 'https://example.com/payments',
          archiveUrl: null,
          observedAt: '2026-06-20T00:00:00Z',
          publishedAt: null,
          summary: 'The official payment page documents Lightning checkout.',
        },
      ],
    },
  ],
  media: [
    {
      role: 'cover',
      url: 'https://media.example.com/exterior.webp',
      mimeType: 'image/webp',
      width: 1200,
      height: 800,
      altText: 'Exterior of Example Coffee.',
      attribution: null,
      licenseSlug: null,
    },
    {
      role: 'interior',
      url: 'https://media.example.com/interior.webp',
      mimeType: 'image/webp',
      width: 1200,
      height: 800,
      altText: 'Interior seating at Example Coffee.',
      attribution: null,
      licenseSlug: null,
    },
  ],
  provenance: [
    {
      sourceName: 'Example Coffee',
      sourceUrl: 'https://example.com',
      licenseSlug: null,
      attribution: null,
      fields: ['addressLine', 'phone', 'description', 'openingHours', 'amenities', 'socialLinks'],
    },
  ],
};

let pendingFrame: FrameRequestCallback | null = null;

beforeEach(() => {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    pendingFrame = callback;
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
});

afterEach(() => {
  pendingFrame = null;
  vi.restoreAllMocks();
});

function settleEntry() {
  const callback = pendingFrame;
  pendingFrame = null;
  if (!callback) throw new Error('Expected a pending sheet entry frame.');
  act(() => callback(0));
}

function SheetHarness({ withDetail = false }: { withDetail?: boolean }) {
  const [state, setState] = useState<BottomSheetState>('peek');
  return (
    <MobilePlaceSheet
      place={pin}
      detail={withDetail ? detail : null}
      state={state}
      onStateChange={setState}
    />
  );
}

function swipe(handle: HTMLElement, startY: number, endY: number) {
  fireEvent.touchStart(handle, { touches: [{ clientY: startY }] });
  fireEvent.touchMove(handle, { touches: [{ clientY: endY }] });
  fireEvent.touchEnd(handle);
}

describe('MobilePlaceSheet gestures', () => {
  it('starts below the viewport and settles into peek for the selected Place', () => {
    render(<SheetHarness />);
    const sheet = screen.getByRole('region', { name: 'Selected place: Example Coffee' });

    expect(sheet).toHaveAttribute('data-sheet-entered', 'false');
    expect(sheet.style.transform).toBe('translateY(88dvh)');

    settleEntry();

    expect(sheet).toHaveAttribute('data-sheet-entered', 'true');
    expect(sheet.style.transform).toContain('53dvh');
  });

  it('keeps peek compact while showing identity, category, location, assets, and freshness', () => {
    render(<SheetHarness />);
    const sheet = screen.getByRole('region', { name: 'Selected place: Example Coffee' });

    expect(sheet).toHaveAttribute('data-sheet-state', 'peek');
    expect(screen.getByText('Cafe · Tokyo, JP')).toBeInTheDocument();
    expect(screen.getByText('Bitcoin')).toBeInTheDocument();
    expect(screen.getByText(/Last confirmed Jun 20, 2026/)).toBeInTheDocument();
    expect(screen.queryByText('Networks')).not.toBeInTheDocument();
  });

  it('follows bounded touch movement before settling to expanded or peek', () => {
    render(<SheetHarness />);
    settleEntry();

    const sheet = screen.getByRole('region', { name: 'Selected place: Example Coffee' });
    const expandHandle = screen.getByRole('button', { name: 'Expand place details' });
    expect(sheet).toHaveAttribute('data-sheet-state', 'peek');

    fireEvent.touchStart(expandHandle, { touches: [{ clientY: 320 }] });
    fireEvent.touchMove(expandHandle, { touches: [{ clientY: 220 }] });
    expect(sheet).toHaveAttribute('data-sheet-dragging', 'true');
    expect(sheet.style.transform).toContain('-100px');

    fireEvent.touchEnd(expandHandle);
    expect(sheet).toHaveAttribute('data-sheet-state', 'expanded');
    expect(sheet).toHaveAttribute('data-sheet-dragging', 'false');

    const collapseHandle = screen.getByRole('button', { name: 'Collapse place details' });
    fireEvent.touchStart(collapseHandle, { touches: [{ clientY: 220 }] });
    fireEvent.touchMove(collapseHandle, { touches: [{ clientY: 320 }] });
    expect(sheet.style.transform).toContain('100px');
    fireEvent.touchEnd(collapseHandle);
    expect(sheet).toHaveAttribute('data-sheet-state', 'peek');
  });

  it('does not close peek on a downward swipe', () => {
    render(<SheetHarness />);
    settleEntry();
    const sheet = screen.getByRole('region', { name: 'Selected place: Example Coffee' });
    const peekHandle = screen.getByRole('button', { name: 'Expand place details' });

    swipe(peekHandle, 220, 320);
    expect(sheet).toHaveAttribute('data-sheet-state', 'peek');
    expect(sheet).toBeInTheDocument();
  });

  it('shows practical information, complete payment context, gallery, and navigation in expanded state', () => {
    render(<SheetHarness withDetail />);
    settleEntry();
    fireEvent.click(screen.getByRole('button', { name: 'Expand place details' }));

    expect(screen.getByText(/1 Example Street, Tokyo/)).toBeInTheDocument();
    expect(
      screen.getByText('Independent coffee shop with counter and table seating.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Mon–Fri 08:00–18:00')).toBeInTheDocument();
    expect(screen.getByText('Wifi')).toBeInTheDocument();
    expect(screen.getByText('Outdoor Seating')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\+81-3-0000-0000/ })).toHaveAttribute(
      'href',
      'tel:+81-3-0000-0000',
    );
    expect(screen.getByRole('link', { name: /Website/ })).toHaveAttribute(
      'href',
      'https://example.com',
    );
    expect(screen.getByRole('link', { name: /@examplecoffee/ })).toHaveAttribute(
      'href',
      'https://www.instagram.com/examplecoffee',
    );
    expect(screen.getByRole('link', { name: 'Google Maps' })).toHaveAttribute(
      'href',
      expect.stringContaining('destination=35.681236%2C139.767125'),
    );
    expect(screen.getByRole('link', { name: 'Apple Maps' })).toHaveAttribute(
      'href',
      expect.stringContaining('daddr=35.681236%2C139.767125'),
    );
    expect(
      screen.getByRole('button', { name: /Enlarge image 1 of 2: Exterior of Example Coffee/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Enlarge image 2 of 2: Interior seating/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Lightning Invoice')).toBeInTheDocument();
    expect(screen.getByText('Minimum purchase ¥500.')).toBeInTheDocument();
  });
});
