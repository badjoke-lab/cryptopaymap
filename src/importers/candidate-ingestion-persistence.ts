import { and, eq } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../db/client';
import {
  candidateDuplicateGroups,
  candidateDuplicateSignals,
  candidateSourceRecords,
  importBatches,
  sourceCandidates,
  sourceRecords,
  type NewCandidateDuplicateGroup,
  type NewCandidateDuplicateSignal,
  type NewCandidateSourceRecord,
  type NewImportBatch,
  type NewSourceCandidate,
  type NewSourceRecord,
} from '../db/schema';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

export interface CandidateIngestionPersistencePlan {
  batch: NewImportBatch;
  sourceRecords: NewSourceRecord[];
  candidates: NewSourceCandidate[];
  candidateSourceRecords: NewCandidateSourceRecord[];
  duplicateGroups?: NewCandidateDuplicateGroup[];
  duplicateSignals?: NewCandidateDuplicateSignal[];
}

export interface CandidateIngestionReceipt {
  state: 'committed' | 'replayed';
  batchId: string;
  requestId: string;
  inputChecksum: string;
  acceptedCount: number;
  rejectedCount: number;
  replayedCount: number;
  duplicateSignalCount: number;
  automaticConfirmedCount: 0;
}

export class CandidateIngestionPersistenceError extends Error {
  constructor(
    readonly code: 'invalid_plan' | 'conflict',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CandidateIngestionPersistenceError';
  }
}

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function assertNonPromotedCandidate(candidate: NewSourceCandidate): void {
  if (candidate.candidateStatus !== 'new') {
    throw new CandidateIngestionPersistenceError(
      'invalid_plan',
      'Candidate ingestion may persist only new Candidates.',
    );
  }
  if (candidate.canonicalEntityId != null || candidate.canonicalLocationId != null) {
    throw new CandidateIngestionPersistenceError(
      'invalid_plan',
      'Candidate ingestion may not attach a canonical target.',
    );
  }
}

export function validateCandidateIngestionPersistencePlan(
  plan: CandidateIngestionPersistencePlan,
): CandidateIngestionPersistencePlan {
  const duplicateGroups = plan.duplicateGroups ?? [];
  const duplicateSignals = plan.duplicateSignals ?? [];

  if (plan.batch.automaticConfirmedCount !== 0) {
    throw new CandidateIngestionPersistenceError(
      'invalid_plan',
      'Candidate ingestion must keep automaticConfirmedCount at zero.',
    );
  }
  if (plan.batch.acceptedCount !== plan.candidates.length) {
    throw new CandidateIngestionPersistenceError(
      'invalid_plan',
      'The import batch acceptedCount must equal the Candidate row count.',
    );
  }
  if (plan.sourceRecords.length !== plan.candidates.length) {
    throw new CandidateIngestionPersistenceError(
      'invalid_plan',
      'Each accepted Candidate must persist one source record in this ingestion slice.',
    );
  }
  if (plan.candidateSourceRecords.length !== plan.candidates.length) {
    throw new CandidateIngestionPersistenceError(
      'invalid_plan',
      'Each accepted Candidate must persist one Candidate/source relationship.',
    );
  }
  if (plan.batch.duplicateSignalCount !== duplicateSignals.length) {
    throw new CandidateIngestionPersistenceError(
      'invalid_plan',
      'The import batch duplicateSignalCount must equal the duplicate signal row count.',
    );
  }

  const candidateIds = new Set<string>();
  for (const candidate of plan.candidates) {
    if (candidate.id == null) {
      throw new CandidateIngestionPersistenceError(
        'invalid_plan',
        'Candidate ingestion requires explicit deterministic Candidate IDs.',
      );
    }
    assertNonPromotedCandidate(candidate);
    if (candidate.importBatchId !== plan.batch.id) {
      throw new CandidateIngestionPersistenceError(
        'invalid_plan',
        'Every Candidate must reference the persisted import batch.',
      );
    }
    candidateIds.add(candidate.id);
  }

  const sourceRecordIds = new Set(
    plan.sourceRecords.map((record) => {
      if (record.id == null) {
        throw new CandidateIngestionPersistenceError(
          'invalid_plan',
          'Candidate ingestion requires explicit deterministic source-record IDs.',
        );
      }
      if (record.sourceId !== plan.batch.sourceId) {
        throw new CandidateIngestionPersistenceError(
          'invalid_plan',
          'Every source record must belong to the import batch source.',
        );
      }
      return record.id;
    }),
  );

  for (const relation of plan.candidateSourceRecords) {
    if (!candidateIds.has(relation.candidateId) || !sourceRecordIds.has(relation.sourceRecordId)) {
      throw new CandidateIngestionPersistenceError(
        'invalid_plan',
        'Candidate/source relationships must stay inside the ingestion plan.',
      );
    }
  }

  const duplicateGroupIds = new Set(
    duplicateGroups.map((group) => {
      if (group.id == null) {
        throw new CandidateIngestionPersistenceError(
          'invalid_plan',
          'Duplicate groups require explicit deterministic IDs.',
        );
      }
      return group.id;
    }),
  );
  for (const signal of duplicateSignals) {
    if (signal.id == null || !duplicateGroupIds.has(signal.duplicateGroupId)) {
      throw new CandidateIngestionPersistenceError(
        'invalid_plan',
        'Duplicate signals must reference a duplicate group from the same plan.',
      );
    }
    if (!candidateIds.has(signal.leftCandidateId) || !candidateIds.has(signal.rightCandidateId)) {
      throw new CandidateIngestionPersistenceError(
        'invalid_plan',
        'Duplicate signals may reference only Candidates from the same plan.',
      );
    }
    if (signal.importBatchId !== plan.batch.id) {
      throw new CandidateIngestionPersistenceError(
        'invalid_plan',
        'Duplicate signals must reference the persisted import batch.',
      );
    }
  }

  return plan;
}

async function readExistingByRequest(database: CryptoPayMapDatabase, requestId: string) {
  const rows = await database
    .select()
    .from(importBatches)
    .where(eq(importBatches.requestId, requestId))
    .limit(1);
  return rows[0] ?? null;
}

async function readExistingByChecksum(database: CryptoPayMapDatabase, batch: NewImportBatch) {
  const rows = await database
    .select()
    .from(importBatches)
    .where(
      and(
        eq(importBatches.sourceId, batch.sourceId),
        eq(importBatches.importKind, batch.importKind),
        eq(importBatches.importerVersion, batch.importerVersion),
        eq(importBatches.inputChecksum, batch.inputChecksum),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

function sameRequestContent(
  existing: Awaited<ReturnType<typeof readExistingByRequest>>,
  batch: NewImportBatch,
): boolean {
  return (
    existing !== null &&
    existing.sourceId === batch.sourceId &&
    existing.importKind === batch.importKind &&
    existing.importerVersion === batch.importerVersion &&
    existing.inputChecksum === batch.inputChecksum
  );
}

function receipt(
  row: NonNullable<Awaited<ReturnType<typeof readExistingByRequest>>>,
  state: CandidateIngestionReceipt['state'],
): CandidateIngestionReceipt {
  if (row.automaticConfirmedCount !== 0) {
    throw new CandidateIngestionPersistenceError(
      'conflict',
      'Persisted import history violated the zero automatic-confirmation invariant.',
    );
  }
  return {
    state,
    batchId: row.id,
    requestId: row.requestId,
    inputChecksum: row.inputChecksum,
    acceptedCount: row.acceptedCount,
    rejectedCount: row.rejectedCount,
    replayedCount: row.replayedCount,
    duplicateSignalCount: row.duplicateSignalCount,
    automaticConfirmedCount: 0,
  };
}

async function findReplay(database: CryptoPayMapDatabase, batch: NewImportBatch) {
  const byRequest = await readExistingByRequest(database, batch.requestId);
  if (byRequest !== null) {
    if (!sameRequestContent(byRequest, batch)) {
      throw new CandidateIngestionPersistenceError(
        'conflict',
        'The Candidate-ingestion request ID was reused with different content.',
      );
    }
    return byRequest;
  }
  return readExistingByChecksum(database, batch);
}

export function createDrizzleCandidateIngestionPersistenceBackend(database: CryptoPayMapDatabase) {
  return {
    async commit(
      unsafePlan: CandidateIngestionPersistencePlan,
    ): Promise<CandidateIngestionReceipt> {
      const plan = validateCandidateIngestionPersistencePlan(unsafePlan);
      const replay = await findReplay(database, plan.batch);
      if (replay !== null) return receipt(replay, 'replayed');

      const statements: unknown[] = [database.insert(importBatches).values(plan.batch)];
      if (plan.sourceRecords.length > 0) {
        statements.push(database.insert(sourceRecords).values(plan.sourceRecords));
      }
      if (plan.duplicateGroups && plan.duplicateGroups.length > 0) {
        statements.push(database.insert(candidateDuplicateGroups).values(plan.duplicateGroups));
      }
      if (plan.candidates.length > 0) {
        statements.push(database.insert(sourceCandidates).values(plan.candidates));
      }
      if (plan.candidateSourceRecords.length > 0) {
        statements.push(
          database.insert(candidateSourceRecords).values(plan.candidateSourceRecords),
        );
      }
      if (plan.duplicateSignals && plan.duplicateSignals.length > 0) {
        statements.push(database.insert(candidateDuplicateSignals).values(plan.duplicateSignals));
      }

      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
      } catch (error) {
        if (postgresErrorCode(error) === '23505') {
          const concurrentReplay = await findReplay(database, plan.batch);
          if (concurrentReplay !== null) return receipt(concurrentReplay, 'replayed');
        }
        const code = postgresErrorCode(error);
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new CandidateIngestionPersistenceError(
            'conflict',
            `PostgreSQL rejected the atomic Candidate-ingestion batch with code ${code}.`,
            { cause: error },
          );
        }
        throw error;
      }

      const committed = await readExistingByRequest(database, plan.batch.requestId);
      if (committed === null) {
        throw new CandidateIngestionPersistenceError(
          'conflict',
          'Candidate ingestion completed without a readable import-batch receipt.',
        );
      }
      return receipt(committed, 'committed');
    },
  };
}
