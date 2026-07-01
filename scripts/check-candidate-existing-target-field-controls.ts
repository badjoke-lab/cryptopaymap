import {
  buildExistingTargetFieldProvenancePlan,
  existingTargetFieldDescriptors,
} from '../src/admin/promotion/field-source-selection';

const sourceRecordId = '10000000-0000-4000-8000-000000000001';
const descriptors = existingTargetFieldDescriptors(false, ['asset-row']);
const selections = Object.fromEntries(
  descriptors.map((field) => [field.key, [sourceRecordId]]),
);
const result = buildExistingTargetFieldProvenancePlan({
  selections,
  entity: {
    id: '20000000-0000-4000-8000-000000000001',
    value: { name: 'Example', websiteUrl: null, countryCode: null },
  },
  location: null,
  claim: {
    id: '30000000-0000-4000-8000-000000000001',
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
  },
  claimAssets: [
    {
      id: '40000000-0000-4000-8000-000000000001',
      selectionKey: 'asset-row',
      value: {
        assetId: '50000000-0000-4000-8000-000000000001',
        networkId: '60000000-0000-4000-8000-000000000001',
        paymentMethodId: '70000000-0000-4000-8000-000000000001',
        contractAddress: null,
        notes: null,
      },
    },
  ],
});

if (result.missingFields.length !== 0) {
  throw new Error('Existing-target field controls did not satisfy provenance coverage.');
}
if (
  !result.assignments.some(
    (row) => row.subjectType === 'entity' && row.provenanceRole === 'attribution',
  )
) {
  throw new Error('Existing-target field controls omitted identity attribution.');
}
if (
  !result.assignments.some(
    (row) => row.subjectType === 'claim_asset' && row.provenanceRole === 'origin',
  )
) {
  throw new Error('Existing-target field controls omitted Claim Asset origin provenance.');
}

console.log('Candidate existing-target field control checks passed.');
