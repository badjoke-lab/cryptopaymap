import { describe, expect, it } from 'vitest';
import type { CandidateCanonicalTargetOption } from '../src/admin/promotion/target-selection';
import type { SuggestReviewProjection } from '../src/submissions/suggest-contract';
import {
  generateSuggestReviewSignals,
  SuggestReviewSignalError,
  type SuggestCandidateSignalMaterial,
  type SuggestCandidateSignalSearchBackend,
} from '../src/submissions/suggest-review-signals';

const asOf = new Date('2026-07-10T01:00:00.000Z');

function onlineProjection(): SuggestReviewProjection {
  return {
    suggestionKind: 'online_service',
    entityType: 'online_service',
    entity: {
      name: 'Example Hosting',
      legalName: null,
      websiteUrl: 'https://www.hosting.example/',
      countryCode: 'US',
    },
    place: null,
    categories: [],
    paymentProposals: [
      {
        assetSlug: 'usdc',
        networkSlug: 'base',
        routeType: 'processor_checkout',
        paymentMethod: 'processor_checkout',
        processor: { name: 'Processor', websiteUrl: null },
        contractAddress: null,
        howToPay: 'Choose crypto at checkout.',
        restrictions: null,
        isPrimary: true,
      },
    ],
    observedAt: '2026-07-01',
    relationship: 'customer',
    evidenceLinks: [],
  };
}

function physicalProjection(): SuggestReviewProjection {
  return {
    suggestionKind: 'physical_place',
    entityType: 'merchant',
    entity: {
      name: 'Example Coffee',
      legalName: null,
      websiteUrl: 'https://coffee.example/',
      countryCode: 'JP',
    },
    place: {
      branchName: 'Shibuya',
      addressLine: '1-2-3 Jingumae',
      locality: 'Shibuya',
      region: 'Tokyo',
      postalCode: '150-0001',
      countryCode: 'JP',
      latitude: 35.6695,
      longitude: 139.7026,
      websiteUrl: null,
      phone: null,
      description: null,
      openingHours: null,
      amenities: [],
      socialLinks: [],
    },
    categories: [],
    paymentProposals: [
      {
        assetSlug: 'btc',
        networkSlug: 'bitcoin',
        routeType: 'direct_wallet',
        paymentMethod: 'onchain',
        processor: null,
        contractAddress: null,
        howToPay: 'Ask for the QR code.',
        restrictions: null,
        isPrimary: true,
      },
    ],
    observedAt: '2026-07-01',
    relationship: 'customer',
    evidenceLinks: [],
  };
}

function onlineCandidateMaterial(): SuggestCandidateSignalMaterial {
  return {
    candidateId: '10000000-0000-4000-8000-000000000001',
    candidateType: 'online_service',
    candidateStatus: 'triaged',
    normalizedName: 'example hosting',
    duplicateGroupId: null,
    snapshots: [
      {
        kind: 'online_service',
        recordType: 'online_service',
        name: 'Example Hosting',
        websiteUrl: 'https://hosting.example/pricing',
        countryCode: 'US',
        category: null,
        acceptanceScope: 'all_checkout',
        routeType: 'processor_checkout',
        processorName: 'Processor',
        processorUrl: null,
        assetLabels: ['USDC'],
        networkLabels: ['Base'],
        paymentMethodLabels: ['processor checkout'],
        scopeNotes: null,
        howToPay: 'Choose crypto at checkout.',
        evidenceUrls: [],
        legacyVerificationLabel: null,
      },
    ],
  };
}

function physicalCandidateMaterial(): SuggestCandidateSignalMaterial {
  return {
    candidateId: '10000000-0000-4000-8000-000000000002',
    candidateType: 'physical_place',
    candidateStatus: 'new',
    normalizedName: 'example coffee',
    duplicateGroupId: null,
    snapshots: [
      {
        kind: 'physical_place',
        name: 'Example Coffee',
        addressLine: '1-2-3 Jingumae',
        locality: 'Shibuya',
        region: 'Tokyo',
        postalCode: '150-0001',
        countryCode: 'JP',
        latitude: 35.6695,
        longitude: 139.7026,
        category: null,
        websiteUrl: null,
        phone: null,
        description: null,
        openingHours: null,
        amenities: null,
        socialLinks: [],
        osmType: null,
        osmId: null,
        paymentTags: {},
        legacyVerificationLabel: null,
      },
    ],
  };
}

function onlineTarget(): CandidateCanonicalTargetOption {
  return {
    canonicalPath: '/service/example-hosting',
    entity: {
      id: '20000000-0000-4000-8000-000000000001',
      entityType: 'online_service',
      name: 'Example Hosting',
      slug: 'example-hosting',
      websiteUrl: 'https://hosting.example/',
      countryCode: 'US',
      entityStatus: 'active',
      visibility: 'public',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    location: null,
    existingClaims: [],
    expectedClaimIds: [],
  };
}

function physicalTarget(): CandidateCanonicalTargetOption {
  return {
    canonicalPath: '/place/example-coffee-shibuya',
    entity: {
      id: '20000000-0000-4000-8000-000000000002',
      entityType: 'merchant',
      name: 'Example Coffee',
      slug: 'example-coffee',
      websiteUrl: 'https://coffee.example/',
      countryCode: 'JP',
      entityStatus: 'active',
      visibility: 'public',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    location: {
      id: '30000000-0000-4000-8000-000000000001',
      entityId: '20000000-0000-4000-8000-000000000002',
      name: 'Shibuya',
      slug: 'example-coffee-shibuya',
      addressLine: '1-2-3 Jingumae',
      locality: 'Shibuya',
      region: 'Tokyo',
      postalCode: '150-0001',
      countryCode: 'JP',
      latitude: 35.66955,
      longitude: 139.70262,
      locationStatus: 'active',
      visibility: 'public',
      websiteUrl: null,
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    existingClaims: [],
    expectedClaimIds: [],
  };
}

function dependencies(
  materials: SuggestCandidateSignalMaterial[],
  targets: CandidateCanonicalTargetOption[],
  queries?: string[],
) {
  const candidateBackend: SuggestCandidateSignalSearchBackend = {
    async searchCandidateSignalMaterial() {
      return materials;
    },
  };
  return {
    candidateBackend,
    canonicalTargetBackend: {
      async searchTargets(_candidateType: string, query: string) {
        queries?.push(query);
        return targets;
      },
    },
  };
}

describe('P5-02C Suggest review signals', () => {
  it('emits strong official-domain and review name Candidate signals for Online Service', async () => {
    const result = await generateSuggestReviewSignals(
      onlineProjection(),
      dependencies([onlineCandidateMaterial()], [onlineTarget()]),
      asOf,
    );

    expect(result.candidateSignals).toEqual([
      {
        candidateId: '10000000-0000-4000-8000-000000000001',
        candidateType: 'online_service',
        candidateStatus: 'triaged',
        duplicateGroupId: null,
        reasons: [
          { reason: 'shared_official_domain', strength: 'strong' },
          { reason: 'same_normalized_name', strength: 'review' },
        ],
      },
    ]);
    expect(result.canonicalTargetSignals[0]).toMatchObject({
      target: { canonicalPath: '/service/example-hosting' },
      reasons: ['same_normalized_name', 'shared_official_domain'],
      strength: 'strong',
    });
  });

  it('emits physical Candidate and canonical review signals without automatic decisions', async () => {
    const result = await generateSuggestReviewSignals(
      physicalProjection(),
      dependencies([physicalCandidateMaterial()], [physicalTarget()]),
      asOf,
    );

    expect(result.candidateSignals[0]).toMatchObject({
      candidateId: '10000000-0000-4000-8000-000000000002',
      reasons: [{ reason: 'same_name_and_coordinates', strength: 'review' }],
    });
    expect(result.canonicalTargetSignals[0]).toMatchObject({
      target: { canonicalPath: '/place/example-coffee-shibuya' },
      reasons: [
        'same_normalized_name',
        'shared_official_domain',
        'same_address',
        'near_coordinates',
      ],
      strength: 'strong',
    });
  });

  it('derives bounded canonical search queries from Suggest identity and location material', async () => {
    const queries: string[] = [];
    await generateSuggestReviewSignals(physicalProjection(), dependencies([], [], queries), asOf);

    expect(queries).toEqual(['Example Coffee', '1-2-3 Jingumae', 'Shibuya']);
  });

  it('returns explicit non-conclusive coverage when no bounded signals are found', async () => {
    const result = await generateSuggestReviewSignals(
      onlineProjection(),
      dependencies([], []),
      asOf,
    );

    expect(result).toMatchObject({
      candidateSignals: [],
      canonicalTargetSignals: [],
      coverage: {
        candidateSearchComplete: true,
        canonicalSearchComplete: true,
        absenceIsConclusive: false,
      },
    });
  });

  it('fails closed when either read backend cannot complete', async () => {
    const candidateBackend: SuggestCandidateSignalSearchBackend = {
      async searchCandidateSignalMaterial() {
        throw new Error('candidate search unavailable');
      },
    };

    await expect(
      generateSuggestReviewSignals(
        onlineProjection(),
        {
          candidateBackend,
          canonicalTargetBackend: {
            async searchTargets() {
              return [];
            },
          },
        },
        asOf,
      ),
    ).rejects.toBeInstanceOf(SuggestReviewSignalError);
  });
});
