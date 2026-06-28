import {
  CandidatePlanPersistenceError,
  type CandidatePersistenceBatch,
  type CandidatePlanAtomicBackend,
} from './candidate-plan';

interface InMemoryState {
  importBatches: Map<string, string>;
  requestIds: Map<string, string>;
  sourceChecksums: Map<string, string>;
  sourceRecords: Map<string, string>;
  sourceExternalIds: Map<string, string>;
  candidates: Map<string, string>;
  candidateSourceRecords: Map<string, string>;
  legacyMappings: Map<string, string>;
  legacySourceIds: Map<string, string>;
  legacyPaths: Map<string, string>;
}

export interface InMemoryCandidatePlanBackendOptions {
  failBeforeCommit?: (batch: CandidatePersistenceBatch) => boolean;
}

function createState(): InMemoryState {
  return {
    importBatches: new Map(),
    requestIds: new Map(),
    sourceChecksums: new Map(),
    sourceRecords: new Map(),
    sourceExternalIds: new Map(),
    candidates: new Map(),
    candidateSourceRecords: new Map(),
    legacyMappings: new Map(),
    legacySourceIds: new Map(),
    legacyPaths: new Map(),
  };
}

function cloneState(state: InMemoryState): InMemoryState {
  return {
    importBatches: new Map(state.importBatches),
    requestIds: new Map(state.requestIds),
    sourceChecksums: new Map(state.sourceChecksums),
    sourceRecords: new Map(state.sourceRecords),
    sourceExternalIds: new Map(state.sourceExternalIds),
    candidates: new Map(state.candidates),
    candidateSourceRecords: new Map(state.candidateSourceRecords),
    legacyMappings: new Map(state.legacyMappings),
    legacySourceIds: new Map(state.legacySourceIds),
    legacyPaths: new Map(state.legacyPaths),
  };
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function fingerprint(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function putExact(map: Map<string, string>, key: string, value: unknown, label: string): void {
  const nextFingerprint = fingerprint(value);
  const existingFingerprint = map.get(key);
  if (existingFingerprint !== undefined && existingFingerprint !== nextFingerprint) {
    throw new CandidatePlanPersistenceError(
      'persistence_conflict',
      `The ${label} conflicts with an existing private record.`,
      [`${label} key: ${key}`],
    );
  }
  map.set(key, nextFingerprint);
}

function claimUnique(map: Map<string, string>, key: string, id: string, label: string): void {
  const existingId = map.get(key);
  if (existingId !== undefined && existingId !== id) {
    throw new CandidatePlanPersistenceError(
      'persistence_conflict',
      `The ${label} is already assigned to another private record.`,
      [`${label} key: ${key}`],
    );
  }
  map.set(key, id);
}

function requiredId(value: string | undefined, label: string): string {
  if (value === undefined) {
    throw new CandidatePlanPersistenceError(
      'invalid_plan',
      `The validated persistence batch is missing a ${label}.`,
    );
  }
  return value;
}

export class InMemoryCandidatePlanBackend implements CandidatePlanAtomicBackend {
  private state = createState();
  private readonly options: InMemoryCandidatePlanBackendOptions;

  constructor(options: InMemoryCandidatePlanBackendOptions = {}) {
    this.options = options;
  }

  async persistAtomically(batch: CandidatePersistenceBatch): Promise<void> {
    const next = cloneState(this.state);
    const importBatch = batch.importBatch;

    putExact(next.importBatches, importBatch.id, importBatch, 'import batch');
    claimUnique(next.requestIds, importBatch.requestId, importBatch.id, 'request ID');
    claimUnique(
      next.sourceChecksums,
      [
        importBatch.sourceId,
        importBatch.importKind,
        importBatch.importerVersion,
        importBatch.inputChecksum,
      ].join(':'),
      importBatch.id,
      'source checksum',
    );

    for (const draft of batch.drafts) {
      const sourceRecordId = requiredId(draft.sourceRecord.id, 'source-record ID');
      const candidateId = requiredId(draft.candidate.id, 'candidate ID');
      const legacyMappingId = requiredId(draft.legacyMapping.id, 'legacy-mapping ID');

      putExact(next.sourceRecords, sourceRecordId, draft.sourceRecord, 'source record');
      if (draft.sourceRecord.externalId !== null && draft.sourceRecord.externalId !== undefined) {
        claimUnique(
          next.sourceExternalIds,
          `${draft.sourceRecord.sourceId}:${draft.sourceRecord.externalId}`,
          sourceRecordId,
          'source external identity',
        );
      }

      putExact(next.candidates, candidateId, draft.candidate, 'candidate');
      putExact(
        next.candidateSourceRecords,
        `${draft.candidateSourceRecord.candidateId}:${draft.candidateSourceRecord.sourceRecordId}`,
        draft.candidateSourceRecord,
        'candidate source relationship',
      );
      putExact(next.legacyMappings, legacyMappingId, draft.legacyMapping, 'legacy mapping');
      claimUnique(
        next.legacySourceIds,
        `${draft.legacyMapping.sourceSystem}:${draft.legacyMapping.legacyId}`,
        legacyMappingId,
        'legacy source identity',
      );
      if (draft.legacyMapping.legacyPath !== null && draft.legacyMapping.legacyPath !== undefined) {
        claimUnique(
          next.legacyPaths,
          draft.legacyMapping.legacyPath,
          legacyMappingId,
          'legacy path',
        );
      }
    }

    if (this.options.failBeforeCommit?.(batch) === true) {
      throw new Error('Injected failure before atomic commit.');
    }

    this.state = next;
  }

  snapshot() {
    return Object.freeze({
      importBatches: this.state.importBatches.size,
      requestIds: this.state.requestIds.size,
      sourceRecords: this.state.sourceRecords.size,
      candidates: this.state.candidates.size,
      candidateSourceRecords: this.state.candidateSourceRecords.size,
      legacyMappings: this.state.legacyMappings.size,
    });
  }
}
