import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { candidateSourceRecords, evidence, sourceCandidates } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const MAX_BATCH_IDS = 200;
const SCAN_LIMIT = 5_000;

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing automatic batch selection outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      importBatchId: sourceCandidates.importBatchId,
      candidateId: sourceCandidates.id,
    })
    .from(evidence)
    .innerJoin(
      candidateSourceRecords,
      eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId),
    )
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(
      and(
        eq(sourceCandidates.candidateType, 'physical_place'),
        isNull(sourceCandidates.duplicateGroupId),
        inArray(sourceCandidates.candidateStatus, ['new', 'triaged', 'promoted']),
        eq(evidence.evidenceKind, 'official_payment_page'),
        eq(evidence.evidenceClass, 'a'),
        eq(evidence.sourceType, 'official_page'),
        eq(evidence.originRole, 'merchant_side'),
        eq(evidence.polarity, 'supporting'),
        eq(evidence.visibility, 'private'),
        inArray(evidence.reviewStatus, ['pending', 'accepted']),
      ),
    )
    .orderBy(asc(sourceCandidates.id), asc(evidence.id))
    .limit(SCAN_LIMIT);

  const batchIds = [
    ...new Set(
      rows
        .map((row) => row.importBatchId)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    ),
  ].slice(0, MAX_BATCH_IDS);

  if (batchIds.length === 0) {
    console.log(
      JSON.stringify({
        target: EXPECTED_TARGET,
        eligibleEvidenceRowsScanned: rows.length,
        selectedBatchIds: 0,
        action: 'no-op',
      }),
    );
    return;
  }

  process.env.CPM_OFFICIAL_EVIDENCE_BATCH_IDS = batchIds.join(',');
  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      eligibleEvidenceRowsScanned: rows.length,
      selectedBatchIds: batchIds.length,
      selectedCandidateRows: rows.length,
    }),
  );

  await import('./promote-confirm-official-evidence-batch');
}

await main();
