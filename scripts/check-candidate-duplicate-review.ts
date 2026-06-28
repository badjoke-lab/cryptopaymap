import {
  loadCandidateDuplicateReview,
  type CandidateDuplicateReviewBackend,
  type CandidateDuplicateReviewData,
} from '../src/admin/candidates/duplicate-review';

const groupId = '10000000-0000-4000-8000-000000000001';
const leftId = '20000000-0000-4000-8000-000000000001';
const rightId = '20000000-0000-4000-8000-000000000002';
const asOf = new Date('2026-06-29T03:00:00.000Z');
const context = {
  actorId: 'cloudflare-access:runtime-reviewer',
  actorType: 'human' as const,
  capabilities: ['candidate:read' as const],
};

const detail: CandidateDuplicateReviewData = {
  group: {
    id: groupId,
    status: 'open',
    updatedAt: '2026-06-28T01:00:00.000Z',
    resolvedAt: null,
  },
  members: [leftId, rightId].map((id, index) => ({
    id,
    name: index === 0 ? 'Runtime Left' : 'Runtime Right',
    candidateType: 'physical_place',
    status: 'new',
    priority: 500,
    firstSeenAt: '2026-06-01T00:00:00.000Z',
    lastSeenAt: '2026-06-28T00:00:00.000Z',
    updatedAt: '2026-06-28T01:00:00.000Z',
    sourceTypes: ['legacy_import'],
    sourceCount: 1,
    linkedEntity: false,
    linkedLocation: false,
  })),
  signals: [
    {
      id: '30000000-0000-4000-8000-000000000001',
      leftCandidateId: leftId,
      rightCandidateId: rightId,
      reason: 'shared_osm_identity',
      strength: 'strong',
      createdAt: '2026-06-28T01:00:00.000Z',
    },
  ],
  signalsTruncated: false,
};

const backend: CandidateDuplicateReviewBackend = {
  async loadGroup() {
    return detail;
  },
};
const response = await loadCandidateDuplicateReview(context, backend, groupId, asOf);
const serialized = JSON.stringify(response);
for (const forbidden of ['rawPayload', 'normalizedRecord', 'actorId', 'resolutionNote']) {
  if (serialized.includes(forbidden)) {
    throw new Error(`Duplicate review leaked forbidden marker: ${forbidden}`);
  }
}

let backendCalled = false;
try {
  await loadCandidateDuplicateReview(
    { ...context, capabilities: [] },
    {
      async loadGroup() {
        backendCalled = true;
        return detail;
      },
    },
    groupId,
    asOf,
  );
  throw new Error('Unauthorized duplicate review was accepted.');
} catch (error) {
  if (backendCalled) {
    throw new Error('Unauthorized duplicate review reached the backend.', { cause: error });
  }
}

console.log('Candidate duplicate review checks passed.');
