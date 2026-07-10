import { placeSuggestSubmissionOnHold, suggestHoldReceiptSchema } from '../src/admin/submissions/hold';
import {
  parseSubmissionHoldEventPayload,
  serializeSubmissionHoldEventPayload,
} from '../src/submissions/hold-contract';

const submissionId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const expectedUpdatedAt = '2026-07-10T05:00:00.000Z';
const changedAt = new Date('2026-07-10T05:05:00.000Z');
const holdReason = 'Awaiting a scheduled merchant payment-policy update.';
const requiredAction = 'No submitter action is required before the next review.';
const publicMessage = 'Review is paused until the next scheduled verification date.';

const serialized = serializeSubmissionHoldEventPayload({
  schemaVersion: 'suggest-hold-event-v1',
  holdDays: 30,
  nextReviewAt: '2026-08-09T05:05:00.000Z',
  holdReason,
  requiredAction,
  publicMessage,
});
const parsed = parseSubmissionHoldEventPayload(serialized);
if (
  parsed?.holdDays !== 30 ||
  parsed.nextReviewAt !== '2026-08-09T05:05:00.000Z' ||
  parsed.requiredAction !== requiredAction
) {
  throw new Error('Hold event envelope did not round-trip safely.');
}

const receipt = await placeSuggestSubmissionOnHold(
  {
    actorId: 'cloudflare-access:reviewer-subject',
    actorType: 'human',
    capabilities: ['submission:transition'],
  },
  {
    async readState() {
      return {
        submissionId,
        submissionType: 'suggest',
        workflowStatus: 'in_review',
        updatedAt: expectedUpdatedAt,
      };
    },
    async readHoldEvent() {
      return null;
    },
    async commitHold(command) {
      const payload = parseSubmissionHoldEventPayload(command.internalNote);
      if (
        command.eventId !== requestId ||
        payload?.holdDays !== 30 ||
        payload.nextReviewAt !== '2026-08-09T05:05:00.000Z'
      ) {
        throw new Error('Unexpected Suggest Hold commit command.');
      }
    },
  },
  submissionId,
  {
    schemaVersion: 'suggest-hold-v1',
    requestId,
    expectedStatus: 'in_review',
    expectedUpdatedAt,
    holdDays: 30,
    holdReason,
    requiredAction,
    publicMessage,
  },
  changedAt,
);

suggestHoldReceiptSchema.parse(receipt);
if (receipt.state !== 'committed' || receipt.toStatus !== 'on_hold') {
  throw new Error('Suggest Hold runtime check produced an invalid receipt.');
}

console.log('Suggest Hold checks passed.');
