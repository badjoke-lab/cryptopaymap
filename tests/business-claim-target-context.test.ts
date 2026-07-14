import { describe, expect, it } from 'vitest';
import type { BusinessClaimReviewProjection } from '../src/submissions/business-claim-contract';
import {
  type BusinessClaimCanonicalTargetMaterial,
  BusinessClaimTargetContextError,
  generateBusinessClaimTargetContext,
} from '../src/submissions/business-claim-target-context';

const entityId = '10000000-0000-4000-8000-000000000001';
const locationId = '20000000-0000-4000-8000-000000000002';
const claimId = '30000000-0000-4000-8000-000000000003';
const otherClaimId = '40000000-0000-4000-8000-000000000004';
const generatedAt = new Date('2026-07-14T03:00:00.000Z');

function paymentClaim(
  id = claimId,
  overrides: Partial<BusinessClaimCanonicalTargetMaterial['claims'][number]> = {},
): BusinessClaimCanonicalTargetMaterial['claims'][number] {
  return {
    id,
    entityId,
    locationId: null,
    claimScope: 'online_service',
    routeType: 'processor_checkout',
    acceptanceScope: 'all_checkout',
    claimStatus: 'confirmed',
    visibility: 'public',
    processorName: 'Example Pay',
    howToPay: 'Choose crypto at checkout.',
    restrictions: 'New purchases only.',
    firstConfirmedAt: '2026-01-01T00:00:00.000Z',
    lastConfirmedAt: '2026-07-01T00:00:00.000Z',
    nextReviewAt: '2026-10-01T00:00:00.000Z',
    endedAt: null,
    updatedAt: '2026-07-01T00:00:00.000Z',
    options: [
      {
        assetSlug: 'usdc',
        networkSlug: 'base',
        paymentMethod: 'processor_checkout',
        isPrimary: true,
      },
    ],
    ...overrides,
  };
}

function entityMaterial(
  overrides: Partial<BusinessClaimCanonicalTargetMaterial> = {},
): BusinessClaimCanonicalTargetMaterial {
  return {
    targetType: 'entity',
    targetId: entityId,
    entity: {
      id: entityId,
      entityType: 'online_service',
      name: 'Example Hosting',
      slug: 'example-hosting',
      legalName: 'Example Hosting Incorporated',
      websiteUrl: 'https://www.hosting.example/',
      countryCode: 'US',
      entityStatus: 'active',
      visibility: 'public',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    location: null,
    claims: [paymentClaim()],
    ...overrides,
  };
}

function locationMaterial(
  overrides: Partial<BusinessClaimCanonicalTargetMaterial> = {},
): BusinessClaimCanonicalTargetMaterial {
  return {
    targetType: 'location',
    targetId: locationId,
    entity: {
      id: entityId,
      entityType: 'merchant',
      name: 'Example Cafe',
      slug: null,
      legalName: 'Example Cafe LLC',
      websiteUrl: 'https://cafe.example/',
      countryCode: 'JP',
      entityStatus: 'active',
      visibility: 'public',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    location: {
      id: locationId,
      entityId,
      name: 'Example Cafe Shibuya',
      slug: 'example-cafe-shibuya',
      addressLine: '1-2-3 Jingumae',
      locality: 'Shibuya',
      region: 'Tokyo',
      postalCode: '150-0001',
      countryCode: 'JP',
      latitude: 35.67,
      longitude: 139.7,
      locationStatus: 'active',
      visibility: 'public',
      websiteUrl: 'https://cafe.example/shibuya',
      phone: '+81-3-0000-0000',
      description: 'Coffee and light meals.',
      openingHours: 'Mo-Su 09:00-20:00',
      amenities: ['wifi', 'takeaway'],
      socialLinks: [
        {
          platform: 'instagram',
          url: 'https://instagram.com/examplecafe',
          handle: 'examplecafe',
        },
      ],
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    claims: [
      paymentClaim(claimId, {
        locationId,
        claimScope: 'location_specific',
      }),
    ],
    ...overrides,
  };
}

function entityClaim(): BusinessClaimReviewProjection {
  return {
    targetType: 'entity',
    targetId: entityId,
    claimantRole: 'owner',
    requestedScopes: ['representative_relationship', 'entity_profile', 'payment_information'],
    verification: {
      method: 'official_domain_email',
      officialDomain: 'hosting.example',
      protectedContactPresent: true,
      officialWebsiteUrl: 'https://hosting.example/account',
      officialSocialUrl: null,
      assistedVerifierReferencePresent: true,
      privateProofPresent: true,
    },
    proposedChanges: {
      entity: {
        changedFields: ['name', 'legalName', 'websiteUrl'],
        name: 'Example Hosting',
        legalName: null,
        websiteUrl: 'https://new-hosting.example/',
        countryCode: null,
      },
      location: null,
      paymentProposals: [
        {
          assetSlug: 'usdc',
          networkSlug: 'base',
          routeType: 'processor_checkout',
          paymentMethod: 'processor_checkout',
          processor: { name: 'example pay', websiteUrl: null },
          contractAddress: null,
          howToPay: 'Choose crypto at checkout.',
          restrictions: 'New purchases only.',
          isPrimary: true,
        },
      ],
    },
    authorityStatement: 'PRIVATE AUTHORITY STATEMENT VALUE',
    evidenceLinks: [
      {
        url: 'https://evidence.example/private-review-reference',
        observedAt: '2026-07-14',
        summary: 'Private reviewer Evidence summary.',
      },
    ],
  };
}

function locationClaim(): BusinessClaimReviewProjection {
  return {
    targetType: 'location',
    targetId: locationId,
    claimantRole: 'authorized_representative',
    requestedScopes: ['representative_relationship', 'location_profile'],
    verification: {
      method: 'official_social',
      officialDomain: null,
      protectedContactPresent: false,
      officialWebsiteUrl: 'https://cafe.example/other-page',
      officialSocialUrl: 'https://instagram.com/examplecafe/',
      assistedVerifierReferencePresent: false,
      privateProofPresent: false,
    },
    proposedChanges: {
      entity: null,
      location: {
        changedFields: ['name', 'websiteUrl', 'amenities', 'socialLinks'],
        name: 'Example Cafe Shibuya',
        addressLine: null,
        locality: null,
        region: null,
        postalCode: null,
        countryCode: null,
        latitude: null,
        longitude: null,
        websiteUrl: 'https://cafe.example/shibuya/',
        phone: null,
        description: null,
        openingHours: null,
        amenities: ['takeaway', 'wifi'],
        socialLinks: [
          {
            platform: 'instagram',
            url: 'https://instagram.com/examplecafe/',
            handle: 'ExampleCafe',
          },
        ],
      },
      paymentProposals: null,
    },
    authorityStatement: 'PRIVATE LOCATION AUTHORITY VALUE',
    evidenceLinks: [],
  };
}

function backend(material: BusinessClaimCanonicalTargetMaterial | null) {
  return {
    async loadTarget() {
      return material;
    },
  };
}

describe('P5-04C business Claim target context', () => {
  it('returns bounded Entity identity, field, and payment comparison signals', async () => {
    const result = await generateBusinessClaimTargetContext(
      entityClaim(),
      backend(entityMaterial()),
      generatedAt,
    );

    expect(result).toMatchObject({
      generatedAt: generatedAt.toISOString(),
      target: {
        targetType: 'entity',
        targetId: entityId,
        canonicalPath: '/service/example-hosting',
      },
      identityComparisons: {
        officialDomain: 'match',
        officialWebsite: 'match',
        officialSocial: 'not_requested',
      },
      fieldComparisons: {
        entity: [
          { field: 'name', comparison: 'same' },
          { field: 'legalName', comparison: 'clear_requested' },
          { field: 'websiteUrl', comparison: 'different' },
        ],
        location: [],
      },
      coverage: {
        targetLookupComplete: true,
        entityComparisonComplete: true,
        locationComparisonComplete: true,
        paymentContextComplete: true,
        socialComparisonComplete: true,
        absenceIsConclusive: false,
      },
    });
    expect(result.paymentClaimSignals).toEqual([
      {
        claimId,
        claimStatus: 'confirmed',
        visibility: 'public',
        reasons: [
          'target_claim_context',
          'same_route_type',
          'same_asset',
          'same_network',
          'same_payment_method',
          'same_processor_name',
          'same_how_to_pay',
          'same_restrictions',
        ],
      },
    ]);
  });

  it('compares Location practical fields and official social identity without echoing proposals', async () => {
    const result = await generateBusinessClaimTargetContext(
      locationClaim(),
      backend(locationMaterial()),
      generatedAt,
    );

    expect(result.target.canonicalPath).toBe('/place/example-cafe-shibuya');
    expect(result.identityComparisons).toEqual({
      officialDomain: 'not_requested',
      officialWebsite: 'match',
      officialSocial: 'match',
    });
    expect(result.fieldComparisons.location).toEqual([
      { field: 'name', comparison: 'same' },
      { field: 'websiteUrl', comparison: 'same' },
      { field: 'amenities', comparison: 'same' },
      { field: 'socialLinks', comparison: 'same' },
    ]);
    expect(result.paymentClaimSignals).toEqual([]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('PRIVATE LOCATION AUTHORITY VALUE');
    expect(serialized).not.toContain('private-review-reference');
    expect(serialized).not.toContain('protectedContactPresent');
    expect(serialized).not.toContain('privateProofPresent');
  });

  it('emits bounded lifecycle cautions without recommending a decision', async () => {
    const material = locationMaterial({
      entity: {
        ...locationMaterial().entity,
        entityStatus: 'ended',
        visibility: 'hidden',
      },
      location: {
        ...locationMaterial().location!,
        locationStatus: 'closed',
        visibility: 'temporarily_hidden',
      },
      claims: [
        paymentClaim(claimId, {
          locationId,
          claimScope: 'location_specific',
          claimStatus: 'stale',
        }),
        paymentClaim(otherClaimId, {
          locationId,
          claimScope: 'location_specific',
          claimStatus: 'ended',
          endedAt: '2026-07-10T00:00:00.000Z',
        }),
      ],
    });

    const result = await generateBusinessClaimTargetContext(
      locationClaim(),
      backend(material),
      generatedAt,
    );

    expect(result.lifecycleReasons).toEqual([
      'entity_not_active',
      'entity_not_public',
      'location_not_active',
      'location_not_public',
      'stale_claim_context',
      'ended_claim_context',
    ]);
    expect(JSON.stringify(result)).not.toContain('recommendedDecision');
    expect(JSON.stringify(result)).not.toContain('verified');
  });

  it('marks missing payment Claim context as non-conclusive', async () => {
    const result = await generateBusinessClaimTargetContext(
      entityClaim(),
      backend(entityMaterial({ claims: [] })),
      generatedAt,
    );

    expect(result.paymentClaimSignals).toEqual([]);
    expect(result.lifecycleReasons).toContain('no_relevant_payment_claims');
    expect(result.coverage.absenceIsConclusive).toBe(false);
  });

  it('does not expose authority statements, Evidence links, or private-presence flags', async () => {
    const result = await generateBusinessClaimTargetContext(
      entityClaim(),
      backend(entityMaterial()),
      generatedAt,
    );
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('PRIVATE AUTHORITY STATEMENT VALUE');
    expect(serialized).not.toContain('private-review-reference');
    expect(serialized).not.toContain('assistedVerifierReferencePresent');
    expect(serialized).not.toContain('privateProofPresent');
    expect(serialized).not.toContain('statusSecret');
  });

  it('fails with a bounded not-found error', async () => {
    await expect(
      generateBusinessClaimTargetContext(entityClaim(), backend(null), generatedAt),
    ).rejects.toMatchObject({ code: 'target_not_found' });
  });

  it('fails closed for target identity, parent, and Claim ownership mismatches', async () => {
    await expect(
      generateBusinessClaimTargetContext(
        entityClaim(),
        backend(entityMaterial({ targetId: locationId })),
        generatedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_response' });

    await expect(
      generateBusinessClaimTargetContext(
        locationClaim(),
        backend(
          locationMaterial({
            location: {
              ...locationMaterial().location!,
              entityId: otherClaimId,
            },
          }),
        ),
        generatedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_response' });

    await expect(
      generateBusinessClaimTargetContext(
        entityClaim(),
        backend(
          entityMaterial({
            claims: [paymentClaim(claimId, { entityId: otherClaimId })],
          }),
        ),
        generatedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('rejects another branch Claim inside Location target context', async () => {
    await expect(
      generateBusinessClaimTargetContext(
        locationClaim(),
        backend(
          locationMaterial({
            claims: [
              paymentClaim(claimId, {
                locationId: otherClaimId,
                claimScope: 'location_specific',
              }),
            ],
          }),
        ),
        generatedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('maps backend failures and invalid times to bounded errors', async () => {
    await expect(
      generateBusinessClaimTargetContext(
        entityClaim(),
        {
          async loadTarget() {
            throw new Error('database connection string and SQL detail');
          },
        },
        generatedAt,
      ),
    ).rejects.toMatchObject({
      code: 'backend_failure',
      message: 'Business Claim target context could not be loaded.',
    });

    await expect(
      generateBusinessClaimTargetContext(entityClaim(), backend(entityMaterial()), new Date('bad')),
    ).rejects.toMatchObject({ code: 'invalid_projection' });
  });

  it('rejects malformed review projections before backend access', async () => {
    let called = false;
    const malformed = {
      ...entityClaim(),
      targetId: 'not-a-uuid',
    } as unknown as BusinessClaimReviewProjection;

    await expect(
      generateBusinessClaimTargetContext(
        malformed,
        {
          async loadTarget() {
            called = true;
            return entityMaterial();
          },
        },
        generatedAt,
      ),
    ).rejects.toBeInstanceOf(BusinessClaimTargetContextError);
    expect(called).toBe(false);
  });
});
