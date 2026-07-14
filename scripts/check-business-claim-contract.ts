import {
  businessClaimSubmissionIntakeSchema,
  normalizeBusinessClaimSubmissionIntake,
} from '../src/submissions/business-claim-contract';

const claim = {
  schemaVersion: 'submission-common-v1',
  submissionType: 'claim',
  targetType: 'entity',
  targetId: '10000000-0000-4000-8000-000000000001',
  relationship: 'owner_or_authorized_representative',
  contact: {
    email: 'owner@merchant.example',
    contactAllowed: true,
  },
  evidenceLinks: [],
  originalPayload: {
    schemaVersion: 'business-claim-v1',
    claimantRole: 'authorized_representative',
    requestedScopes: ['representative_relationship'],
    verification: {
      method: 'official_domain_email',
      officialDomain: 'merchant.example',
      officialWebsiteUrl: 'https://merchant.example',
      officialSocialUrl: null,
      assistedVerifierReference: null,
      privateProofUrl: null,
    },
    proposedChanges: {
      entity: null,
      location: null,
      paymentProposals: null,
    },
    authorityStatement: 'I am authorized to verify this business relationship.',
  },
  acknowledgements: {
    privacyNoticeAccepted: true,
    submissionTermsAccepted: true,
  },
};

businessClaimSubmissionIntakeSchema.parse(claim);
const projection = normalizeBusinessClaimSubmissionIntake(claim);
if (!projection.verification.protectedContactPresent) {
  throw new Error('Expected protected claim contact presence signal.');
}
if ('email' in projection.verification || 'privateProofUrl' in projection.verification) {
  throw new Error('Private ownership contact or proof must not enter the review-safe projection.');
}
const serialized = JSON.stringify(projection);
if (serialized.includes('owner@merchant.example')) {
  throw new Error('Protected contact value leaked into the review-safe projection.');
}

console.log('P5-04A business claim contract and review-safe projection are valid.');
