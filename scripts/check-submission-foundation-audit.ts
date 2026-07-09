import { auditHistoryItemSchema } from '../src/admin/audit-history/contract';
import { submissionEventAuditItem } from '../src/admin/audit-history/normalizers';
import { createInMemorySubmissionPersistenceBackend } from '../src/submissions/in-memory-persistence';
import { createSubmissionPrivateIntakeService } from '../src/submissions/intake-service';
import { createHmacSubmissionStatusSecretProvider } from '../src/submissions/status-secret-provider';

const eventItem = auditHistoryItemSchema.parse(
  submissionEventAuditItem({
    id: '10000000-0000-4000-8000-000000000001',
    publicId: 'CPM-S-2026-000123',
    submissionType: 'suggest',
    fromStatus: 'triage',
    toStatus: 'in_review',
    action: 'start_review',
    reasonCode: 'triage_complete',
    actorId: 'reviewer:contract-check',
    actorType: 'reviewer',
    createdAt: new Date('2026-07-09T12:00:00.000Z'),
  }),
);

const persistence = createInMemorySubmissionPersistenceBackend();
const intake = createSubmissionPrivateIntakeService({
  persistence,
  statusSecrets: createHmacSubmissionStatusSecretProvider(new Uint8Array(32).fill(7)),
  contactProtector: {
    async protectEmail() {
      return {
        encryptedEmail: 'ciphertext-envelope',
        emailHash: 'c'.repeat(64),
        retentionUntil: null,
      };
    },
  },
  generateSubmissionId: () => '30000000-0000-4000-8000-000000000001',
});

const raw = {
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
};
const committed = await intake.submit(
  '20000000-0000-4000-8000-000000000001',
  raw,
  new Date('2026-07-09T12:00:00.000Z'),
);
const replayed = await intake.submit(
  '20000000-0000-4000-8000-000000000001',
  raw,
  new Date('2026-07-09T12:00:00.000Z'),
);

if (
  eventItem.domain !== 'submission' ||
  eventItem.target.id !== 'CPM-S-2026-000123' ||
  eventItem.actorType !== 'human' ||
  committed.state !== 'committed' ||
  replayed.state !== 'replayed' ||
  persistence.snapshot().length !== 1
) {
  throw new Error('Submission foundation Audit check produced an invalid result.');
}

console.log('Submission foundation Audit checks passed.');
