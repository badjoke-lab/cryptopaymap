import { describe, expect, it } from 'vitest';
import {
  CandidatePromotionError,
  type CandidatePromotionMutationContext,
} from '../src/admin/promotion/candidate-promotion';
import {
  createCandidateExistingTargetLinkService,
  type CandidateExistingTargetLinkInput,
} from '../src/admin/promotion/existing-target-link';
import { InMemoryExistingTargetLinkBackend } from '../src/admin/promotion/in-memory-existing-target-link-backend';

const candidateId = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const locationId = '30000000-0000-4000-8000-000000000001';
const existingClaimId = '40000000-0000-4000-8000-000000000001';
const claimId = '50000000-0000-4000-8000-000000000001';
const claimAssetId = '60000000-0000-4000-8000-000000000001';
const sourceRecordId = '70000000-0000-4000-8000-000000000001';
const assetId = '80000000-0000-4000-8000-000000000001';
const networkId = '90000000-0000-4000-8000-000000000001';
const paymentMethodId = 'a0000000-0000-4000-8000-000000000001';
const candidateUpdatedAt = '2026-06-30T01:00:00.000Z';
const targetUpdatedAt = '2026-06-30T02:00:00.000Z';
const linkedAt = '2026-07-01T00:00:00.000Z';

const context: CandidatePromotionMutationContext = {
  requestId: 'b0000000-0000-4000-8000-000000000001',
  actorId: 'admin:canonical-linker',
  actorType: 'human',
  capabilities: ['candidate:promote'],
};

function input(): CandidateExistingTargetLinkInput {
  return {
    candidateId,
    expectedCandidateType: 'physical_place',
    expectedCandidateUpdatedAt: candidateUpdatedAt,
    linkedAt,
    target: {
      entityId,
      expectedEntityUpdatedAt: targetUpdatedAt,
      locationId,
      expectedLocationUpdatedAt: targetUpdatedAt,
      expectedCanonicalPath: '/place/example-cafe',
      expectedClaimIds: [existingClaimId],
    },
    claim: {
      id: claimId,
      value: {
        entityId,
        locationId,
        claimScope: 'location_specific',
        routeType: 'direct_wallet',
        acceptanceScope: 'all_checkout',
        claimStatus: 'candidate',
        visibility: 'hidden',
        customerPaysCrypto: true,
        merchantExplicitlyAcceptsCrypto: true,
        processorId: null,
        howToPay: 'Scan the merchant wallet QR code.',
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
        id: claimAssetId,
        value: {
          claimId,
          assetId,
          networkId,
          paymentMethodId,
          contractAddress: null,
          isPrimary: true,
          notes: null,
        },
      },
    ],
    sourceRecordIds: [sourceRecordId],
  };
}

function createBackend(failBeforeCommit = false) {
  return new InMemoryExistingTargetLinkBackend({
    candidates: [
      {
        id: candidateId,
        candidateType: 'physical_place',
        candidateStatus: 'triaged',
        updatedAt: candidateUpdatedAt,
        canonicalEntityId: null,
        canonicalLocationId: null,
        sourceRecordIds: [sourceRecordId],
      },
    ],
    entities: [
      {
        id: entityId,
        entityType: 'merchant',
        slug: null,
        entityStatus: 'active',
        visibility: 'public',
        updatedAt: targetUpdatedAt,
        deletedAt: null,
      },
    ],
    locations: [
      {
        id: locationId,
        entityId,
        slug: 'example-cafe',
        locationStatus: 'active',
        visibility: 'public',
        updatedAt: targetUpdatedAt,
        deletedAt: null,
      },
    ],
    claims: [
      {
        id: existingClaimId,
        entityId,
        locationId,
        deletedAt: null,
      },
    ],
    legacyMappings: [
      {
        id: 'c0000000-0000-4000-8000-000000000001',
        sourceSystem: 'cryptopaymap_v2',
        sourceRecordId,
        migrationStatus: 'pending',
        canonicalPath: null,
        entityId: null,
        locationId: null,
        resolvedAt: null,
      },
    ],
    assetIds: [assetId],
    networkIds: [networkId],
    paymentMethodIds: [paymentMethodId],
    ...(failBeforeCommit ? { failBeforeCommit: () => true } : {}),
  });
}

describe('Candidate existing canonical target linking', () => {
  it('creates only a hidden candidate Claim and links the Candidate to existing records', async () => {
    const backend = createBackend();
    const receipt = await createCandidateExistingTargetLinkService(backend).link(context, input());
    const snapshot = backend.snapshot();

    expect(receipt).toMatchObject({
      entityId,
      locationId,
      claimId,
      canonicalPath: '/place/example-cafe',
      claimStatus: 'candidate',
      visibility: 'hidden',
      state: 'committed',
    });
    expect(snapshot.entities).toHaveLength(1);
    expect(snapshot.locations).toHaveLength(1);
    expect(snapshot.createdClaims).toHaveLength(1);
    expect(snapshot.claimAssets).toHaveLength(1);
    expect(snapshot.candidates[0]).toMatchObject({
      candidateStatus: 'promoted',
      canonicalEntityId: entityId,
      canonicalLocationId: locationId,
    });
    expect(snapshot.legacyMappings[0]).toMatchObject({
      migrationStatus: 'mapped',
      canonicalPath: '/place/example-cafe',
      locationId,
    });
    expect(snapshot.provenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectType: 'entity',
          subjectId: entityId,
          provenanceRole: 'attribution',
        }),
        expect.objectContaining({
          subjectType: 'acceptance_claim',
          subjectId: claimId,
          provenanceRole: 'origin',
        }),
      ]),
    );
  });

  it('replays the same request and rejects changed request content', async () => {
    const backend = createBackend();
    const service = createCandidateExistingTargetLinkService(backend);
    await service.link(context, input());

    await expect(service.link(structuredClone(context), input())).resolves.toMatchObject({
      state: 'replayed',
    });
    await expect(
      service.link(context, {
        ...input(),
        claim: {
          ...input().claim,
          value: { ...input().claim.value, howToPay: 'Different instructions.' },
        },
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(backend.snapshot().links).toBe(1);
  });

  it('rejects a changed target Claim set before linking', async () => {
    const backend = createBackend();
    const request = input();
    request.target.expectedClaimIds = [];

    await expect(
      createCandidateExistingTargetLinkService(backend).link(context, request),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(backend.snapshot().createdClaims).toHaveLength(0);
  });

  it('rolls back every state change after an injected pre-commit failure', async () => {
    const backend = createBackend(true);
    await expect(
      createCandidateExistingTargetLinkService(backend).link(context, input()),
    ).rejects.toBeInstanceOf(CandidatePromotionError);

    const snapshot = backend.snapshot();
    expect(snapshot.createdClaims).toHaveLength(0);
    expect(snapshot.claimAssets).toHaveLength(0);
    expect(snapshot.provenance).toHaveLength(0);
    expect(snapshot.links).toBe(0);
    expect(snapshot.candidates[0]).toMatchObject({
      candidateStatus: 'triaged',
      canonicalEntityId: null,
      canonicalLocationId: null,
    });
    expect(snapshot.legacyMappings[0]).toMatchObject({ migrationStatus: 'pending' });
  });

  it('rejects physical linking without a versioned Location target', async () => {
    const request = input();
    request.target.locationId = null;
    request.target.expectedLocationUpdatedAt = null;
    request.claim.value.locationId = null;

    await expect(
      createCandidateExistingTargetLinkService(createBackend()).link(context, request),
    ).rejects.toMatchObject({ code: 'invalid_promotion' });
  });
});
