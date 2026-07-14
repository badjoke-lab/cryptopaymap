import { businessClaimSubmissionReviewDetailResponseSchema } from '../src/admin/submissions/business-claim-detail';
import { businessClaimSubmissionQueueResponseSchema } from '../src/admin/submissions/business-claim-queue';

const submissionId = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const generatedAt = '2026-07-14T04:00:00.000Z';

const projection = {
  targetType: 'entity' as const,
  targetId: entityId,
  claimantRole: 'owner' as const,
  requestedScopes: ['representative_relationship' as const, 'entity_profile' as const],
  verification: {
    method: 'official_domain_email' as const,
    officialDomain: 'hosting.example',
    protectedContactPresent: true,
    officialWebsiteUrl: null,
    officialSocialUrl: null,
    assistedVerifierReferencePresent: false,
    privateProofPresent: false,
  },
  proposedChanges: {
    entity: {
      changedFields: ['name' as const],
      name: 'Example Hosting',
      legalName: null,
      websiteUrl: null,
      countryCode: null,
    },
    location: null,
    paymentProposals: null,
  },
  authorityStatement: 'I am authorized to represent this business.',
  evidenceLinks: [],
};

businessClaimSubmissionQueueResponseSchema.parse({
  generatedAt,
  items: [
    {
      id: submissionId,
      publicId: 'CPM-S-2026-000001',
      targetType: 'entity',
      targetId: entityId,
      claimantRole: 'owner',
      requestedScopes: ['representative_relationship', 'entity_profile'],
      verificationMethod: 'official_domain_email',
      workflowStatus: 'received',
      resolution: null,
      priority: 20,
      evidenceCount: 0,
      protectedContactPresent: true,
      privateProofPresent: false,
      assistedVerifierReferencePresent: false,
      submittedAt: generatedAt,
      updatedAt: generatedAt,
    },
  ],
  hasNextPage: false,
  nextCursor: null,
});

businessClaimSubmissionReviewDetailResponseSchema.parse({
  generatedAt,
  submission: {
    id: submissionId,
    publicId: 'CPM-S-2026-000001',
    submissionType: 'claim',
    targetType: 'entity',
    targetId: entityId,
    workflowStatus: 'received',
    resolution: null,
    priority: 20,
    submittedAt: generatedAt,
    updatedAt: generatedAt,
  },
  projection,
  events: [],
  eventsTruncated: false,
  privateMaterial: {
    protectedContactPresent: true,
    privateProofPresent: false,
    assistedVerifierReferencePresent: false,
  },
  targetContext: {
    generatedAt,
    target: {
      targetType: 'entity',
      targetId: entityId,
      canonicalPath: '/service/example-hosting',
      entity: {
        id: entityId,
        entityType: 'online_service',
        name: 'Example Hosting',
        slug: 'example-hosting',
        legalName: 'Example Hosting Incorporated',
        websiteUrl: 'https://hosting.example/',
        countryCode: 'US',
        entityStatus: 'active',
        visibility: 'public',
        updatedAt: generatedAt,
      },
      location: null,
    },
    identityComparisons: {
      officialDomain: 'match',
      officialWebsite: 'not_requested',
      officialSocial: 'not_requested',
    },
    fieldComparisons: {
      entity: [{ field: 'name', comparison: 'same' }],
      location: [],
    },
    paymentClaimSignals: [],
    lifecycleReasons: [],
    coverage: {
      targetLookupComplete: true,
      entityComparisonComplete: true,
      locationComparisonComplete: true,
      paymentContextComplete: true,
      socialComparisonComplete: true,
      absenceIsConclusive: false,
    },
  },
});

console.log('P5-04D Business Claim reviewer schemas are valid.');
