import { createBusinessClaimPrivateIntakeService } from '../src/submissions/business-claim-intake-service';
import { createInMemorySubmissionPersistenceBackend } from '../src/submissions/in-memory-persistence';
import { createHmacSubmissionStatusSecretProvider } from '../src/submissions/status-secret-provider';

const persistence = createInMemorySubmissionPersistenceBackend();
const intake = createBusinessClaimPrivateIntakeService({
  persistence,
  statusSecrets: createHmacSubmissionStatusSecretProvider(new Uint8Array(32).fill(12)),
  contactProtector: {
    async protectEmail() {
      return {
        encryptedEmail: 'encrypted-contact',
        emailHash: 'f'.repeat(64),
        retentionUntil: null,
      };
    },
  },
  generateSubmissionId: () => '10000000-0000-4000-8000-000000000001',
});

const claim = {
  schemaVersion: 'submission-common-v1',
  submissionType: 'claim',
  targetType: 'entity',
  targetId: '30000000-0000-4000-8000-000000000001',
  relationship: 'owner_or_authorized_representative',
  contact: null,
  evidenceLinks: [],
  originalPayload: {
    schemaVersion: 'business-claim-v1',
    claimantRole: 'owner',
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
    authorityStatement: 'I own this business and request protected relationship review.',
  },
  acknowledgements: {
    privacyNoticeAccepted: true,
    submissionTermsAccepted: true,
  },
};

const requestId = '20000000-0000-4000-8000-000000000001';
const receivedAt = new Date('2026-07-13T00:00:00.000Z');
const committed = await intake.submit(requestId, claim, receivedAt);
const replayed = await intake.submit(requestId, claim, receivedAt);
const stored = persistence.snapshot()[0];

if (committed.state !== 'committed' || replayed.state !== 'replayed') {
  throw new Error('Business Claim private intake replay contract failed.');
}
if (!stored || persistence.snapshot().length !== 1 || stored.submissionType !== 'claim') {
  throw new Error('Business Claim private intake persistence contract failed.');
}
const normalized = JSON.stringify(stored.normalizedPayload);
if (
  normalized.includes('encrypted-contact') ||
  normalized.includes('private-authority-proof') ||
  normalized.includes('"officialContactEmail":') ||
  normalized.includes('"privateProofUrl":')
) {
  throw new Error('Business Claim normalized payload exposed a private value or key.');
}
if (stored.workflowStatus !== 'received') {
  throw new Error('Business Claim intake must remain in received review state.');
}

console.log('P5-04B business Claim private intake is valid.');
