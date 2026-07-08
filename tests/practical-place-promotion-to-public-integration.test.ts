import { describe, expect, it } from 'vitest';
import {
  createCandidatePromotionService,
  type CandidatePromotionCommand,
  type CandidatePromotionInput,
} from '../src/admin/promotion/candidate-promotion';
import { InMemoryCandidatePromotionBackend } from '../src/admin/promotion/in-memory-candidate-promotion-backend';
import {
  expandPromotionProvenanceAssignments,
  type PromotionProvenanceAssignment,
} from '../src/admin/promotion/provenance-plan';
import { validatePublicArtifact } from '../src/publication/export-boundary';
import { projectCanonicalPlace } from '../src/publication/place-projection';
import { buildPublicPlaceProvenance } from '../src/publication/place-provenance';

const ids = {
  request: '10000000-0000-4000-8000-000000000001',
  candidate: '20000000-0000-4000-8000-000000000001',
  entity: '30000000-0000-4000-8000-000000000001',
  location: '40000000-0000-4000-8000-000000000001',
  claim: '50000000-0000-4000-8000-000000000001',
  claimAsset: '60000000-0000-4000-8000-000000000001',
  source: '70000000-0000-4000-8000-000000000001',
  asset: '80000000-0000-4000-8000-000000000001',
  network: '90000000-0000-4000-8000-000000000001',
  method: 'a0000000-0000-4000-8000-000000000001',
} as const;

const reviewedAt = '2026-07-07T00:00:00.000Z';
const promotedAt = '2026-07-08T00:00:00.000Z';

function assignment(
  subjectType: PromotionProvenanceAssignment['subjectType'],
  subjectId: string,
  fieldPath: string,
): PromotionProvenanceAssignment {
  return {
    subjectType,
    subjectId,
    fieldPath,
    sourceRecordIds: [ids.source],
    provenanceRole: 'origin',
  };
}

function promotionInput(): CandidatePromotionInput {
  return {
    candidateId: ids.candidate,
    expectedCandidateType: 'physical_place',
    expectedCandidateUpdatedAt: reviewedAt,
    promotedAt,
    entity: {
      id: ids.entity,
      value: {
        entityType: 'merchant',
        name: 'Reviewed Cafe',
        slug: null,
        legalName: null,
        websiteUrl: null,
        countryCode: null,
        entityStatus: 'active',
        visibility: 'hidden',
      },
    },
    location: {
      id: ids.location,
      value: {
        name: 'Reviewed Cafe Tokyo',
        slug: 'reviewed-cafe-tokyo',
        addressLine: null,
        locality: 'Tokyo',
        region: null,
        postalCode: null,
        countryCode: 'JP',
        latitude: 35.681236,
        longitude: 139.767125,
        locationStatus: 'active',
        visibility: 'hidden',
        websiteUrl: null,
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
      },
    },
    claim: {
      id: ids.claim,
      value: {
        entityId: ids.entity,
        locationId: ids.location,
        claimScope: 'location_specific',
        routeType: 'direct_wallet',
        acceptanceScope: 'all_checkout',
        claimStatus: 'candidate',
        visibility: 'hidden',
        customerPaysCrypto: true,
        merchantExplicitlyAcceptsCrypto: true,
        processorId: null,
        howToPay: 'Ask staff for the payment request and scan the displayed QR code.',
        instructionsLanguage: 'en',
        merchantReceives: 'crypto',
        restrictions: null,
        firstConfirmedAt: null,
        lastConfirmedAt: null,
        nextReviewAt: null,
        endedAt: null,
        endedReason: null,
      },
    },
    claimAssets: [
      {
        id: ids.claimAsset,
        value: {
          claimId: ids.claim,
          assetId: ids.asset,
          networkId: ids.network,
          paymentMethodId: ids.method,
          contractAddress: null,
          isPrimary: true,
          notes: null,
        },
      },
    ],
    sourceRecordIds: [ids.source],
    provenanceAssignments: [
      assignment('entity', ids.entity, 'name'),
      ...[
        'name',
        'locality',
        'countryCode',
        'latitude',
        'longitude',
        'phone',
        'description',
        'openingHours',
        'amenities',
        'socialLinks',
      ].map((field) => assignment('location', ids.location, field)),
      ...[
        'routeType',
        'acceptanceScope',
        'customerPaysCrypto',
        'merchantExplicitlyAcceptsCrypto',
        'howToPay',
        'merchantReceives',
      ].map((field) => assignment('acceptance_claim', ids.claim, field)),
      ...['assetId', 'networkId', 'paymentMethodId'].map((field) =>
        assignment('claim_asset', ids.claimAsset, field),
      ),
    ],
  };
}

function promotionBackend() {
  return new InMemoryCandidatePromotionBackend({
    candidates: [
      {
        id: ids.candidate,
        candidateType: 'physical_place',
        candidateStatus: 'triaged',
        updatedAt: reviewedAt,
        canonicalEntityId: null,
        canonicalLocationId: null,
        sourceRecordIds: [ids.source],
      },
    ],
    legacyMappings: [
      {
        id: 'b0000000-0000-4000-8000-000000000001',
        sourceSystem: 'cryptopaymap_v2',
        sourceRecordId: ids.source,
        migrationStatus: 'pending',
        canonicalPath: null,
        entityId: null,
        locationId: null,
        resolvedAt: null,
      },
    ],
    assetIds: [ids.asset],
    networkIds: [ids.network],
    paymentMethodIds: [ids.method],
  });
}

const confirmedClaims = [
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
    firstConfirmedAt: '2026-07-08T00:00:00Z',
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

describe('practical Place Promotion to public projection integration', () => {
  it('preserves reviewed values, blocks hidden canonical projection, and validates the explicit public projection', async () => {
    const store = promotionBackend();
    let committedCommand: CandidatePromotionCommand | null = null;
    const service = createCandidatePromotionService({
      commitPromotion: async (command) => {
        committedCommand = command;
        return store.commitPromotion(command);
      },
    });

    await expect(
      service.promote(
        {
          requestId: ids.request,
          actorId: 'canonical-reviewer',
          actorType: 'human',
          capabilities: ['candidate:promote'],
        },
        promotionInput(),
      ),
    ).resolves.toMatchObject({ state: 'committed', visibility: 'hidden' });

    const snapshot = store.snapshot();
    const entity = snapshot.entities[0]?.value;
    const location = snapshot.locations[0]?.value;
    if (!entity || !location || !committedCommand) {
      throw new Error('Expected committed practical Place canonical snapshot.');
    }

    expect(() =>
      projectCanonicalPlace({
        entitySlug: 'reviewed-cafe',
        categorySlug: 'cafe',
        entity,
        location,
        claims: confirmedClaims,
        media: [],
        provenance: [
          {
            sourceName: 'Reviewed Cafe official profile',
            sourceUrl: 'https://example.test/tokyo',
            licenseSlug: null,
            attribution: null,
            fields: ['name'],
          },
        ],
      }),
    ).toThrow('Only canonical Entity and Location records explicitly marked public can be projected.');

    const provenanceRows = expandPromotionProvenanceAssignments(
      committedCommand.provenanceAssignments,
      committedCommand.promotedAt,
    );
    const provenance = buildPublicPlaceProvenance({
      entityId: ids.entity,
      locationId: ids.location,
      sourceRecords: [
        {
          sourceRecordId: ids.source,
          sourceName: 'Reviewed Cafe official profile',
          sourceUrl: 'https://example.test/tokyo',
          licenseSlug: null,
          attribution: null,
        },
      ],
      rows: provenanceRows,
    });

    const projected = projectCanonicalPlace({
      entitySlug: 'reviewed-cafe',
      categorySlug: 'cafe',
      entity: { ...entity, visibility: 'public' },
      location: { ...location, visibility: 'public' },
      claims: confirmedClaims,
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
    expect(projected.provenance[0]?.fields).toEqual(
      expect.arrayContaining(['description', 'openingHours', 'amenities', 'socialLinks']),
    );
    expect(projected).not.toHaveProperty('candidateId');
    expect(projected).not.toHaveProperty('sourceRecordIds');

    expect(
      validatePublicArtifact('/data/places.json', {
        schemaVersion: '1.0.0',
        generatedAt: '2026-07-08T00:00:00Z',
        records: [projected],
      }),
    ).toBeDefined();
  });
});
