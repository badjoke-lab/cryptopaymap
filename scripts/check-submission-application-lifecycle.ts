import {
  submissionApplicationLifecycleProjectionSchema,
  submissionApplicationTransitionOperationValues,
  submissionApplicationTransitionRequestSchema,
  submissionApplicationTransitionReceiptSchema,
} from '../src/admin/submissions/application-lifecycle';
import {
  authorizeSubmissionApplicationLifecycleRead,
  authorizeSubmissionApplicationLifecycleTransition,
  readSubmissionApplicationLifecycleAuthorizationPolicy,
} from '../src/admin/submissions/application-lifecycle-authorization';

const applicationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000001';
const sourceDecisionEventId = '30000000-0000-4000-8000-000000000001';
const requestId = '40000000-0000-4000-8000-000000000001';
const receiptId = '50000000-0000-4000-8000-000000000001';
const registeredEventId = '60000000-0000-4000-8000-000000000001';
const timestamp = '2026-07-18T06:00:00.000Z';

const operations = {
  commit_application: {
    applicationStatus: 'pending',
    publicationStatus: 'blocked',
    receipt: { kind: 'submission_event', ids: [receiptId] },
  },
  fail_application: {
    applicationStatus: 'pending',
    publicationStatus: 'blocked',
    receipt: null,
  },
  retry_application: {
    applicationStatus: 'failed',
    publicationStatus: 'blocked',
    receipt: null,
  },
  commit_publication: {
    applicationStatus: 'committed',
    publicationStatus: 'pending',
    receipt: { kind: 'export_release_decision', ids: [receiptId] },
  },
  fail_publication: {
    applicationStatus: 'committed',
    publicationStatus: 'pending',
    receipt: null,
  },
  retry_publication: {
    applicationStatus: 'committed',
    publicationStatus: 'failed',
    receipt: null,
  },
} as const;

for (const operation of submissionApplicationTransitionOperationValues) {
  const expected = operations[operation];
  submissionApplicationTransitionRequestSchema.parse({
    schemaVersion: 'submission-application-transition-v1',
    requestId,
    operation,
    expectedApplicationStatus: expected.applicationStatus,
    expectedPublicationStatus: expected.publicationStatus,
    expectedUpdatedAt: timestamp,
    receipt: expected.receipt,
  });
}

submissionApplicationLifecycleProjectionSchema.parse({
  applicationId,
  submissionId,
  submissionType: 'problem_report',
  sourceDecisionKind: 'problem_correction_handoff',
  sourceDecisionEventId,
  applicationKind: 'problem_correction',
  applicationStatus: 'pending',
  publicationStatus: 'blocked',
  applicationReceipt: null,
  publicationReceipt: null,
  registeredAt: timestamp,
  updatedAt: timestamp,
  events: [
    {
      eventId: registeredEventId,
      action: 'registered',
      fromApplicationStatus: null,
      toApplicationStatus: 'pending',
      fromPublicationStatus: null,
      toPublicationStatus: 'blocked',
      createdAt: timestamp,
    },
  ],
});

submissionApplicationTransitionReceiptSchema.parse({
  state: 'committed',
  transitionEventId: requestId,
  applicationId,
  action: 'application_committed',
  fromApplicationStatus: 'pending',
  toApplicationStatus: 'committed',
  fromPublicationStatus: 'blocked',
  toPublicationStatus: 'pending',
  receipt: { kind: 'submission_event', ids: [receiptId] },
  changedAt: timestamp,
});

if (
  submissionApplicationTransitionRequestSchema.safeParse({
    schemaVersion: 'submission-application-transition-v1',
    requestId,
    operation: 'commit_publication',
    expectedApplicationStatus: 'committed',
    expectedPublicationStatus: 'pending',
    expectedUpdatedAt: timestamp,
    receipt: { kind: 'submission_event', ids: [receiptId] },
  }).success
) {
  throw new Error('Publication transition accepted a non-release receipt.');
}

const policy = readSubmissionApplicationLifecycleAuthorizationPolicy({
  CPM_ADMIN_SUBMISSION_APPLICATION_READ_SUBJECTS: JSON.stringify(['lifecycle-reader']),
  CPM_ADMIN_SUBMISSION_APPLICATION_TRANSITION_SUBJECTS: JSON.stringify([
    'lifecycle-transitioner',
  ]),
});
const reader = authorizeSubmissionApplicationLifecycleRead(
  {
    actorId: 'cloudflare-access:lifecycle-reader',
    actorType: 'human',
    subject: 'lifecycle-reader',
    email: 'reader@example.com',
  },
  policy,
);
const transitioner = authorizeSubmissionApplicationLifecycleTransition(
  {
    actorId: 'cloudflare-access:lifecycle-transitioner',
    actorType: 'human',
    subject: 'lifecycle-transitioner',
    email: 'transitioner@example.com',
  },
  policy,
);
if (!reader.capabilities.includes('submission:application:read')) {
  throw new Error('Lifecycle read authorization did not grant the exact capability.');
}
if (!transitioner.capabilities.includes('submission:application:transition')) {
  throw new Error('Lifecycle transition authorization did not grant the exact capability.');
}

console.log('Submission application lifecycle checks passed.');
