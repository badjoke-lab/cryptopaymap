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
  contact: null,
  evidenceLinks: [],
  originalPayload: {
    schemaVersion: 'business-claim-v1',
    claimantRole: 'authorized_representative',
    requestedScopes: ['representative_relationship'],
    verification: {
      method: 'dns_txt',
      officialDomain: 'merchant.example',
      officialContactEmail: null,
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
if (projection.verification.officialContactEmailPresent) {
  throw new Error('Unexpected official contact email exposure state.');
}
if ('privateProofUrl' in projection.verification) {
  throw new Error('Private ownership proof must not enter the review-safe projection.');
}

console.log('P5-04A business claim contract and review-safe projection are valid.');
