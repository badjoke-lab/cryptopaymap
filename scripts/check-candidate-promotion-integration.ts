import {
  validateExistingTargetProvenanceAssignments,
  validateNewTargetProvenanceAssignments,
  type PromotionProvenanceAssignment,
} from '../src/admin/promotion/provenance-plan';

const sourceRecordId = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const claimId = '30000000-0000-4000-8000-000000000001';
const claimAssetId = '40000000-0000-4000-8000-000000000001';

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
    sourceRecordIds: [sourceRecordId],
    provenanceRole,
  };
}

const claim = {
  id: claimId,
  value: {
    routeType: 'direct_wallet',
    acceptanceScope: 'all_checkout',
    customerPaysCrypto: true,
    merchantExplicitlyAcceptsCrypto: true,
    processorId: null,
    howToPay: null,
    merchantReceives: 'crypto',
    restrictions: null,
  },
};
const claimAssets = [
  {
    id: claimAssetId,
    value: {
      assetId: '50000000-0000-4000-8000-000000000001',
      networkId: '60000000-0000-4000-8000-000000000001',
      paymentMethodId: '70000000-0000-4000-8000-000000000001',
      contractAddress: null,
      notes: null,
    },
  },
];
const originRows = [
  assignment('acceptance_claim', claimId, 'routeType', 'origin'),
  assignment('acceptance_claim', claimId, 'acceptanceScope', 'origin'),
  assignment('acceptance_claim', claimId, 'customerPaysCrypto', 'origin'),
  assignment('acceptance_claim', claimId, 'merchantExplicitlyAcceptsCrypto', 'origin'),
  assignment('acceptance_claim', claimId, 'merchantReceives', 'origin'),
  assignment('claim_asset', claimAssetId, 'assetId', 'origin'),
  assignment('claim_asset', claimAssetId, 'networkId', 'origin'),
  assignment('claim_asset', claimAssetId, 'paymentMethodId', 'origin'),
];

const newIssues = validateNewTargetProvenanceAssignments(
  [assignment('entity', entityId, 'name', 'origin'), ...originRows],
  {
    sourceRecordIds: [sourceRecordId],
    entity: {
      id: entityId,
      value: { name: 'Example', legalName: null, websiteUrl: null, countryCode: null },
    },
    location: null,
    claim,
    claimAssets,
  },
);
if (newIssues.length > 0) {
  throw new Error(`New-target promotion integration check failed: ${newIssues.join('; ')}`);
}

const existingIssues = validateExistingTargetProvenanceAssignments(
  [assignment('entity', entityId, 'name', 'attribution'), ...originRows],
  {
    sourceRecordIds: [sourceRecordId],
    targetEntityId: entityId,
    targetLocationId: null,
    claim,
    claimAssets,
  },
);
if (existingIssues.length > 0) {
  throw new Error(
    `Existing-target promotion integration check failed: ${existingIssues.join('; ')}`,
  );
}

console.log('Candidate promotion integration checks passed.');
