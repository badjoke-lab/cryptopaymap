import { describe, expect, it, vi } from 'vitest';
import {
  createCandidatePromotionService,
  type CandidatePromotionBackend,
  type CandidatePromotionCommand,
  type CandidatePromotionInput,
  type CandidatePromotionReceipt,
} from '../src/admin/promotion/candidate-promotion';
import {
  createCandidateExistingTargetLinkService,
  type CandidateExistingTargetLinkBackend,
  type CandidateExistingTargetLinkCommand,
  type CandidateExistingTargetLinkInput,
} from '../src/admin/promotion/existing-target-link';
import type { PromotionProvenanceAssignment } from '../src/admin/promotion/provenance-plan';

const ids = {
  source: '10000000-0000-4000-8000-000000000001',
  candidate: '20000000-0000-4000-8000-000000000001',
  newEntity: '30000000-0000-4000-8000-000000000001',
  existingEntity: '30000000-0000-4000-8000-000000000002',
  newClaim: '40000000-0000-4000-8000-000000000001',
  existingClaim: '40000000-0000-4000-8000-000000000002',
  newAssetRow: '50000000-0000-4000-8000-000000000001',
  existingAssetRow: '50000000-0000-4000-8000-000000000002',
  asset: '60000000-0000-4000-8000-000000000001',
  network: '70000000-0000-4000-8000-000000000001',
  method: '80000000-0000-4000-8000-000000000001',
  newRequest: '90000000-0000-4000-8000-000000000001',
  existingRequest: '90000000-0000-4000-8000-000000000002',
} as const;

const reviewedAt = '2026-06-30T00:00:00.000Z';
const committedAt = '2026-07-01T00:00:00.000Z';

function assignment(
  subjectType: PromotionProvenanceAssignment['subjectType'],
  subjectId: string,
  fieldPath: string,
  provenanceRole: PromotionProvenanceAssignment['provenanceRole'],
): PromotionProvenanceAssignment {
  return {
    subjectType,
    subjectId,
    fieldPath,
    sourceRecordIds: [ids.source],
    provenanceRole,
  };
}

function claimValue(entityId: string) {
  return {
    entityId,
    locationId: null,
    claimScope: 'online_service' as const,
    routeType: 'direct_wallet' as const,
    acceptanceScope: 'all_checkout' as const,
    claimStatus: 'candidate' as const,
    visibility: 'hidden' as const,
    customerPaysCrypto: true,
    merchantExplicitlyAcceptsCrypto: true,
    processorId: null,
    howToPay: null,
    instructionsLanguage: 'en',
    merchantReceives: 'crypto' as const,
    restrictions: null,
    firstConfirmedAt: null,
    lastConfirmedAt: null,
    nextReviewAt: null,
    endedAt: null,
    endedReason: null,
  };
}

function assetValue(claimId: string) {
  return {
    claimId,
    assetId: ids.asset,
    networkId: ids.network,
    paymentMethodId: ids.method,
    contractAddress: null,
    isPrimary: true,
    notes: null,
  };
}

function originAssignments(entityId: string, claimId: string, claimAssetId: string) {
  return [
    assignment('entity', entityId, 'name', 'origin'),
    assignment('acceptance_claim', claimId, 'routeType', 'origin'),
    assignment('acceptance_claim', claimId, 'acceptanceScope', 'origin'),
    assignment('acceptance_claim', claimId, 'customerPaysCrypto', 'origin'),
    assignment('acceptance_claim', claimId, 'merchantExplicitlyAcceptsCrypto', 'origin'),
    assignment('acceptance_claim', claimId, 'merchantReceives', 'origin'),
    assignment('claim_asset', claimAssetId, 'assetId', 'origin'),
    assignment('claim_asset', claimAssetId, 'networkId', 'origin'),
    assignment('claim_asset', claimAssetId, 'paymentMethodId', 'origin'),
  ];
}

function newTargetInput(): CandidatePromotionInput {
  return {
    candidateId: ids.candidate,
    expectedCandidateType: 'online_service',
    expectedCandidateUpdatedAt: reviewedAt,
    promotedAt: committedAt,
    entity: {
      id: ids.newEntity,
      value: {
        entityType: 'online_service',
        name: 'Example Service',
        slug: 'example-service',
        legalName: null,
        websiteUrl: null,
        countryCode: null,
        entityStatus: 'active',
        visibility: 'hidden',
      },
    },
    location: null,
    claim: { id: ids.newClaim, value: claimValue(ids.newEntity) },
    claimAssets: [{ id: ids.newAssetRow, value: assetValue(ids.newClaim) }],
    sourceRecordIds: [ids.source],
    provenanceAssignments: originAssignments(ids.newEntity, ids.newClaim, ids.newAssetRow),
  };
}

function existingTargetInput(): CandidateExistingTargetLinkInput {
  return {
    candidateId: ids.candidate,
    expectedCandidateType: 'online_service',
    expectedCandidateUpdatedAt: reviewedAt,
    linkedAt: committedAt,
    target: {
      entityId: ids.existingEntity,
      expectedEntityUpdatedAt: reviewedAt,
      locationId: null,
      expectedLocationUpdatedAt: null,
      expectedCanonicalPath: '/service/existing-service',
      expectedClaimIds: [],
    },
    claim: { id: ids.existingClaim, value: claimValue(ids.existingEntity) },
    claimAssets: [{ id: ids.existingAssetRow, value: assetValue(ids.existingClaim) }],
    sourceRecordIds: [ids.source],
    provenanceAssignments: [
      assignment('entity', ids.existingEntity, 'name', 'attribution'),
      ...originAssignments(ids.existingEntity, ids.existingClaim, ids.existingAssetRow).filter(
        (row) => row.subjectType !== 'entity',
      ),
    ],
  };
}

function receipt(
  requestId: string,
  entityId: string,
  claimId: string,
  claimAssetId: string,
  canonicalPath: string,
): CandidatePromotionReceipt {
  return {
    requestId,
    candidateId: ids.candidate,
    entityId,
    locationId: null,
    claimId,
    claimAssetIds: [claimAssetId],
    canonicalPath,
    claimStatus: 'candidate',
    visibility: 'hidden',
    promotedAt: committedAt,
    state: 'committed',
  };
}

describe('P3-07 Candidate promotion integration audit', () => {
  it('keeps both promotion paths hidden and preserves their provenance roles', async () => {
    const newCommands: CandidatePromotionCommand[] = [];
    const existingCommands: CandidateExistingTargetLinkCommand[] = [];
    const newBackend: CandidatePromotionBackend = {
      commitPromotion: vi.fn(async (command) => {
        newCommands.push(command);
        return receipt(
          ids.newRequest,
          ids.newEntity,
          ids.newClaim,
          ids.newAssetRow,
          '/service/example-service',
        );
      }),
    };
    const existingBackend: CandidateExistingTargetLinkBackend = {
      commitExistingTargetLink: vi.fn(async (command) => {
        existingCommands.push(command);
        return receipt(
          ids.existingRequest,
          ids.existingEntity,
          ids.existingClaim,
          ids.existingAssetRow,
          '/service/existing-service',
        );
      }),
    };

    const newReceipt = await createCandidatePromotionService(newBackend).promote(
      {
        requestId: ids.newRequest,
        actorId: 'admin:new-target-reviewer',
        actorType: 'human',
        capabilities: ['candidate:promote'],
      },
      newTargetInput(),
    );
    const existingReceipt = await createCandidateExistingTargetLinkService(existingBackend).link(
      {
        requestId: ids.existingRequest,
        actorId: 'admin:existing-target-reviewer',
        actorType: 'human',
        capabilities: ['candidate:promote'],
      },
      existingTargetInput(),
    );

    expect(newReceipt).toMatchObject({ claimStatus: 'candidate', visibility: 'hidden' });
    expect(existingReceipt).toMatchObject({ claimStatus: 'candidate', visibility: 'hidden' });
    expect(newCommands[0]?.sourceRecordIds).toEqual([ids.source]);
    expect(existingCommands[0]?.sourceRecordIds).toEqual([ids.source]);
    expect(newCommands[0]?.provenanceAssignments.every((row) => row.provenanceRole === 'origin')).toBe(
      true,
    );
    expect(existingCommands[0]?.provenanceAssignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subjectType: 'entity', provenanceRole: 'attribution' }),
        expect.objectContaining({ subjectType: 'acceptance_claim', provenanceRole: 'origin' }),
        expect.objectContaining({ subjectType: 'claim_asset', provenanceRole: 'origin' }),
      ]),
    );
  });

  it('rejects verified or public Claims before either backend is called', async () => {
    const commitPromotion = vi.fn();
    const commitExistingTargetLink = vi.fn();
    const unsafeNew = newTargetInput();
    unsafeNew.claim.value.claimStatus = 'confirmed';
    unsafeNew.claim.value.visibility = 'public';
    unsafeNew.claim.value.firstConfirmedAt = committedAt;
    unsafeNew.claim.value.lastConfirmedAt = committedAt;
    const unsafeExisting = existingTargetInput();
    unsafeExisting.claim.value.claimStatus = 'confirmed';
    unsafeExisting.claim.value.visibility = 'public';
    unsafeExisting.claim.value.firstConfirmedAt = committedAt;
    unsafeExisting.claim.value.lastConfirmedAt = committedAt;

    await expect(
      createCandidatePromotionService({ commitPromotion }).promote(
        {
          requestId: ids.newRequest,
          actorId: 'admin:new-target-reviewer',
          actorType: 'human',
          capabilities: ['candidate:promote'],
        },
        unsafeNew,
      ),
    ).rejects.toMatchObject({ code: 'invalid_promotion' });
    await expect(
      createCandidateExistingTargetLinkService({ commitExistingTargetLink }).link(
        {
          requestId: ids.existingRequest,
          actorId: 'admin:existing-target-reviewer',
          actorType: 'human',
          capabilities: ['candidate:promote'],
        },
        unsafeExisting,
      ),
    ).rejects.toMatchObject({ code: 'invalid_promotion' });
    expect(commitPromotion).not.toHaveBeenCalled();
    expect(commitExistingTargetLink).not.toHaveBeenCalled();
  });
});
