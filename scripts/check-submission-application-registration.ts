import {
  submissionApplicationRegistrationReceiptSchema,
  submissionApplicationRegistrationRequestSchema,
  submissionApplicationSourceDecisionKindValues,
} from '../src/admin/submissions/application-registration';
import {
  authorizeSubmissionApplicationRegistration,
  readSubmissionApplicationRegistrationAuthorizationPolicy,
} from '../src/admin/submissions/application-registration-authorization';

const submissionId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const sourceDecisionEventId = '30000000-0000-4000-8000-000000000001';
const applicationId = '40000000-0000-4000-8000-000000000001';
const expectedSubmissionUpdatedAt = '2026-07-17T06:00:00.000Z';

for (const sourceDecisionKind of submissionApplicationSourceDecisionKindValues) {
  submissionApplicationRegistrationRequestSchema.parse({
    schemaVersion: 'submission-application-registration-v1',
    requestId,
    sourceDecisionKind,
    sourceDecisionEventId,
    expectedSubmissionUpdatedAt,
  });
}

submissionApplicationRegistrationReceiptSchema.parse({
  state: 'committed',
  applicationId,
  submissionId,
  submissionType: 'payment_report',
  sourceDecisionKind: 'positive_payment_evidence',
  sourceDecisionEventId,
  applicationKind: 'report_evidence',
  applicationStatus: 'committed',
  publicationStatus: 'pending',
  applicationReceipt: {
    kind: 'submission_event',
    ids: [sourceDecisionEventId],
  },
  publicationReceipt: null,
  registeredAt: '2026-07-17T06:05:00.000Z',
});

if (
  submissionApplicationRegistrationRequestSchema.safeParse({
    schemaVersion: 'submission-application-registration-v1',
    requestId,
    sourceDecisionKind: 'positive_payment_evidence',
    sourceDecisionEventId,
    expectedSubmissionUpdatedAt,
    applicationStatus: 'committed',
  }).success
) {
  throw new Error('Application registration request accepted a client-selected lifecycle state.');
}

const policy = readSubmissionApplicationRegistrationAuthorizationPolicy({
  CPM_ADMIN_SUBMISSION_APPLICATION_REGISTRATION_SUBJECTS: JSON.stringify(['application-reviewer']),
});
const context = authorizeSubmissionApplicationRegistration(
  {
    actorId: 'cloudflare-access:application-reviewer',
    actorType: 'human',
    subject: 'application-reviewer',
    email: 'reviewer@example.com',
  },
  policy,
);
if (!context.capabilities.includes('submission:application:register')) {
  throw new Error('Application registration authorization did not grant the exact capability.');
}

console.log('Submission application registration checks passed.');
