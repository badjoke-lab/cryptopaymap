import {
  businessClaimFieldApplicationEventPayloadSchema,
  businessClaimFieldApplicationReceiptSchema,
} from '../src/submissions/business-claim-field-application-persistence-contract';

const submissionId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';
const relationshipDecisionId = '30000000-0000-4000-8000-000000000001';
const requestId = '40000000-0000-4000-8000-000000000001';
const updatedAt = '2026-07-14T09:00:00.000Z';

const request = {
  schemaVersion: 'business-claim-field-application-v1' as const,
  requestId,
  expectedSubmissionUpdatedAt: updatedAt,
  expectedRelationshipDecisionId: relationshipDecisionId,
  expectedEntityUpdatedAt: updatedAt,
  expectedLocationUpdatedAt: null,
  entityDecision: {
    acceptedFields: ['name' as const],
    rejectedFields: ['legalName' as const],
  },
  locationDecision: null,
  paymentDecision: null,
};

const projection = {
  schemaVersion: 'business-claim-field-application-projection-v1' as const,
  requestId,
  requestFingerprint: `sha256:${'a'.repeat(64)}`,
  submissionId,
  relationshipDecisionId,
  targetType: 'entity' as const,
  targetId,
  entityApplication: {
    expectedUpdatedAt: updatedAt,
    acceptedFields: ['name' as const],
    rejectedFields: ['legalName' as const],
    before: {
      entityType: 'merchant' as const,
      name: 'Original Merchant',
      slug: 'original-merchant',
      legalName: null,
      websiteUrl: null,
      countryCode: 'JP',
      entityStatus: 'active' as const,
      visibility: 'public' as const,
    },
    after: {
      entityType: 'merchant' as const,
      name: 'Updated Merchant',
      slug: 'original-merchant',
      legalName: null,
      websiteUrl: null,
      countryCode: 'JP',
      entityStatus: 'active' as const,
      visibility: 'public' as const,
    },
  },
  locationApplication: null,
  paymentApplication: null,
  hasAcceptedChanges: true,
  generatedAt: updatedAt,
};

businessClaimFieldApplicationEventPayloadSchema.parse({
  schemaVersion: 'business-claim-field-application-event-v1',
  request,
  projection,
  appliedAt: updatedAt,
});

businessClaimFieldApplicationReceiptSchema.parse({
  state: 'committed',
  submissionId,
  requestId,
  requestFingerprint: projection.requestFingerprint,
  relationshipDecisionId,
  targetType: 'entity',
  targetId,
  appliedEntityFields: ['name'],
  rejectedEntityFields: ['legalName'],
  appliedLocationFields: [],
  rejectedLocationFields: [],
  acceptedPaymentDraftCount: 0,
  rejectedPaymentDraftCount: 0,
  canonicalMutationCommitted: true,
  appliedAt: updatedAt,
});

if (
  businessClaimFieldApplicationReceiptSchema.safeParse({
    state: 'committed',
    submissionId,
    requestId,
    requestFingerprint: projection.requestFingerprint,
    relationshipDecisionId,
    targetType: 'entity',
    targetId,
    appliedEntityFields: ['name'],
    rejectedEntityFields: ['legalName'],
    appliedLocationFields: [],
    rejectedLocationFields: [],
    acceptedPaymentDraftCount: 0,
    rejectedPaymentDraftCount: 0,
    canonicalMutationCommitted: true,
    appliedAt: updatedAt,
    editingPermission: true,
  }).success
) {
  throw new Error('P5-04H2 receipt accepted editing permission material.');
}

console.log('P5-04H2 Business Claim field persistence checks passed.');
