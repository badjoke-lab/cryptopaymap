import {
  buildNewTargetFieldProvenancePlan,
  newTargetFieldDescriptors,
} from '../src/admin/promotion/field-source-selection';

const sourceRecordId = '10000000-0000-4000-8000-000000000001';
const descriptors = newTargetFieldDescriptors(false, ['asset-row']);
const selections = Object.fromEntries(
  descriptors.map((field) => [field.key, [sourceRecordId]]),
);
const result = buildNewTargetFieldProvenancePlan({
  selections,
  entity: {
    id: '20000000-0000-4000-8000-000000000001',
    value: { name: 'Example', legalName: null, websiteUrl: null, countryCode: null },
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
  throw new Error('Promotion field controls did not cover every non-null factual field.');
}
if (!result.assignments.some((row) => row.fieldPath === 'paymentMethodId')) {
  throw new Error('Promotion field controls omitted Claim Asset provenance.');
}

console.log('Candidate promotion field control checks passed.');
