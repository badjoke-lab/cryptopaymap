import {
  businessClaimFieldApplicationProjectionSchema,
  businessClaimFieldApplicationRequestSchema,
} from '../src/admin/submissions/business-claim-field-application';

const submissionId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';
const relationshipDecisionId = '30000000-0000-4000-8000-000000000001';
const requestId = '40000000-0000-4000-8000-000000000001';
const updatedAt = '2026-07-14T08:00:00.000Z';

businessClaimFieldApplicationRequestSchema.parse({
  schemaVersion: 'business-claim-field-application-v1',
  requestId,
  expectedSubmissionUpdatedAt: updatedAt,
  expectedRelationshipDecisionId: relationshipDecisionId,
  expectedEntityUpdatedAt: updatedAt,
  expectedLocationUpdatedAt: null,
  entityDecision: {
    acceptedFields: ['name'],
    rejectedFields: ['legalName'],
  },
  locationDecision: null,
  paymentDecision: {
    acceptedIndexes: [0],
    rejectedIndexes: [1],
  },
});

businessClaimFieldApplicationProjectionSchema.parse({
  schemaVersion: 'business-claim-field-application-projection-v1',
  requestId,
  requestFingerprint: `sha256:${'a'.repeat(64)}`,
  submissionId,
  relationshipDecisionId,
  targetType: 'entity',
  targetId,
  entityApplication: {
    expectedUpdatedAt: updatedAt,
    acceptedFields: ['name'],
    rejectedFields: ['legalName'],
    before: {
      entityType: 'merchant',
      name: 'Original Merchant',
      slug: 'original-merchant',
      legalName: null,
      websiteUrl: 'https://merchant.example',
      countryCode: 'JP',
      entityStatus: 'active',
      visibility: 'public',
    },
    after: {
      entityType: 'merchant',
      name: 'Updated Merchant',
      slug: 'original-merchant',
      legalName: null,
      websiteUrl: 'https://merchant.example',
      countryCode: 'JP',
      entityStatus: 'active',
      visibility: 'public',
    },
  },
  locationApplication: null,
  paymentApplication: {
    acceptedIndexes: [0],
    rejectedIndexes: [1],
    acceptedProposals: [
      {
        assetSlug: 'xrp',
        networkSlug: 'xrpl',
        routeType: 'direct_wallet',
        paymentMethod: 'onchain',
        processor: null,
        contractAddress: null,
        howToPay: 'Pay the displayed XRPL address.',
        restrictions: null,
        isPrimary: true,
      },
    ],
  },
  hasAcceptedChanges: true,
  generatedAt: updatedAt,
});

if (
  businessClaimFieldApplicationProjectionSchema.safeParse({
    schemaVersion: 'business-claim-field-application-projection-v1',
    requestId,
    requestFingerprint: `sha256:${'a'.repeat(64)}`,
    submissionId,
    relationshipDecisionId,
    targetType: 'entity',
    targetId,
    entityApplication: null,
    locationApplication: null,
    paymentApplication: null,
    hasAcceptedChanges: false,
    generatedAt: updatedAt,
    editingPermission: true,
  }).success
) {
  throw new Error('P5-04H1 projection accepted editing permission material.');
}

console.log('P5-04H1 Business Claim field application checks passed.');
