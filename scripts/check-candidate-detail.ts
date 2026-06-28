import {
  loadCandidateDetail,
  type CandidateDetailBackend,
  type CandidateDetailData,
} from '../src/admin/candidates/detail';
import { projectCandidateSourceSnapshot } from '../src/admin/candidates/source-snapshot';

const candidateId = '00000000-0000-4000-8000-000000000001';
const asOf = new Date('2026-06-29T00:00:00.000Z');
const context = {
  actorId: 'cloudflare-access:runtime-reviewer',
  actorType: 'human' as const,
  capabilities: ['candidate:read' as const],
};

const snapshot = projectCandidateSourceSnapshot('physical_place', {
  rawRecord: { privateExtra: 'must not escape' },
  normalizedRecord: {
    legacyId: 'place-1',
    legacyPath: '/place/place-1',
    name: 'Runtime Cafe',
    addressLine: '1 Runtime Street',
    locality: 'Tokyo',
    region: null,
    postalCode: null,
    countryCode: 'JP',
    latitude: 35.68,
    longitude: 139.76,
    category: 'cafe',
    websiteUrl: 'https://example.test',
    osmType: 'node',
    osmId: '123',
    paymentTags: { 'payment:bitcoin': 'yes' },
    observedAt: '2026-06-28T00:00:00.000Z',
    sourceUrl: 'https://source.example.test/place-1',
    legacyVerificationLabel: null,
  },
});
if (snapshot === null || snapshot.kind !== 'physical_place') {
  throw new Error('Candidate detail snapshot projection failed.');
}

const detail: CandidateDetailData = {
  candidate: {
    id: candidateId,
    name: 'Runtime Cafe',
    candidateType: 'physical_place',
    status: 'new',
    priority: 900,
    firstSeenAt: '2026-06-01T00:00:00.000Z',
    lastSeenAt: '2026-06-28T00:00:00.000Z',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-28T01:00:00.000Z',
    duplicateSignal: false,
    duplicateGroupId: null,
    duplicateGroupStatus: null,
    linkedEntity: false,
    linkedLocation: false,
  },
  importOrigin: null,
  sources: [
    {
      id: '00000000-0000-4000-8000-000000000002',
      relationship: 'origin',
      sourceName: 'Runtime source',
      sourceType: 'legacy_import',
      sourceActive: true,
      sourceUrl: 'https://source.example.test/place-1',
      archiveUrl: null,
      observedAt: '2026-06-28T00:00:00.000Z',
      publishedAt: null,
      fetchedAt: '2026-06-28T00:01:00.000Z',
      license: null,
      snapshot,
    },
  ],
  sourcesTruncated: false,
};

const backend: CandidateDetailBackend = {
  async loadDetail() {
    return detail;
  },
};
const response = await loadCandidateDetail(context, backend, candidateId, asOf);
const serialized = JSON.stringify(response);
for (const forbidden of ['privateExtra', 'rawPayload', 'normalizedRecord', 'actorId']) {
  if (serialized.includes(forbidden)) {
    throw new Error(`Candidate detail leaked forbidden marker: ${forbidden}`);
  }
}

let backendCalled = false;
try {
  await loadCandidateDetail(
    { ...context, capabilities: [] },
    {
      async loadDetail() {
        backendCalled = true;
        return detail;
      },
    },
    candidateId,
    asOf,
  );
  throw new Error('Unauthorized Candidate detail request was accepted.');
} catch (error) {
  if (backendCalled) {
    throw new Error('Unauthorized Candidate detail request reached the backend.', { cause: error });
  }
}

console.log('Candidate detail checks passed.');
