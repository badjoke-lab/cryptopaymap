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

function provenanceAssignments(): PromotionProvenanceAssignment[] {
  return [
    ...['name', 'websiteUrl', 'countryCode'].map((field) =>
      assignment('entity', ids.entity, field),
    ),
    ...[
      'name',
      'addressLine',
      'locality',
      'region',
      'postalCode',
      'countryCode',
      'latitude',
      'longitude',
      'websiteUrl',
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
  ];
}

function input(): CandidatePromotionInput {
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
        websiteUrl: 'https://example.test',
        countryCode: 'JP',
        entityStatus: 'active',
        visibility: 'hidden',
      },
    },
    location: {
      id: ids.location,
      value: {
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
        visibility: 'hidden',
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
    provenanceAssignments: provenanceAssignments(),
  };
}

function backend(failBeforeCommit = false) {
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
    failBeforeCommit: () => failBeforeCommit,
  });
}

const context = {
  requestId: ids.request,
  actorId: 'canonical-reviewer',
  actorType: 'human' as const,
  capabilities: ['candidate:promote' as const],
};

describe('practical Place Promotion create path', () => {
  it('persists the reviewed practical profile and carries explicit field provenance into the command', async () => {
    const store = backend();
    const commands: CandidatePromotionCommand[] = [];
    const service = createCandidatePromotionService({
      commitPromotion: async (command) => {
        commands.push(command);
        return store.commitPromotion(command);
      },
    });

    await expect(service.promote(context, input())).resolves.toMatchObject({
      state: 'committed',
      canonicalPath: '/place/reviewed-cafe-tokyo',
      visibility: 'hidden',
      claimStatus: 'candidate',
    });

    expect(store.snapshot().locations[0]?.value).toMatchObject({
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

    const command = commands[0];
    expect(command).toBeDefined();
    const practicalRows = expandPromotionProvenanceAssignments(
      command?.provenanceAssignments ?? [],
      command?.promotedAt ?? new Date(promotedAt),
    ).filter((row) => row.subjectType === 'location');

    expect(practicalRows.map((row) => row.fieldPath)).toEqual(
      expect.arrayContaining(['phone', 'description', 'openingHours', 'amenities', 'socialLinks']),
    );
    expect(practicalRows.every((row) => row.provenanceRole === 'origin')).toBe(true);
  });

  it('replays identical practical create requests and conflicts on changed practical content', async () => {
    const store = backend();
    const service = createCandidatePromotionService(store);

    await expect(service.promote(context, input())).resolves.toMatchObject({ state: 'committed' });
    await expect(service.promote(context, input())).resolves.toMatchObject({ state: 'replayed' });

    const changed = input();
    if (changed.location === null) throw new Error('Expected physical Place location input.');
    changed.location.value.openingHours = 'Mon-Sun 24 hours';

    await expect(service.promote(context, changed)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rolls back practical profile canonical state when atomic commit fails', async () => {
    const store = backend(true);
    const before = store.snapshot();

    await expect(createCandidatePromotionService(store).promote(context, input())).rejects.toThrow(
      'Injected Candidate promotion failure before atomic commit.',
    );
    expect(store.snapshot()).toEqual(before);
  });
});
