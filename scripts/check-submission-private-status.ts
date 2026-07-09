import { createInMemorySubmissionPersistenceBackend } from '../src/submissions/in-memory-persistence';
import { createSubmissionPrivateIntakeService } from '../src/submissions/intake-service';
import { createSubmissionPrivateStatusService } from '../src/submissions/private-status-service';
import { createHmacSubmissionStatusSecretProvider } from '../src/submissions/status-secret-provider';

const persistence = createInMemorySubmissionPersistenceBackend();
const intake = createSubmissionPrivateIntakeService({
  persistence,
  statusSecrets: createHmacSubmissionStatusSecretProvider(new Uint8Array(32).fill(7)),
  contactProtector: {
    async protectEmail() {
      throw new Error('contact protection must not run for no-contact fixture');
    },
  },
  generateSubmissionId: () => '10000000-0000-4000-8000-000000000001',
});
const receipt = await intake.submit(
  '20000000-0000-4000-8000-000000000001',
  {
    schemaVersion: 'submission-common-v1',
    submissionType: 'suggest',
    targetType: null,
    targetId: null,
    relationship: 'customer',
    contact: null,
    evidenceLinks: [],
    originalPayload: { name: 'Example Merchant' },
    acknowledgements: {
      privacyNoticeAccepted: true,
      submissionTermsAccepted: true,
    },
  },
  new Date('2026-07-09T12:00:00.000Z'),
);
const status = await createSubmissionPrivateStatusService(persistence).read(
  receipt.publicId,
  receipt.statusSecret,
);

if (
  status.publicId !== receipt.publicId ||
  status.statusLabel !== 'received' ||
  status.permittedActions.join(',') !== 'withdraw,rotate_status_secret'
) {
  throw new Error('Private Submission status read check produced an invalid result.');
}

console.log('Private Submission status read checks passed.');
