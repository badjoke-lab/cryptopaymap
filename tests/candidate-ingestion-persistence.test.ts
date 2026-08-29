import { describe, expect, it } from 'vitest';
import type {
  NewCandidateSourceRecord,
  NewImportBatch,
  NewSourceCandidate,
  NewSourceRecord,
} from '../src/db/schema';
import {
  CandidateIngestionPersistenceError,
  type CandidateSourceRefresh,
  validateCandidateIngestionPersistencePlan,
} from '../src/importers/candidate-ingestion-persistence';

const BATCH_ID = '00000000-0000-4000-8000-000000000001';
const REQUEST_ID = '00000000-0000-4000-8000-000000000002';
const SOURCE_ID = '00000000-0000-4000-8000-000000000003';
const SOURCE_RECORD_ID = '00000000-0000-4000-8000-000000000004';
const CANDIDATE_ID = '00000000-0000-4000-8000-000000000005';
const EXISTING_CANDIDATE_ID = '00000000-0000-4000-8000-000000000006';
const DUPLICATE_GROUP_ID = '00000000-0000-4000-8000-000000000007';
const DUPLICATE_SIGNAL_ID = '00000000-0000-4000-8000-000000000008';
const NOW = new Date('2026-08-28T00:00:00.000Z');

function batch(overrides: Partial<NewImportBatch> = {}): NewImportBatch {
  return {
    id: BATCH_ID,
    requestId: REQUEST_ID,
    actorId: 'fixture-importer',
    actorType: 'system',
    sourceId: SOURCE_ID,
    importKind: 'physical_place',
    sourceSchemaVersion: 'osm-candidate-v1',
    importerVersion: '1.0.0',
    inputChecksum: 'a'.repeat(64),
    inputCount: 1,
    acceptedCount: 1,
    rejectedCount: 0,
    replayedCount: 0,
    outOfScopeCount: 0,
    duplicateSignalCount: 0,
    automaticConfirmedCount: 0,
    rejectionSummary: {},
    startedAt: NOW,
    completedAt: NOW,
    ...overrides,
  };
}

function sourceRecord(): NewSourceRecord {
  return {
    id: SOURCE_RECORD_ID,
    sourceId: SOURCE_ID,
    externalId: 'node:1',
    sourceUrl: 'https://www.openstreetmap.org/node/1',
    rawPayload: { type: 'node', id: 1 },
    observedAt: NOW,
    publishedAt: null,
    fetchedAt: NOW,
    contentHash: 'b'.repeat(64),
    archiveUrl: null,
    licenseId: null,
  };
}

function candidate(overrides: Partial<NewSourceCandidate> = {}): NewSourceCandidate {
  return {
    id: CANDIDATE_ID,
    candidateType: 'physical_place',
    normalizedName: 'candidate cafe',
    candidateStatus: 'new',
    priority: 500,
    duplicateGroupId: null,
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    importBatchId: BATCH_ID,
    canonicalEntityId: null,
    canonicalLocationId: null,
    ...overrides,
  };
}

function relation(): NewCandidateSourceRecord {
  return {
    candidateId: CANDIDATE_ID,
    sourceRecordId: SOURCE_RECORD_ID,
    relationship: 'origin',
  };
}

function refresh(overrides: Partial<CandidateSourceRefresh> = {}): CandidateSourceRefresh {
  return {
    candidateId: CANDIDATE_ID,
    sourceId: SOURCE_ID,
    externalId: 'node:1',
    expectedContentHash: 'b'.repeat(64),
    sourceUrl: 'https://www.openstreetmap.org/node/1',
    rawPayload: { type: 'node', id: 1, tags: { phone: '+81-00-0000-0000' } },
    observedAt: new Date('2026-08-29T00:00:00.000Z'),
    publishedAt: null,
    fetchedAt: new Date('2026-08-29T00:00:00.000Z'),
    contentHash: 'c'.repeat(64),
    archiveUrl: null,
    licenseId: null,
    lastSeenAt: new Date('2026-08-29T00:00:00.000Z'),
    ...overrides,
  };
}

describe('Candidate ingestion persistence safety', () => {
  it('accepts a Candidate-only plan with zero automatic confirmations', () => {
    const plan = {
      batch: batch(),
      sourceRecords: [sourceRecord()],
      candidates: [candidate()],
      candidateSourceRecords: [relation()],
      duplicateGroups: [],
      duplicateSignals: [],
    };

    expect(validateCandidateIngestionPersistencePlan(plan)).toBe(plan);
    expect(plan.batch.automaticConfirmedCount).toBe(0);
    expect(plan.candidates[0]?.candidateStatus).toBe('new');
  });

  it('accepts a changed-source refresh without creating another Candidate or canonical target', () => {
    const plan = {
      batch: batch(),
      sourceRecords: [],
      candidates: [],
      candidateSourceRecords: [],
      sourceRefreshes: [refresh()],
      duplicateGroups: [],
      duplicateSignals: [],
    };

    expect(validateCandidateIngestionPersistencePlan(plan)).toBe(plan);
    expect(plan.batch.acceptedCount).toBe(1);
    expect(plan.sourceRefreshes).toHaveLength(1);
    expect(plan.candidates).toHaveLength(0);
  });

  it('accepts a cross-batch duplicate signal with an explicit existing-Candidate assignment', () => {
    const plan = {
      batch: batch({ duplicateSignalCount: 1 }),
      sourceRecords: [sourceRecord()],
      candidates: [candidate({ duplicateGroupId: DUPLICATE_GROUP_ID })],
      candidateSourceRecords: [relation()],
      existingCandidateDuplicateAssignments: [
        {
          candidateId: EXISTING_CANDIDATE_ID,
          duplicateGroupId: DUPLICATE_GROUP_ID,
          assignedAt: NOW,
        },
      ],
      duplicateGroups: [
        {
          id: DUPLICATE_GROUP_ID,
          status: 'open' as const,
          resolutionNote: null,
          resolvedAt: null,
        },
      ],
      duplicateSignals: [
        {
          id: DUPLICATE_SIGNAL_ID,
          duplicateGroupId: DUPLICATE_GROUP_ID,
          leftCandidateId: CANDIDATE_ID,
          rightCandidateId: EXISTING_CANDIDATE_ID,
          reason: 'same_name_and_coordinates' as const,
          strength: 'strong' as const,
          importBatchId: BATCH_ID,
        },
      ],
    };

    expect(validateCandidateIngestionPersistencePlan(plan)).toBe(plan);
    expect(plan.batch.duplicateSignalCount).toBe(1);
    expect(plan.existingCandidateDuplicateAssignments).toHaveLength(1);
  });

  it('rejects a duplicate signal that references an unassigned cross-batch Candidate', () => {
    expect(() =>
      validateCandidateIngestionPersistencePlan({
        batch: batch({ duplicateSignalCount: 1 }),
        sourceRecords: [sourceRecord()],
        candidates: [candidate({ duplicateGroupId: DUPLICATE_GROUP_ID })],
        candidateSourceRecords: [relation()],
        duplicateGroups: [
          {
            id: DUPLICATE_GROUP_ID,
            status: 'open',
            resolutionNote: null,
            resolvedAt: null,
          },
        ],
        duplicateSignals: [
          {
            id: DUPLICATE_SIGNAL_ID,
            duplicateGroupId: DUPLICATE_GROUP_ID,
            leftCandidateId: CANDIDATE_ID,
            rightCandidateId: EXISTING_CANDIDATE_ID,
            reason: 'same_name_and_coordinates',
            strength: 'strong',
            importBatchId: BATCH_ID,
          },
        ],
      }),
    ).toThrow('explicitly assigned existing Candidates');
  });

  it('rejects a refresh that does not actually change source content', () => {
    expect(() =>
      validateCandidateIngestionPersistencePlan({
        batch: batch(),
        sourceRecords: [],
        candidates: [],
        candidateSourceRecords: [],
        sourceRefreshes: [refresh({ contentHash: 'b'.repeat(64) })],
      }),
    ).toThrow('different source content hash');
  });

  it('rejects any attempt to persist a promoted Candidate', () => {
    expect(() =>
      validateCandidateIngestionPersistencePlan({
        batch: batch(),
        sourceRecords: [sourceRecord()],
        candidates: [
          candidate({
            candidateStatus: 'promoted',
            canonicalLocationId: '00000000-0000-4000-8000-000000000009',
          }),
        ],
        candidateSourceRecords: [relation()],
      }),
    ).toThrowError(CandidateIngestionPersistenceError);
  });

  it('rejects a nonzero automatic-confirmation count', () => {
    expect(() =>
      validateCandidateIngestionPersistencePlan({
        batch: batch({ automaticConfirmedCount: 1 }),
        sourceRecords: [sourceRecord()],
        candidates: [candidate()],
        candidateSourceRecords: [relation()],
      }),
    ).toThrow('automaticConfirmedCount');
  });

  it('rejects Candidate/source links that escape the ingestion plan', () => {
    expect(() =>
      validateCandidateIngestionPersistencePlan({
        batch: batch(),
        sourceRecords: [sourceRecord()],
        candidates: [candidate()],
        candidateSourceRecords: [
          {
            candidateId: CANDIDATE_ID,
            sourceRecordId: '00000000-0000-4000-8000-000000000099',
            relationship: 'origin',
          },
        ],
      }),
    ).toThrow('inside the ingestion plan');
  });
});
