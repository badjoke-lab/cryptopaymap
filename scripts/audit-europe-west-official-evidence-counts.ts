import { and, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { candidateSourceRecords, evidence, sourceCandidates } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const BATCH_IDS = [
  'd0e17010-611c-48b2-a75d-8b389c1bee60',
  '5c85e86a-bc05-4f9d-a1f3-9d5e6135ef81',
  '8d9d6627-48f6-43e7-b7f0-7a90e1ed4689',
  '8e2c7c6a-e300-4747-90f7-290327870426',
  '3808ea78-195f-4558-8088-37c172be6b63',
] as const;

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing Europe-west Evidence audit outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      batchId: sourceCandidates.importBatchId,
      candidateId: sourceCandidates.id,
      evidenceId: evidence.id,
      evidenceClass: evidence.evidenceClass,
      reviewStatus: evidence.reviewStatus,
      visibility: evidence.visibility,
    })
    .from(evidence)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(
      and(
        inArray(sourceCandidates.importBatchId, [...BATCH_IDS]),
        eq(evidence.evidenceKind, 'official_payment_page'),
      ),
    );

  const byBatch = BATCH_IDS.map((batchId, index) => {
    const batchRows = rows.filter((row) => row.batchId === batchId);
    const uniqueEvidence = new Map(batchRows.map((row) => [row.evidenceId, row]));
    const uniqueCandidates = new Set(batchRows.map((row) => row.candidateId));
    const evidenceRows = [...uniqueEvidence.values()];
    return {
      batch: index + 1,
      officialEvidence: evidenceRows.length,
      candidatesWithOfficialEvidence: uniqueCandidates.size,
      pendingPrivateA: evidenceRows.filter(
        (row) =>
          row.evidenceClass === 'a' &&
          row.reviewStatus === 'pending' &&
          row.visibility === 'private',
      ).length,
      acceptedEvidence: evidenceRows.filter((row) => row.reviewStatus === 'accepted').length,
    };
  });

  process.stdout.write(
    JSON.stringify({
      target: EXPECTED_TARGET,
      batches: byBatch,
      totals: {
        officialEvidence: byBatch.reduce((sum, row) => sum + row.officialEvidence, 0),
        candidatesWithOfficialEvidence: byBatch.reduce(
          (sum, row) => sum + row.candidatesWithOfficialEvidence,
          0,
        ),
        pendingPrivateA: byBatch.reduce((sum, row) => sum + row.pendingPrivateA, 0),
        acceptedEvidence: byBatch.reduce((sum, row) => sum + row.acceptedEvidence, 0),
      },
      candidatePayloadExposed: false,
    }),
  );
}

await main();
