import { describe, expect, it } from 'vitest';
import { projectCanonicalPlace } from '../src/publication/place-projection';
import { validatePublicArtifact } from '../src/publication/export-boundary';
import type { CanonicalEntityInput, CanonicalLocationInput } from '../src/schemas/canonical-identity';

const generatedAt = '2026-07-08T00:00:00Z';

function entity(visibility: CanonicalEntityInput['visibility'] = 'public'): CanonicalEntityInput {
  return {
    entityType: 'merchant',
    name: 'Reviewed Cafe',
    slug: 'reviewed-cafe',
    legalName: null,
    websiteUrl: 'https://example.test',
    countryCode: 'JP',
    entityStatus: 'active',
    visibility,
  };
}

function location(visibility: CanonicalLocationInput['visibility'] = 'public'): CanonicalLocationInput {
  return {
    name: 'Reviewed Cafe Tokyo',
    slug: 'reviewed-cafe-tokyo',
    addressLine: '1-1 Example',
    locality: 'Tokyo',
    region: 'Tokyo',
    postalCode: '100-0001',
    countryCode: 'JP',
    latitude: 35.681236,
    longitude: 139.767125,
    locationStatus: 'active',
    visibility,
    websiteUrl: 'https://example.test/tokyo',
    phone: '+81 3 0000 0000',
    description: 'Reviewed public description.',
    openingHours: 'Mon-Fri 08:00-18:00',
    amenities: ['wifi', 'outdoor-seating'],
    socialLinks: [
      {
        platform: 'instagram',
        url: 'https://social.example.test/reviewed-cafe',
        handle: '@reviewedcafe',
      },
    ],
    osmType: null,
    osmId: null,
  };
}

const claims = [
  {
    claimKey: 'reviewed-cafe-tokyo-btc',
    entitySlug: 'reviewed-cafe',
    locationSlug: 'reviewed-cafe-tokyo',
    claimScope: 'location_specific' as const,
    acceptanceScope: 'all_checkout' as const,
    status: 'confirmed' as const,
    routeType: 'direct_wallet' as const,
    processorSlug: null,
    howToPay: 'Ask staff for the payment request and scan the displayed QR code.',
    instructionsLanguage: 'en',
    merchantReceives: 'crypto' as const,
    restrictions: null,
    firstConfirmedAt: '2026-07-01T00:00:00Z',
    lastConfirmedAt: '2026-07-08T00:00:00Z',
    nextReviewAt: '2026-10-08T00:00:00Z',
    endedAt: null,
    endedReason: null,
    paymentAssets: [
      {
        assetSlug: 'bitcoin',
        assetSymbol: 'BTC',
        networkSlug: 'lightning',
        paymentMethod: 'lightning_invoice' as const,
        contractAddress: null,
        isPrimary: true,
        notes: null,
      },
    ],
    evidence: [
      {
        kind: 'official_payment_page' as const,
        evidenceClass: 'a' as const,
        sourceType: 'official_page' as const,
        polarity: 'supporting' as const,
        sourceName: 'Reviewed Cafe',
        sourceUrl: 'https://example.test/payments',
        archiveUrl: null,
        observedAt: '2026-07-08T00:00:00Z',
        publishedAt: null,
        summary: 'The official payment page documents the accepted payment route.',
      },
    ],
  },
];

const provenance = [
  {
    sourceName: 'Reviewed Cafe official profile',
    sourceUrl: 'https://example.test/tokyo',
    licenseSlug: null,
    attribution: null,
    fields: [
      'name',
      'addressLine',
      'phone',
      'description',
      'openingHours',
      'amenities',
      'socialLinks',
    ],
  },
];

describe('canonical Place public projection', () => {
  it('projects practical profile fields through the strict public export boundary', () => {
    const projected = projectCanonicalPlace({
      entitySlug: 'reviewed-cafe',
      categorySlug: 'cafe',
      entity: entity(),
      location: location(),
      claims,
      media: [],
      provenance,
    });

    expect(projected).toMatchObject({
      placeSlug: 'reviewed-cafe-tokyo',
      phone: '+81 3 0000 0000',
      description: 'Reviewed public description.',
      openingHours: 'Mon-Fri 08:00-18:00',
      amenities: ['wifi', 'outdoor-seating'],
      socialLinks: [
        {
          platform: 'instagram',
          url: 'https://social.example.test/reviewed-cafe',
          handle: '@reviewedcafe',
        },
      ],
    });

    expect(
      validatePublicArtifact('/data/places.json', {
        schemaVersion: '1.0.0',
        generatedAt,
        records: [projected],
      }),
    ).toBeDefined();
  });

  it('selects only allowlisted fields from canonical inputs', () => {
    const canonicalLocation = {
      ...location(),
      internalNote: 'must never be projected',
      privatePayload: { contact: 'private@example.test' },
    } as CanonicalLocationInput & {
      internalNote: string;
      privatePayload: { contact: string };
    };

    const projected = projectCanonicalPlace({
      entitySlug: 'reviewed-cafe',
      categorySlug: 'cafe',
      entity: entity(),
      location: canonicalLocation,
      claims,
      media: [],
      provenance,
    });

    expect(projected).not.toHaveProperty('internalNote');
    expect(projected).not.toHaveProperty('privatePayload');
  });

  it('omits unavailable optional practical fields without inventing negative facts', () => {
    const canonicalLocation = location();
    delete canonicalLocation.description;
    delete canonicalLocation.openingHours;
    delete canonicalLocation.amenities;
    delete canonicalLocation.socialLinks;

    const projected = projectCanonicalPlace({
      entitySlug: 'reviewed-cafe',
      categorySlug: 'cafe',
      entity: entity(),
      location: canonicalLocation,
      claims,
      media: [],
      provenance,
    });

    expect(projected).not.toHaveProperty('description');
    expect(projected).not.toHaveProperty('openingHours');
    expect(projected).not.toHaveProperty('amenities');
    expect(projected).not.toHaveProperty('socialLinks');
  });

  it('rejects hidden canonical records before public projection', () => {
    expect(() =>
      projectCanonicalPlace({
        entitySlug: 'reviewed-cafe',
        categorySlug: 'cafe',
        entity: entity('hidden'),
        location: location('hidden'),
        claims,
        media: [],
        provenance,
      }),
    ).toThrow('Only canonical Entity and Location records explicitly marked public can be projected.');
  });

  it('rejects malformed structured social links through canonical validation', () => {
    const malformed = {
      ...location(),
      socialLinks: [
        {
          platform: 'instagram',
          url: 'http://social.example.test/reviewed-cafe',
          handle: '@reviewedcafe',
        },
      ],
    } as CanonicalLocationInput;

    expect(() =>
      projectCanonicalPlace({
        entitySlug: 'reviewed-cafe',
        categorySlug: 'cafe',
        entity: entity(),
        location: malformed,
        claims,
        media: [],
        provenance,
      }),
    ).toThrow();
  });
});
