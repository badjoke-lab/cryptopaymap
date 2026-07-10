import { applySuggestReviewTransition } from '../src/admin/submissions/transitions';

const submissionId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const expectedUpdatedAt = '2026-07-10T02:00:00.000Z';
const changedAt = new Date('2026-07-10T02:05:00.000Z');

const receipt = await applySuggestReviewTransition(
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
        workflowStatus: 'received',
        updatedAt: expectedUpdatedAt,
      };
    },
    async readEvent() {
      return null;
    },
    async commitTransition(command) {
      if (
        command.eventId !== requestId ||
        command.expectedStatus !== 'received' ||
        command.toStatus !== 'triage' ||
        command.eventAction !== 'submission_triage_started'
      ) {
        throw new Error('Unexpected Suggest review transition command.');
      }
    },
  },
  submissionId,
  {
    schemaVersion: 'suggest-review-transition-v1',
    requestId,
    action: 'begin_triage',
    expectedStatus: 'received',
    expectedUpdatedAt,
  },
  changedAt,
);

if (
  receipt.state !== 'committed' ||
  receipt.fromStatus !== 'received' ||
  receipt.toStatus !== 'triage'
) {
  throw new Error('Suggest review transition runtime check produced an invalid receipt.');
}

console.log('Suggest review transition checks passed.');
