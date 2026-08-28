import { describe, expect, it } from 'vitest';
import type {
  NewCandidateSourceRecord,
  NewImportBatch,
  NewSourceCandidate,
  NewSourceRecord,
} from '../src/db/schema';
import {
  CandidateIngestionPersistenceError,
  validateCandidateIngestionPersistencePlan,
} from '../src/importers/candidate-ingestion-persistence';

const BATCH_ID = '00000000-0000-4000-8000-000000000001';
const REQUEST_ID = '00000000-0000-4000-8000-000000000002';
const SOURCE_ID = '00000000-0000-4000-8000-000000000003';
const SOURCE_RECORD_ID = '00000000-0000-4000-8000-000000000004';
const CANDIDATE_ID = '00000000-0000-4000-8000-000000000005';
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

  it('rejects any attempt to persist a promoted Candidate', () => {
    expect(() =>
      validateCandidateIngestionPersistencePlan({
        batch: batch(),
        sourceRecords: [sourceRecord()],
        candidates: [
          candidate({
            candidateStatus: 'promoted',
            canonicalLocationId: '00000000-0000-4000-8000-000000000006',
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
