import { describe, expect, it } from 'vitest';
import {
  CandidatePlanPersistenceError,
  createCandidatePlanPersistenceService,
  type AdminMutationContext,
  type CandidatePersistenceBatch,
  type PersistCandidatePlanRequest,
} from '../src/admin/persistence/candidate-plan';
import { InMemoryCandidatePlanBackend } from '../src/admin/persistence/in-memory-candidate-plan-backend';
import { createOnlineServiceImportPlan } from '../src/importers/online-service';
import { createPhysicalPlaceImportPlan } from '../src/importers/physical-place';

const physicalSourceId = '11111111-1111-4111-8111-111111111111';
const onlineSourceId = '44444444-4444-4444-8444-444444444444';

function mutation(): AdminMutationContext {
  return {
    requestId: '77777777-7777-4777-8777-777777777777',
    actorId: 'admin:test-reviewer',
    actorType: 'human',
    capabilities: ['candidate:write'],
  };
}

function physicalRecord(index: number) {
  return {
    legacyId: `persist-place-${index}`,
    legacyPath: `/place/persist-place-${index}`,
    name: `Persist Place ${index}`,
    addressLine: `${index} Persistence Street`,
    locality: 'Tokyo',
    region: 'Tokyo',
    postalCode: '100-0001',
    countryCode: 'JP',
    latitude: 35.68 + index / 10_000,
    longitude: 139.76 + index / 10_000,
    category: 'cafe',
    websiteUrl: `https://place-${index}.example.com`,
    osmType: 'node',
    osmId: String(30_000 + index),
    paymentTags: { 'payment:bitcoin': 'yes' },
    observedAt: '2026-06-20T00:00:00Z',
    sourceUrl: null,
    legacyVerificationLabel: 'legacy-listed',
  };
}

function onlineRecord(recordType = 'online_service') {
  return {
    legacyId: `persist-${recordType}`,
    legacyPath: `/service/persist-${recordType}`,
    recordType,
    name: `Persist ${recordType}`,
    websiteUrl: 'https://service.example.com',
    countryCode: null,
    category: 'software',
    acceptanceScope: 'all_checkout',
    routeType: 'processor_checkout',
    processorName: 'Example Processor',
    processorUrl: 'https://processor.example.com',
    assetLabels: ['BTC'],
    networkLabels: ['Lightning'],
    paymentMethodLabels: ['processor checkout'],
    scopeNotes: null,
    howToPay: 'Choose cryptocurrency at checkout.',
    evidenceUrls: ['https://service.example.com/payments'],
    observedAt: '2026-06-20T00:00:00Z',
    sourceUrl: null,
    legacyVerificationLabel: 'legacy-ready',
  };
}

async function physicalRequest(): Promise<PersistCandidatePlanRequest> {
  const plan = await createPhysicalPlaceImportPlan({
    sourceId: physicalSourceId,
    licenseId: '22222222-2222-4222-8222-222222222222',
    importBatchId: '33333333-3333-4333-8333-333333333333',
    fetchedAt: '2026-06-27T00:00:00Z',
    importerVersion: '1.0.0',
    records: [physicalRecord(1), physicalRecord(2)],
  });

  return {
    mutation: mutation(),
    metadata: {
      importKind: 'physical_place',
      sourceId: physicalSourceId,
      sourceSchemaVersion: 'cryptopaymap-v2-legacy-v1',
      startedAt: '2026-06-27T00:00:00Z',
      completedAt: '2026-06-27T00:01:00Z',
    },
    plan,
  };
}

function emptySnapshot() {
  return {
    importBatches: 0,
    requestIds: 0,
    duplicateGroups: 0,
    duplicateSignals: 0,
    sourceRecords: 0,
    candidates: 0,
    candidateSourceRecords: 0,
    legacyMappings: 0,
  };
}

describe('candidate-plan persistence service', () => {
  it('commits a validated private candidate batch', async () => {
    const backend = new InMemoryCandidatePlanBackend();
    const service = createCandidatePlanPersistenceService(backend);
    const request = await physicalRequest();

    const receipt = await service.persist(request);

    expect(receipt).toMatchObject({
      requestId: request.mutation.requestId,
      importBatchId: request.plan.importBatchId,
      acceptedCount: 2,
      duplicateGroupIds: [],
      duplicateSignalIds: [],
      state: 'committed',
    });
    expect(backend.snapshot()).toEqual({
      ...emptySnapshot(),
      importBatches: 1,
      requestIds: 1,
      sourceRecords: 2,
      candidates: 2,
      candidateSourceRecords: 2,
      legacyMappings: 2,
    });
  });

  it('persists connected duplicate signals without automatically changing Candidate status', async () => {
    const first = physicalRecord(1);
    const second = physicalRecord(2);
    second.osmId = first.osmId;
    second.name = 'A different display name';
    const plan = await createPhysicalPlaceImportPlan({
      sourceId: physicalSourceId,
      licenseId: '22222222-2222-4222-8222-222222222222',
      importBatchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      fetchedAt: '2026-06-27T00:00:00Z',
      importerVersion: '1.0.0',
      records: [first, second],
    });
    let committedBatch: CandidatePersistenceBatch | null = null;
    const service = createCandidatePlanPersistenceService({
      async persistAtomically(batch) {
        committedBatch = batch;
      },
    });

    const receipt = await service.persist({
      mutation: {
        ...mutation(),
        requestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      },
      metadata: {
        importKind: 'physical_place',
        sourceId: physicalSourceId,
        sourceSchemaVersion: 'cryptopaymap-v2-legacy-v1',
        startedAt: '2026-06-27T00:00:00Z',
        completedAt: '2026-06-27T00:01:00Z',
      },
      plan,
    });

    expect(plan.duplicateSignals).toHaveLength(1);
    expect(receipt.duplicateGroupIds).toHaveLength(1);
    expect(receipt.duplicateSignalIds).toHaveLength(1);
    expect(committedBatch).not.toBeNull();
    expect(committedBatch!.duplicateGroups).toHaveLength(1);
    expect(committedBatch!.duplicateSignals).toHaveLength(1);
    expect(
      new Set(committedBatch!.drafts.map((draft) => draft.candidate.duplicateGroupId)),
    ).toEqual(new Set(receipt.duplicateGroupIds));
    expect(committedBatch!.drafts.map((draft) => draft.candidate.candidateStatus)).toEqual([
      'new',
      'new',
    ]);
    expect(
      committedBatch!.drafts.every((draft) => draft.candidate.canonicalEntityId === null),
    ).toBe(true);
  });

  it('is idempotent when the same request and deterministic plan are replayed', async () => {
    const backend = new InMemoryCandidatePlanBackend();
    const service = createCandidatePlanPersistenceService(backend);
    const request = await physicalRequest();

    await service.persist(request);
    await service.persist(structuredClone(request));

    expect(backend.snapshot()).toEqual({
      ...emptySnapshot(),
      importBatches: 1,
      requestIds: 1,
      sourceRecords: 2,
      candidates: 2,
      candidateSourceRecords: 2,
      legacyMappings: 2,
    });
  });

  it('rejects actors without the candidate-write capability', async () => {
    const backend = new InMemoryCandidatePlanBackend();
    const service = createCandidatePlanPersistenceService(backend);
    const request = await physicalRequest();
    request.mutation.capabilities = [];

    await expect(service.persist(request)).rejects.toMatchObject({
      code: 'unauthorized',
    });
    expect(backend.snapshot().importBatches).toBe(0);
  });

  it('rejects plans that assign canonical identities before review', async () => {
    const backend = new InMemoryCandidatePlanBackend();
    const service = createCandidatePlanPersistenceService(backend);
    const request = await physicalRequest();
    request.plan.drafts[0]!.candidate.canonicalEntityId = '88888888-8888-4888-8888-888888888888';

    await expect(service.persist(request)).rejects.toMatchObject({
      code: 'invalid_plan',
    });
    expect(backend.snapshot().candidates).toBe(0);
  });

  it('rolls back the whole in-memory transaction on backend failure', async () => {
    const backend = new InMemoryCandidatePlanBackend({ failBeforeCommit: () => true });
    const service = createCandidatePlanPersistenceService(backend);

    await expect(service.persist(await physicalRequest())).rejects.toMatchObject({
      code: 'backend_failure',
    });
    expect(backend.snapshot()).toEqual(emptySnapshot());
  });

  it('rolls back a conflicting deterministic replay', async () => {
    const backend = new InMemoryCandidatePlanBackend();
    const service = createCandidatePlanPersistenceService(backend);
    const original = await physicalRequest();
    await service.persist(original);

    const conflict = structuredClone(original);
    conflict.plan.drafts[0]!.candidate.normalizedName = 'conflicting normalized name';

    await expect(service.persist(conflict)).rejects.toBeInstanceOf(CandidatePlanPersistenceError);
    expect(backend.snapshot().candidates).toBe(2);
  });

  it('records an all-rejected online scope batch without creating candidates', async () => {
    const plan = await createOnlineServiceImportPlan({
      sourceId: onlineSourceId,
      licenseId: '55555555-5555-4555-8555-555555555555',
      importBatchId: '99999999-9999-4999-8999-999999999999',
      fetchedAt: '2026-06-27T00:00:00Z',
      importerVersion: '1.0.0',
      records: [onlineRecord('crypto_card')],
    });
    const backend = new InMemoryCandidatePlanBackend();
    const service = createCandidatePlanPersistenceService(backend);

    const receipt = await service.persist({
      mutation: {
        ...mutation(),
        requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
      metadata: {
        importKind: 'online_service',
        sourceId: onlineSourceId,
        sourceSchemaVersion: 'crypto-acceptance-registry-v1',
        startedAt: '2026-06-27T00:00:00Z',
        completedAt: '2026-06-27T00:00:30Z',
      },
      plan,
    });

    expect(receipt.acceptedCount).toBe(0);
    expect(receipt.rejectedCount).toBe(1);
    expect(backend.snapshot()).toMatchObject({
      importBatches: 1,
      duplicateGroups: 0,
      duplicateSignals: 0,
      candidates: 0,
      sourceRecords: 0,
    });
  });
});
