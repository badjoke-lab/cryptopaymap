import {
  requestSuggestSubmissionInformation,
  suggestInformationRequestReceiptSchema,
} from '../src/admin/submissions/information-request';
import {
  parseSubmissionInformationRequestEventPayload,
  serializeSubmissionInformationRequestEventPayload,
} from '../src/submissions/information-request-contract';

const submissionId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const expectedUpdatedAt = '2026-07-10T03:00:00.000Z';
const changedAt = new Date('2026-07-10T03:05:00.000Z');
const requestedAction = 'Please confirm which network is used for USDT payment.';
const publicMessage = 'We need the payment network before review can continue.';

const serialized = serializeSubmissionInformationRequestEventPayload({
  schemaVersion: 'suggest-information-request-event-v1',
  requestedAction,
  publicMessage,
});
const parsed = parseSubmissionInformationRequestEventPayload(serialized);
if (parsed?.requestedAction !== requestedAction || parsed.publicMessage !== publicMessage) {
  throw new Error('Information-request event envelope did not round-trip safely.');
}

const receipt = await requestSuggestSubmissionInformation(
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
    async readRequestEvent() {
      return null;
    },
    async commitRequest(command) {
      const payload = parseSubmissionInformationRequestEventPayload(command.internalNote);
      if (
        command.eventId !== requestId ||
        payload?.requestedAction !== requestedAction ||
        payload.publicMessage !== publicMessage
      ) {
        throw new Error('Unexpected Suggest information-request commit command.');
      }
    },
  },
  submissionId,
  {
    schemaVersion: 'suggest-information-request-v1',
    requestId,
    expectedStatus: 'in_review',
    expectedUpdatedAt,
    requestedAction,
    publicMessage,
  },
  changedAt,
);

suggestInformationRequestReceiptSchema.parse(receipt);
if (receipt.state !== 'committed' || receipt.toStatus !== 'needs_information') {
  throw new Error('Suggest information-request runtime check produced an invalid receipt.');
}

console.log('Suggest information-request checks passed.');
