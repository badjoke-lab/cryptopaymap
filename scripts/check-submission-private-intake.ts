import type { SubmissionContactProtector } from '../src/submissions/contact-protection';
import { createInMemorySubmissionPersistenceBackend } from '../src/submissions/in-memory-persistence';
import { createSubmissionPrivateIntakeService } from '../src/submissions/intake-service';
import { createHmacSubmissionStatusSecretProvider } from '../src/submissions/status-secret-provider';

const requestId = '20000000-0000-4000-8000-000000000001';
const receivedAt = new Date('2026-07-09T12:00:00.000Z');
const persistence = createInMemorySubmissionPersistenceBackend();
const contactProtector: SubmissionContactProtector = {
  async protectEmail() {
    return {
      encryptedEmail: 'ciphertext-envelope',
      emailHash: 'c'.repeat(64),
      retentionUntil: null,
    };
  },
};
const intake = createSubmissionPrivateIntakeService({
  persistence,
  statusSecrets: createHmacSubmissionStatusSecretProvider(new Uint8Array(32).fill(7)),
  contactProtector,
  generateSubmissionId: () => '10000000-0000-4000-8000-000000000001',
});
const raw = {
  schemaVersion: 'submission-common-v1',
  submissionType: 'suggest',
  targetType: null,
  targetId: null,
  relationship: 'customer',
  contact: {
    email: 'person@example.test',
    contactAllowed: true,
  },
  evidenceLinks: [],
  originalPayload: { name: 'Example Merchant' },
  acknowledgements: {
    privacyNoticeAccepted: true,
    submissionTermsAccepted: true,
  },
};

const committed = await intake.submit(requestId, raw, receivedAt);
const replayed = await intake.submit(requestId, raw, receivedAt);

if (
  committed.state !== 'committed' ||
  replayed.state !== 'replayed' ||
  committed.publicId !== replayed.publicId ||
  committed.statusSecret !== replayed.statusSecret ||
  persistence.snapshot().length !== 1
) {
  throw new Error('Private submission intake contract check produced an invalid result.');
}

console.log('Private submission intake contract checks passed.');
