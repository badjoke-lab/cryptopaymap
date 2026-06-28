import {
  createCandidateDuplicateDecisionService,
  type CandidateDuplicateDecisionInput,
} from '../src/admin/candidates/duplicate-decision';
import { InMemoryDuplicateDecisionBackend } from '../src/admin/candidates/in-memory-duplicate-decision-backend';

const groupId = '10000000-0000-4000-8000-000000000001';
const primaryId = '20000000-0000-4000-8000-000000000001';
const duplicateId = '20000000-0000-4000-8000-000000000002';
const groupUpdatedAt = '2026-06-29T01:00:00.000Z';
const decidedAt = '2026-06-29T02:00:00.000Z';
const context = {
  requestId: '30000000-0000-4000-8000-000000000001',
  actorId: 'admin:runtime-reviewer',
  actorType: 'human' as const,
  capabilities: ['candidate:resolve' as const],
};
const input: CandidateDuplicateDecisionInput = {
  duplicateGroupId: groupId,
  action: 'confirm_duplicate',
  primaryCandidateId: primaryId,
  memberCandidateIds: [duplicateId, primaryId],
  reasonCode: 'same_osm_identity',
  note: 'Runtime duplicate decision.',
  expectedGroupUpdatedAt: groupUpdatedAt,
  decidedAt,
};

function createBackend() {
  return new InMemoryDuplicateDecisionBackend({
    groups: [{ id: groupId, status: 'open', updatedAt: groupUpdatedAt }],
    candidates: [
      {
        id: primaryId,
        duplicateGroupId: groupId,
        candidateType: 'physical_place',
        candidateStatus: 'triaged',
        updatedAt: groupUpdatedAt,
      },
      {
        id: duplicateId,
        duplicateGroupId: groupId,
        candidateType: 'physical_place',
        candidateStatus: 'new',
        updatedAt: groupUpdatedAt,
      },
    ],
  });
}

const backend = createBackend();
const service = createCandidateDuplicateDecisionService(backend);
const receipt = await service.decide(context, input);
if (receipt.groupStatus !== 'resolved' || receipt.state !== 'committed') {
  throw new Error('Candidate duplicate decision did not commit the expected group state.');
}
const snapshot = backend.snapshot();
if (
  snapshot.candidates.find((candidate) => candidate.id === primaryId)?.candidateStatus !==
  'triaged'
) {
  throw new Error('Candidate duplicate decision changed the selected primary Candidate.');
}
if (
  snapshot.candidates.find((candidate) => candidate.id === duplicateId)?.candidateStatus !==
  'duplicate'
) {
  throw new Error('Candidate duplicate decision did not mark the non-primary Candidate.');
}
const replay = await service.decide(structuredClone(context), structuredClone(input));
if (replay.state !== 'replayed' || backend.snapshot().decisions !== 1) {
  throw new Error('Candidate duplicate decision replay was not idempotent.');
}

let backendCalled = false;
try {
  await createCandidateDuplicateDecisionService({
    async commitDecision() {
      backendCalled = true;
      return receipt;
    },
  }).decide({ ...context, capabilities: [] }, input);
  throw new Error('Unauthorized duplicate decision was accepted.');
} catch (error) {
  if (backendCalled) {
    throw new Error('Unauthorized duplicate decision reached the backend.', { cause: error });
  }
}

console.log('Candidate duplicate decision checks passed.');
