import {
  applySubmissionReviewEntry,
  reviewEntryReceiptSchema,
  reviewEntryRequestSchema,
} from '../src/admin/submissions/review-entry';
import {
  authorizeSubmissionReviewEntry,
  readSubmissionReviewEntryAuthorizationPolicy,
} from '../src/admin/submissions/review-entry-authorization';
import { createDrizzleReviewEntryBackend } from '../src/admin/submissions/drizzle-review-entry-backend';
import { createReviewEntryHandler } from '../functions/admin/api/review-entry/[submissionId]';

reviewEntryRequestSchema.parse({
  schemaVersion: 'submission-review-entry-v1',
  requestId: '10000000-0000-4000-8000-000000000001',
  submissionType: 'payment_report',
  action: 'begin_triage',
  expectedStatus: 'received',
  expectedUpdatedAt: '2026-07-15T15:00:00.000Z',
});

reviewEntryReceiptSchema.parse({
  state: 'committed',
  submissionId: '20000000-0000-4000-8000-000000000001',
  submissionType: 'photos',
  fromStatus: 'triage',
  toStatus: 'in_review',
  action: 'begin_review',
  changedAt: '2026-07-15T15:01:00.000Z',
});

for (const executable of [
  applySubmissionReviewEntry,
  readSubmissionReviewEntryAuthorizationPolicy,
  authorizeSubmissionReviewEntry,
  createDrizzleReviewEntryBackend,
  createReviewEntryHandler,
]) {
  if (typeof executable !== 'function') {
    throw new Error('Submission review-entry boundary is not executable.');
  }
}

console.log('Submission review-entry schemas and services passed.');
