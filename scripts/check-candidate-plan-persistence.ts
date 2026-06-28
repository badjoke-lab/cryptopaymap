import {
  createCandidatePlanPersistenceService,
  type PersistCandidatePlanRequest,
} from '../src/admin/persistence/candidate-plan';
import { InMemoryCandidatePlanBackend } from '../src/admin/persistence/in-memory-candidate-plan-backend';
import { createPhysicalPlaceImportPlan } from '../src/importers/physical-place';

const sourceId = '11111111-1111-4111-8111-111111111111';
const plan = await createPhysicalPlaceImportPlan({
  sourceId,
  licenseId: '22222222-2222-4222-8222-222222222222',
  importBatchId: '33333333-3333-4333-8333-333333333333',
  fetchedAt: '2026-06-27T00:00:00Z',
  importerVersion: '1.0.0',
  records: [
    {
      legacyId: 'runtime-persistence-place',
      legacyPath: '/place/runtime-persistence-place',
      name: 'Runtime Persistence Place',
      addressLine: '1 Runtime Street',
      locality: 'Tokyo',
      region: 'Tokyo',
      postalCode: '100-0001',
      countryCode: 'JP',
      latitude: 35.68,
      longitude: 139.76,
      category: 'cafe',
      websiteUrl: 'https://runtime.example.com',
      osmType: 'node',
      osmId: '40001',
      paymentTags: { 'payment:bitcoin': 'yes' },
      observedAt: '2026-06-20T00:00:00Z',
      sourceUrl: null,
      legacyVerificationLabel: 'legacy-listed',
    },
  ],
});

const request: PersistCandidatePlanRequest = {
  mutation: {
    requestId: '77777777-7777-4777-8777-777777777777',
    actorId: 'system:runtime-check',
    actorType: 'system',
    capabilities: ['candidate:write'],
  },
  metadata: {
    importKind: 'physical_place',
    sourceId,
    sourceSchemaVersion: 'cryptopaymap-v2-legacy-v1',
    startedAt: '2026-06-27T00:00:00Z',
    completedAt: '2026-06-27T00:00:30Z',
  },
  plan,
};

const backend = new InMemoryCandidatePlanBackend();
const service = createCandidatePlanPersistenceService(backend);
const firstReceipt = await service.persist(request);
const replayReceipt = await service.persist(structuredClone(request));
const snapshot = backend.snapshot();

if (
  firstReceipt.state !== 'committed' ||
  replayReceipt.state !== 'committed' ||
  snapshot.importBatches !== 1 ||
  snapshot.sourceRecords !== 1 ||
  snapshot.candidates !== 1 ||
  snapshot.candidateSourceRecords !== 1 ||
  snapshot.legacyMappings !== 1
) {
  throw new Error('Candidate persistence runtime check did not remain idempotent.');
}

if (
  plan.drafts.some(
    (draft) =>
      draft.candidate.canonicalEntityId !== null ||
      draft.candidate.canonicalLocationId !== null ||
      draft.candidate.candidateStatus !== 'new',
  )
) {
  throw new Error('Candidate persistence runtime check crossed the canonical boundary.');
}

console.log('Candidate-plan persistence checks passed.');
