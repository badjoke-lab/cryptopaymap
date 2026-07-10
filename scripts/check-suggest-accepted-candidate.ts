import {
  acceptSuggestSubmissionAsCandidate,
  suggestAcceptedCandidateReceiptSchema,
} from '../src/admin/submissions/accepted-candidate';
import { parseSuggestAcceptedCandidateEventPayload } from '../src/submissions/accepted-candidate-contract';

const submissionId = '10000000-0000-4000-8000-000000000001';
const sourceId = '30000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const expectedUpdatedAt = '2026-07-10T06:00:00.000Z';
const payloadUpdatedAt = '2026-07-10T05:55:00.000Z';
const decidedAt = new Date('2026-07-10T06:05:00.000Z');

const receipt = await acceptSuggestSubmissionAsCandidate(
  {
    actorId: 'cloudflare-access:candidate-reviewer',
    actorType: 'human',
    capabilities: ['submission:candidate:create'],
  },
  {
    async readState() {
      return {
        submissionId,
        publicId: 'CPM-S-2026-000001',
        submissionType: 'suggest',
        workflowStatus: 'in_review',
        updatedAt: expectedUpdatedAt,
        priority: 25,
        normalizedPayload: {
          suggestionKind: 'online_service',
          entityType: 'online_service',
          entity: {
            name: 'Example Hosting',
            legalName: null,
            websiteUrl: 'https://hosting.example/',
            countryCode: 'US',
          },
          place: null,
          categories: [],
          paymentProposals: [
            {
              assetSlug: 'usdc',
              networkSlug: null,
              routeType: 'processor_checkout',
              paymentMethod: 'processor_checkout',
              processor: { name: 'Example Processor', websiteUrl: null },
              contractAddress: null,
              howToPay: 'Choose crypto during hosted checkout.',
              restrictions: null,
              isPrimary: true,
            },
          ],
          observedAt: '2026-07-01',
          relationship: 'customer',
          evidenceLinks: [],
        },
        payloadUpdatedAt,
      };
    },
    async readDecisionEvent() {
      return null;
    },
    async commitAcceptedCandidate(command) {
      const payload = parseSuggestAcceptedCandidateEventPayload(command.internalNote);
      if (
        command.eventId !== requestId ||
        command.sourceId !== sourceId ||
        command.expectedPayloadUpdatedAt.toISOString() !== payloadUpdatedAt ||
        payload?.candidateId !== command.candidateId ||
        payload.sourceRecordId !== command.sourceRecordId ||
        command.contentHash.length !== 64
      ) {
        throw new Error('Unexpected accepted-as-Candidate command.');
      }
      const serializedProjection = JSON.stringify(command.normalizedPayload);
      if (
        serializedProjection.includes('encryptedEmail') ||
        serializedProjection.includes('originalPayload')
      ) {
        throw new Error('Private Submission material entered Candidate creation command.');
      }
    },
  },
  submissionId,
  sourceId,
  {
    schemaVersion: 'suggest-accepted-candidate-v1',
    requestId,
    expectedStatus: 'in_review',
    expectedUpdatedAt,
    reasonCode: 'useful_but_incomplete',
    note: 'Useful lead that requires more verification.',
  },
  decidedAt,
);

suggestAcceptedCandidateReceiptSchema.parse(receipt);
if (receipt.state !== 'committed' || receipt.resolution !== 'accepted_as_candidate') {
  throw new Error('Accepted-as-Candidate runtime check produced an invalid receipt.');
}

console.log('Suggest accepted-as-Candidate checks passed.');
