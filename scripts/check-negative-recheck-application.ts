import { negativeRecheckApplicationProjectionSchema } from '../src/admin/submissions/negative-recheck-application';
import {
  authorizeNegativeRecheckApplicationRead,
  readNegativeRecheckApplicationAuthorizationPolicy,
} from '../src/admin/submissions/negative-recheck-application-authorization';

const applicationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000001';
const eventId = '30000000-0000-4000-8000-000000000001';
const evidenceId = '40000000-0000-4000-8000-000000000001';
const claimId = '50000000-0000-4000-8000-000000000001';
const timestamp = '2026-07-18T08:00:00.000Z';

negativeRecheckApplicationProjectionSchema.parse({
  schemaVersion: 'negative-recheck-application-projection-v1',
  generatedAt: timestamp,
  application: {
    applicationId,
    submissionId,
    submissionType: 'problem_report',
    sourceDecisionEventId: eventId,
    applicationStatus: 'committed',
    publicationStatus: 'pending',
    receiptKind: 'submission_event',
    receiptEventId: eventId,
  },
  signal: {
    status: 'active',
    decisionEventId: eventId,
    evidenceId,
    claimId,
    signalAt: timestamp,
    claimStatus: 'confirmed',
    claimVisibility: 'public',
    nextReviewAt: null,
    queueProjection: {
      queueReason: 'negative_evidence',
      recommendedAction: 'review',
      dueAt: timestamp,
      daysUntilReview: 0,
      priority: 5,
    },
    resolution: null,
  },
});

if (
  negativeRecheckApplicationProjectionSchema.safeParse({
    schemaVersion: 'negative-recheck-application-projection-v1',
    generatedAt: timestamp,
    application: {
      applicationId,
      submissionId,
      submissionType: 'problem_report',
      sourceDecisionEventId: eventId,
      applicationStatus: 'committed',
      publicationStatus: 'pending',
      receiptKind: 'submission_event',
      receiptEventId: eventId,
    },
    signal: {
      status: 'active',
      decisionEventId: eventId,
      evidenceId,
      claimId,
      signalAt: timestamp,
      claimStatus: 'confirmed',
      claimVisibility: 'public',
      nextReviewAt: null,
      queueProjection: null,
      resolution: null,
      evidenceSummary: 'private material',
      reviewerNote: 'private material',
      sourceUrl: 'https://example.test/private',
    },
  }).success
) {
  throw new Error('Negative recheck projection accepted private Evidence or reviewer material.');
}

const policy = readNegativeRecheckApplicationAuthorizationPolicy({
  CPM_ADMIN_NEGATIVE_RECHECK_APPLICATION_SUBJECTS: JSON.stringify(['negative-recheck-operator']),
});
const context = authorizeNegativeRecheckApplicationRead(
  {
    actorId: 'cloudflare-access:negative-recheck-operator',
    actorType: 'human',
    subject: 'negative-recheck-operator',
    email: 'operator@example.com',
  },
  policy,
);
if (!context.capabilities.includes('submission:negative-recheck-application:read')) {
  throw new Error('Negative recheck application authorization did not grant the exact capability.');
}

console.log('Negative recheck application checks passed.');
