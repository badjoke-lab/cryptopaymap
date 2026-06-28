import { sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  candidateDuplicateGroups,
  candidateDuplicateSignals,
  candidateSourceRecords,
  importBatches,
  legacyPlaceIds,
  sourceCandidates,
  sourceRecords,
  type NewCandidateDuplicateGroup,
  type NewCandidateDuplicateSignal,
} from '../../db/schema';
import {
  CandidatePlanPersistenceError,
  type CandidatePersistenceBatch,
  type CandidatePersistenceDraft,
  type CandidatePlanAtomicBackend,
} from './candidate-plan';

// Drizzle's batch tuple is intentionally broad at runtime but narrow at the type boundary.
type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function importBatchGuard(database: CryptoPayMapDatabase, batch: CandidatePersistenceBatch) {
  const value = batch.importBatch;
  return database.execute(sql`
    select 1 / case when exists (
      select 1
      from ${importBatches}
      where ${importBatches.id} = ${value.id}
        and ${importBatches.requestId} = ${value.requestId}
        and ${importBatches.actorId} = ${value.actorId}
        and ${importBatches.actorType} = ${value.actorType}
        and ${importBatches.sourceId} = ${value.sourceId}
        and ${importBatches.importKind} = ${value.importKind}
        and ${importBatches.sourceSchemaVersion} = ${value.sourceSchemaVersion}
        and ${importBatches.importerVersion} = ${value.importerVersion}
        and ${importBatches.inputChecksum} = ${value.inputChecksum}
        and ${importBatches.inputCount} = ${value.inputCount}
        and ${importBatches.acceptedCount} = ${value.acceptedCount}
        and ${importBatches.rejectedCount} = ${value.rejectedCount}
        and ${importBatches.replayedCount} = ${value.replayedCount}
        and ${importBatches.outOfScopeCount} = ${value.outOfScopeCount}
        and ${importBatches.duplicateSignalCount} = ${value.duplicateSignalCount}
        and ${importBatches.automaticConfirmedCount} = ${value.automaticConfirmedCount}
        and ${importBatches.rejectionSummary} = ${JSON.stringify(value.rejectionSummary)}::jsonb
        and ${importBatches.startedAt} = ${value.startedAt}
        and ${importBatches.completedAt} = ${value.completedAt}
    ) then 1 else 0 end as persistence_guard
  `);
}

function duplicateGroupGuard(database: CryptoPayMapDatabase, group: NewCandidateDuplicateGroup) {
  return database.execute(sql`
    select 1 / case when exists (
      select 1
      from ${candidateDuplicateGroups}
      where ${candidateDuplicateGroups.id} = ${group.id}
        and ${candidateDuplicateGroups.status} = ${group.status}
        and ${candidateDuplicateGroups.resolutionNote} is not distinct from ${group.resolutionNote}
        and ${candidateDuplicateGroups.resolvedAt} is not distinct from ${group.resolvedAt}
    ) then 1 else 0 end as persistence_guard
  `);
}

function draftGuard(database: CryptoPayMapDatabase, draft: CandidatePersistenceDraft) {
  const sourceRecord = draft.sourceRecord;
  const candidate = draft.candidate;
  const relation = draft.candidateSourceRecord;
  const legacyMapping = draft.legacyMapping;

  return database.execute(sql`
    select 1 / case when exists (
      select 1
      from ${sourceRecords}
      join ${candidateSourceRecords}
        on ${candidateSourceRecords.sourceRecordId} = ${sourceRecords.id}
      join ${sourceCandidates}
        on ${sourceCandidates.id} = ${candidateSourceRecords.candidateId}
      join ${legacyPlaceIds}
        on ${legacyPlaceIds.sourceRecordId} = ${sourceRecords.id}
      where ${sourceRecords.id} = ${sourceRecord.id}
        and ${sourceRecords.sourceId} = ${sourceRecord.sourceId}
        and ${sourceRecords.externalId} is not distinct from ${sourceRecord.externalId}
        and ${sourceRecords.sourceUrl} is not distinct from ${sourceRecord.sourceUrl}
        and ${sourceRecords.rawPayload} = ${JSON.stringify(sourceRecord.rawPayload)}::jsonb
        and ${sourceRecords.observedAt} is not distinct from ${sourceRecord.observedAt}
        and ${sourceRecords.publishedAt} is not distinct from ${sourceRecord.publishedAt}
        and ${sourceRecords.fetchedAt} = ${sourceRecord.fetchedAt}
        and ${sourceRecords.contentHash} is not distinct from ${sourceRecord.contentHash}
        and ${sourceRecords.archiveUrl} is not distinct from ${sourceRecord.archiveUrl}
        and ${sourceRecords.licenseId} is not distinct from ${sourceRecord.licenseId}
        and ${sourceCandidates.id} = ${candidate.id}
        and ${sourceCandidates.candidateType} = ${candidate.candidateType}
        and ${sourceCandidates.normalizedName} = ${candidate.normalizedName}
        and ${sourceCandidates.candidateStatus} = ${candidate.candidateStatus}
        and ${sourceCandidates.priority} is not distinct from ${candidate.priority}
        and ${sourceCandidates.duplicateGroupId} is not distinct from ${candidate.duplicateGroupId}
        and ${sourceCandidates.firstSeenAt} = ${candidate.firstSeenAt}
        and ${sourceCandidates.lastSeenAt} = ${candidate.lastSeenAt}
        and ${sourceCandidates.importBatchId} is not distinct from ${candidate.importBatchId}
        and ${sourceCandidates.canonicalEntityId} is not distinct from ${candidate.canonicalEntityId}
        and ${sourceCandidates.canonicalLocationId} is not distinct from ${candidate.canonicalLocationId}
        and ${candidateSourceRecords.candidateId} = ${relation.candidateId}
        and ${candidateSourceRecords.sourceRecordId} = ${relation.sourceRecordId}
        and ${candidateSourceRecords.relationship} = ${relation.relationship}
        and ${legacyPlaceIds.id} = ${legacyMapping.id}
        and ${legacyPlaceIds.sourceSystem} = ${legacyMapping.sourceSystem}
        and ${legacyPlaceIds.legacyId} = ${legacyMapping.legacyId}
        and ${legacyPlaceIds.legacyPath} is not distinct from ${legacyMapping.legacyPath}
        and ${legacyPlaceIds.migrationStatus} = ${legacyMapping.migrationStatus}
        and ${legacyPlaceIds.canonicalPath} is not distinct from ${legacyMapping.canonicalPath}
        and ${legacyPlaceIds.entityId} is not distinct from ${legacyMapping.entityId}
        and ${legacyPlaceIds.locationId} is not distinct from ${legacyMapping.locationId}
        and ${legacyPlaceIds.resolutionNote} is not distinct from ${legacyMapping.resolutionNote}
        and ${legacyPlaceIds.resolvedAt} is not distinct from ${legacyMapping.resolvedAt}
    ) then 1 else 0 end as persistence_guard
  `);
}

function duplicateSignalGuard(database: CryptoPayMapDatabase, signal: NewCandidateDuplicateSignal) {
  return database.execute(sql`
    select 1 / case when exists (
      select 1
      from ${candidateDuplicateSignals}
      where ${candidateDuplicateSignals.id} = ${signal.id}
        and ${candidateDuplicateSignals.duplicateGroupId} = ${signal.duplicateGroupId}
        and ${candidateDuplicateSignals.leftCandidateId} = ${signal.leftCandidateId}
        and ${candidateDuplicateSignals.rightCandidateId} = ${signal.rightCandidateId}
        and ${candidateDuplicateSignals.reason} = ${signal.reason}
        and ${candidateDuplicateSignals.strength} = ${signal.strength}
        and ${candidateDuplicateSignals.importBatchId} is not distinct from ${signal.importBatchId}
    ) then 1 else 0 end as persistence_guard
  `);
}

export function createDrizzleCandidatePlanBackend(
  database: CryptoPayMapDatabase,
): CandidatePlanAtomicBackend {
  return {
    async persistAtomically(batch: CandidatePersistenceBatch): Promise<void> {
      const statements: unknown[] = [
        database.insert(importBatches).values(batch.importBatch).onConflictDoNothing(),
        importBatchGuard(database, batch),
      ];

      for (const group of batch.duplicateGroups) {
        statements.push(
          database.insert(candidateDuplicateGroups).values(group).onConflictDoNothing(),
          duplicateGroupGuard(database, group),
        );
      }

      for (const draft of batch.drafts) {
        statements.push(
          database.insert(sourceRecords).values(draft.sourceRecord).onConflictDoNothing(),
          database.insert(sourceCandidates).values(draft.candidate).onConflictDoNothing(),
          database
            .insert(candidateSourceRecords)
            .values(draft.candidateSourceRecord)
            .onConflictDoNothing(),
          database.insert(legacyPlaceIds).values(draft.legacyMapping).onConflictDoNothing(),
          draftGuard(database, draft),
        );
      }

      for (const signal of batch.duplicateSignals) {
        statements.push(
          database.insert(candidateDuplicateSignals).values(signal).onConflictDoNothing(),
          duplicateSignalGuard(database, signal),
        );
      }

      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new CandidatePlanPersistenceError(
            'persistence_conflict',
            'The import batch conflicts with existing private data and was rolled back.',
            [`PostgreSQL rejected the atomic batch with code ${code}.`],
            { cause: error },
          );
        }
        throw error;
      }
    },
  };
}
