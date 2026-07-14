import type { BusinessClaimReviewProjection } from '../src/submissions/business-claim-contract';
import {
  type BusinessClaimCanonicalTargetMaterial,
  generateBusinessClaimTargetContext,
} from '../src/submissions/business-claim-target-context';

const entityId = '10000000-0000-4000-8000-000000000001';
const claim: BusinessClaimReviewProjection = {
  targetType: 'entity',
  targetId: entityId,
  claimantRole: 'owner',
  requestedScopes: ['representative_relationship'],
  verification: {
    method: 'official_domain_email',
    officialDomain: 'merchant.example',
    protectedContactPresent: true,
    officialWebsiteUrl: 'https://merchant.example/account',
    officialSocialUrl: null,
    assistedVerifierReferencePresent: true,
    privateProofPresent: true,
  },
  proposedChanges: {
    entity: null,
    location: null,
    paymentProposals: null,
  },
  authorityStatement: 'PRIVATE AUTHORITY VALUE',
  evidenceLinks: [
    {
      url: 'https://evidence.example/private-reference',
      observedAt: '2026-07-14',
      summary: 'Private review reference.',
    },
  ],
};

const material: BusinessClaimCanonicalTargetMaterial = {
  targetType: 'entity',
  targetId: entityId,
  entity: {
    id: entityId,
    entityType: 'online_service',
    name: 'Merchant Example',
    slug: 'merchant-example',
    legalName: 'Merchant Example Incorporated',
    websiteUrl: 'https://www.merchant.example/',
    countryCode: 'JP',
    entityStatus: 'active',
    visibility: 'public',
    updatedAt: '2026-07-14T00:00:00.000Z',
  },
  location: null,
  claims: [],
};

const result = await generateBusinessClaimTargetContext(
  claim,
  {
    async loadTarget() {
      return material;
    },
  },
  new Date('2026-07-14T03:00:00.000Z'),
);

if (result.target.canonicalPath !== '/service/merchant-example') {
  throw new Error('Business Claim target context did not derive the canonical service path.');
}
if (result.identityComparisons.officialDomain !== 'match') {
  throw new Error('Business Claim target context did not compare the official domain safely.');
}
if (result.coverage.absenceIsConclusive !== false) {
  throw new Error('Business Claim target context must keep absence non-conclusive.');
}

const serialized = JSON.stringify(result);
for (const forbidden of [
  'PRIVATE AUTHORITY VALUE',
  'private-reference',
  'protectedContactPresent',
  'assistedVerifierReferencePresent',
  'privateProofPresent',
  'statusSecret',
]) {
  if (serialized.includes(forbidden)) {
    throw new Error(`Business Claim target context exposed protected material: ${forbidden}`);
  }
}

console.log('P5-04C business Claim target context is valid.');
