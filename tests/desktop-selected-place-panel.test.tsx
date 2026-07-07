import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesktopSelectedPlacePanel } from '../src/components/places/DesktopSelectedPlacePanel';
import type { PublicPlace } from '../src/public/place-detail';
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

const place: PublicPlace = {
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

describe('DesktopSelectedPlacePanel', () => {
  it('shows practical Place information, complete payment context, gallery, and navigation', () => {
    render(<DesktopSelectedPlacePanel pin={pin} place={place} onClear={vi.fn()} />);

    const panel = screen.getByRole('complementary', {
      name: 'Selected place details: Example Coffee',
    });
    const queries = within(panel);

    expect(queries.getByText(/1 Example Street, Tokyo/)).toBeInTheDocument();
    expect(
      queries.getByText('Independent coffee shop with counter and table seating.'),
    ).toBeInTheDocument();
    expect(queries.getByText('Mon–Fri 08:00–18:00')).toBeInTheDocument();
    expect(queries.getByText('Wifi')).toBeInTheDocument();
    expect(queries.getByText('Outdoor Seating')).toBeInTheDocument();
    expect(queries.getByRole('link', { name: /\+81-3-0000-0000/ })).toHaveAttribute(
      'href',
      'tel:+81-3-0000-0000',
    );
    expect(queries.getByRole('link', { name: /Website/ })).toHaveAttribute(
      'href',
      'https://example.com',
    );
    expect(queries.getByRole('link', { name: /@examplecoffee/ })).toHaveAttribute(
      'href',
      'https://www.instagram.com/examplecoffee',
    );
    expect(queries.getByRole('link', { name: 'Google Maps' })).toHaveAttribute(
      'href',
      expect.stringContaining('destination=35.681236%2C139.767125'),
    );
    expect(queries.getByRole('link', { name: 'Apple Maps' })).toHaveAttribute(
      'href',
      expect.stringContaining('daddr=35.681236%2C139.767125'),
    );
    expect(
      queries.getByRole('button', { name: /Enlarge image 1 of 2: Exterior of Example Coffee/ }),
    ).toBeInTheDocument();
    expect(
      queries.getByRole('button', { name: /Enlarge image 2 of 2: Interior seating/ }),
    ).toBeInTheDocument();
    expect(queries.getByText('Lightning Invoice')).toBeInTheDocument();
    expect(queries.getByText('Minimum purchase ¥500.')).toBeInTheDocument();
    expect(queries.getByText(/Ask staff to display a Lightning invoice/)).toBeInTheDocument();
    expect(queries.getByRole('link', { name: 'Payment details' })).toHaveAttribute(
      'href',
      '/place/example-coffee-tokyo',
    );
  });
});
