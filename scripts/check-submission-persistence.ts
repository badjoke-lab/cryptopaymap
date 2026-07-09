import { getTableName } from 'drizzle-orm';
import {
  submissionContacts,
  submissionEvents,
  submissionPayloads,
  submissionPublicReferenceCounters,
  submissions,
} from '../src/db/schema';
import { createInMemorySubmissionPersistenceBackend } from '../src/submissions/in-memory-persistence';

const at = new Date('2026-07-09T12:00:00.000Z');
const backend = createInMemorySubmissionPersistenceBackend();
const publicId = await backend.allocatePublicReference(2026, at);

await backend.createSubmission({
  id: '10000000-0000-4000-8000-000000000001',
  intakeRequestId: '20000000-0000-4000-8000-000000000001',
  requestFingerprint: 'a'.repeat(64),
  publicId,
  submissionType: 'suggest',
  targetType: null,
  targetId: null,
  relationship: 'customer',
  statusTokenHash: `sha256:${'b'.repeat(64)}`,
  submittedAt: at,
  originalPayload: { name: 'Example Merchant' },
  contact: null,
  actorId: 'submitter:contract-check',
  actorType: 'submitter',
});

const tableNames = [
  getTableName(submissions),
  getTableName(submissionPayloads),
  getTableName(submissionContacts),
  getTableName(submissionEvents),
  getTableName(submissionPublicReferenceCounters),
];

if (
  publicId !== 'CPM-S-2026-000001' ||
  backend.snapshot()[0]?.workflowStatus !== 'received' ||
  tableNames.join(',') !==
    'submissions,submission_payloads,submission_contacts,submission_events,submission_public_reference_counters'
) {
  throw new Error('Submission persistence contract check produced an invalid result.');
}

console.log('Submission persistence contract checks passed.');
