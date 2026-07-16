import { createReviewFollowupHandler } from '../functions/admin/api/review-followup/[submissionId]';
import { createDrizzleReviewFollowupBackend } from '../src/admin/submissions/drizzle-review-followup-backend';
import {
  authorizeSubmissionReviewFollowup,
  readSubmissionReviewFollowupAuthorizationPolicy,
} from '../src/admin/submissions/review-followup-authorization';
import {
  applySubmissionReviewFollowup,
  reviewFollowupReceiptSchema,
  reviewFollowupRequestSchema,
} from '../src/admin/submissions/review-followup';

reviewFollowupRequestSchema.parse({
  schemaVersion: 'submission-review-followup-v1',
  requestId: '10000000-0000-4000-8000-000000000001',
  submissionType: 'payment_report',
  action: 'request_information',
  expectedStatus: 'in_review',
  expectedUpdatedAt: '2026-07-16T01:00:00.000Z',
  requestedAction: 'Provide a recent official source.',
  publicMessage: 'Please provide a recent official source.',
});

reviewFollowupRequestSchema.parse({
  schemaVersion: 'submission-review-followup-v1',
  requestId: '10000000-0000-4000-8000-000000000002',
  submissionType: 'photos',
  action: 'place_on_hold',
  expectedStatus: 'in_review',
  expectedUpdatedAt: '2026-07-16T01:00:00.000Z',
  holdDays: 30,
  holdReason: 'Awaiting official confirmation.',
  requiredAction: 'Provide an official source.',
  publicMessage: 'Review is paused while confirmation is requested.',
});

reviewFollowupReceiptSchema.parse({
  state: 'committed',
  submissionId: '20000000-0000-4000-8000-000000000001',
  submissionType: 'suggest',
  action: 'resume_from_hold',
  fromStatus: 'on_hold',
  toStatus: 'in_review',
  requestedAction: null,
  publicMessage: null,
  holdDays: null,
  nextReviewAt: null,
  requiredAction: null,
  changedAt: '2026-07-16T01:01:00.000Z',
});

for (const executable of [
  applySubmissionReviewFollowup,
  readSubmissionReviewFollowupAuthorizationPolicy,
  authorizeSubmissionReviewFollowup,
  createDrizzleReviewFollowupBackend,
  createReviewFollowupHandler,
]) {
  if (typeof executable !== 'function') {
    throw new Error('Submission review follow-up boundary is not executable.');
  }
}

console.log('Submission review follow-up schemas and services passed.');
