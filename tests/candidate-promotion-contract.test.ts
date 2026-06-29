import { describe, expect, it, vi } from 'vitest';
import {
  createCandidatePromotionService,
  type CandidatePromotionInput,
} from '../src/admin/promotion/candidate-promotion';
import { InMemoryCandidatePromotionBackend } from '../src/admin/promotion/in-memory-candidate-promotion-backend';

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
const reviewedAt = '2026-06-29T00:00:00.000Z';
const promotedAt = '2026-06-30T00:00:00.000Z';

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
        websiteUrl: 'https://example.test/',
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
        postalCode: null,
        countryCode: 'JP',
        latitude: 35.681236,
        longitude: 139.767125,
        locationStatus: 'active',
        visibility: 'hidden',
        websiteUrl: 'https://example.test/',
        phone: null,
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
        howToPay: 'Ask staff to display the payment QR code.',
        instructionsLanguage: 'en',
        merchantReceives: 'not_publicly_confirmed',
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
  };
}

function context() {
  return {
    requestId: ids.request,
    actorId: 'canonical-reviewer',
    actorType: 'human' as const,
    capabilities: ['candidate:promote' as const],
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

describe('Candidate promotion contract', () => {
  it('creates only hidden candidate canonical records', async () => {
    const store = backend();
    const receipt = await createCandidatePromotionService(store).promote(context(), input());
    expect(receipt).toMatchObject({
      entityId: ids.entity,
      locationId: ids.location,
      claimStatus: 'candidate',
      visibility: 'hidden',
      canonicalPath: '/place/reviewed-cafe-tokyo',
      state: 'committed',
    });
    const snapshot = store.snapshot();
    expect(snapshot.candidates[0]).toMatchObject({
      candidateStatus: 'promoted',
      canonicalEntityId: ids.entity,
      canonicalLocationId: ids.location,
    });
    expect(snapshot.provenance).toHaveLength(4);
    expect(snapshot.legacyMappings[0]).toMatchObject({
      migrationStatus: 'mapped',
      locationId: ids.location,
    });
  });

  it('rejects public or verified promotion before backend access', async () => {
    const commitPromotion = vi.fn();
    const unsafe = input();
    unsafe.claim.value.claimStatus = 'confirmed';
    unsafe.claim.value.visibility = 'public';
    unsafe.claim.value.firstConfirmedAt = promotedAt;
    unsafe.claim.value.lastConfirmedAt = promotedAt;

    await expect(
      createCandidatePromotionService({ commitPromotion }).promote(context(), unsafe),
    ).rejects.toMatchObject({ code: 'invalid_promotion' });
    expect(commitPromotion).not.toHaveBeenCalled();
  });

  it('replays identical requests and rejects changed content', async () => {
    const store = backend();
    const service = createCandidatePromotionService(store);
    await expect(service.promote(context(), input())).resolves.toMatchObject({ state: 'committed' });
    await expect(service.promote(context(), input())).resolves.toMatchObject({ state: 'replayed' });
    const changed = input();
    changed.entity.value.name = 'Changed Cafe';
    await expect(service.promote(context(), changed)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rolls back all canonical changes on pre-commit failure', async () => {
    const store = backend(true);
    const before = store.snapshot();
    await expect(
      createCandidatePromotionService(store).promote(context(), input()),
    ).rejects.toMatchObject({ code: 'backend_failure' });
    expect(store.snapshot()).toEqual(before);
  });
});
