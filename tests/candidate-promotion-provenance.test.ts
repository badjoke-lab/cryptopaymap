import { describe, expect, it, vi } from 'vitest';
import {
  createCandidatePromotionService,
  type CandidatePromotionBackend,
  type CandidatePromotionCommand,
  type CandidatePromotionInput,
  type CandidatePromotionReceipt,
} from '../src/admin/promotion/candidate-promotion';
import {
  expandPromotionProvenanceAssignments,
  normalizePromotionProvenanceAssignments,
  validateExistingTargetProvenanceAssignments,
  validateNewTargetProvenanceAssignments,
  type PromotionProvenanceAssignment,
} from '../src/admin/promotion/provenance-plan';

const candidateId = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const claimId = '30000000-0000-4000-8000-000000000001';
const claimAssetId = '40000000-0000-4000-8000-000000000001';
const sourceRecordId = '50000000-0000-4000-8000-000000000001';
const otherSourceRecordId = '50000000-0000-4000-8000-000000000002';
const assetId = '60000000-0000-4000-8000-000000000001';
const networkId = '70000000-0000-4000-8000-000000000001';
const paymentMethodId = '80000000-0000-4000-8000-000000000001';
const requestId = '90000000-0000-4000-8000-000000000001';
const promotedAt = '2026-07-01T00:00:00.000Z';

function newTargetInput(): CandidatePromotionInput {
  return {
    candidateId,
    expectedCandidateType: 'online_service',
    expectedCandidateUpdatedAt: '2026-06-30T00:00:00.000Z',
    promotedAt,
    entity: {
      id: entityId,
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
    claim: {
      id: claimId,
      value: {
        entityId,
        locationId: null,
        claimScope: 'online_service',
        routeType: 'direct_wallet',
        acceptanceScope: 'all_checkout',
        claimStatus: 'candidate',
        visibility: 'hidden',
        customerPaysCrypto: true,
        merchantExplicitlyAcceptsCrypto: true,
        processorId: null,
        howToPay: null,
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
    provenanceAssignments: newTargetAssignments(),
  };
}

function assignment(
  subjectType: PromotionProvenanceAssignment['subjectType'],
  subjectId: string,
  fieldPath: string,
  provenanceRole: PromotionProvenanceAssignment['provenanceRole'] = 'origin',
  sourceRecordIds = [sourceRecordId],
): PromotionProvenanceAssignment {
  return { subjectType, subjectId, fieldPath, sourceRecordIds, provenanceRole };
}

function newTargetAssignments(): PromotionProvenanceAssignment[] {
  return [
    assignment('entity', entityId, 'name'),
    assignment('acceptance_claim', claimId, 'routeType'),
    assignment('acceptance_claim', claimId, 'acceptanceScope'),
    assignment('acceptance_claim', claimId, 'customerPaysCrypto'),
    assignment('acceptance_claim', claimId, 'merchantExplicitlyAcceptsCrypto'),
    assignment('acceptance_claim', claimId, 'merchantReceives'),
    assignment('claim_asset', claimAssetId, 'assetId'),
    assignment('claim_asset', claimAssetId, 'networkId'),
    assignment('claim_asset', claimAssetId, 'paymentMethodId'),
  ];
}

function existingTargetAssignments(): PromotionProvenanceAssignment[] {
  return [
    assignment('entity', entityId, 'name', 'attribution'),
    ...newTargetAssignments().filter((row) => row.subjectType !== 'entity'),
  ];
}

describe('Candidate promotion field provenance', () => {
  it('accepts complete new-target origin assignments and normalizes them into the command', async () => {
    const commands: CandidatePromotionCommand[] = [];
    const receipt: CandidatePromotionReceipt = {
      requestId,
      candidateId,
      entityId,
      locationId: null,
      claimId,
      claimAssetIds: [claimAssetId],
      canonicalPath: '/service/example-service',
      claimStatus: 'candidate',
      visibility: 'hidden',
      promotedAt,
      state: 'committed',
    };
    const backend: CandidatePromotionBackend = {
      commitPromotion: vi.fn(async (command) => {
        commands.push(command);
        return receipt;
      }),
    };

    await expect(
      createCandidatePromotionService(backend).promote(
        {
          requestId,
          actorId: 'admin:reviewer',
          actorType: 'human',
          capabilities: ['candidate:promote'],
        },
        newTargetInput(),
      ),
    ).resolves.toEqual(receipt);

    expect(commands[0]?.provenanceAssignments).toEqual(
      normalizePromotionProvenanceAssignments(newTargetAssignments()),
    );
  });

  it('rejects incomplete new-target field coverage', () => {
    const input = newTargetInput();
    const issues = validateNewTargetProvenanceAssignments(
      input.provenanceAssignments?.filter((row) => row.fieldPath !== 'merchantReceives'),
      {
        sourceRecordIds: input.sourceRecordIds,
        entity: input.entity,
        location: input.location,
        claim: input.claim,
        claimAssets: input.claimAssets,
      },
    );

    expect(issues).toContain(
      'acceptance_claim.merchantReceives requires at least one origin source assignment',
    );
  });

  it('rejects sources outside the exact Candidate provenance set', () => {
    const input = newTargetInput();
    const assignments = newTargetAssignments();
    assignments[0] = assignment('entity', entityId, 'name', 'origin', [otherSourceRecordId]);

    expect(
      validateNewTargetProvenanceAssignments(assignments, {
        sourceRecordIds: input.sourceRecordIds,
        entity: input.entity,
        location: input.location,
        claim: input.claim,
        claimAssets: input.claimAssets,
      }),
    ).toContain('entity.name references a source outside the Candidate provenance set');
  });

  it('separates existing identity attribution from new Claim origin', () => {
    const input = newTargetInput();
    expect(
      validateExistingTargetProvenanceAssignments(existingTargetAssignments(), {
        sourceRecordIds: input.sourceRecordIds,
        targetEntityId: entityId,
        targetLocationId: null,
        claim: input.claim,
        claimAssets: input.claimAssets,
      }),
    ).toEqual([]);

    const wrongRole = existingTargetAssignments();
    wrongRole[0] = assignment('entity', entityId, 'name', 'origin');
    expect(
      validateExistingTargetProvenanceAssignments(wrongRole, {
        sourceRecordIds: input.sourceRecordIds,
        targetEntityId: entityId,
        targetLocationId: null,
        claim: input.claim,
        claimAssets: input.claimAssets,
      }),
    ).toEqual(
      expect.arrayContaining([
        'existing Entity and Location fields only accept attribution provenance',
        'existing-target linking requires at least one identity-field attribution',
      ]),
    );
  });

  it('expands one field assignment into durable field-path rows', () => {
    const rows = expandPromotionProvenanceAssignments(
      [assignment('entity', entityId, 'name', 'origin', [sourceRecordId, otherSourceRecordId])],
      new Date(promotedAt),
    );

    expect(rows).toEqual([
      {
        subjectType: 'entity',
        subjectId: entityId,
        fieldPath: 'name',
        sourceRecordId,
        provenanceRole: 'origin',
        effectiveFrom: new Date(promotedAt),
      },
      {
        subjectType: 'entity',
        subjectId: entityId,
        fieldPath: 'name',
        sourceRecordId: otherSourceRecordId,
        provenanceRole: 'origin',
        effectiveFrom: new Date(promotedAt),
      },
    ]);
  });

  it('keeps omitted field assignments compatible with the record-level promotion path', () => {
    const input = newTargetInput();
    delete input.provenanceAssignments;
    expect(
      validateNewTargetProvenanceAssignments(input.provenanceAssignments, {
        sourceRecordIds: input.sourceRecordIds,
        entity: input.entity,
        location: input.location,
        claim: input.claim,
        claimAssets: input.claimAssets,
      }),
    ).toEqual([]);
  });
});
