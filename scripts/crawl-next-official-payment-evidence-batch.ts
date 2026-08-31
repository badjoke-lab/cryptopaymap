import { asc, eq, inArray, isNull, and } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  candidateSourceRecords,
  evidence,
  sourceCandidates,
  sourceRecords,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const MAX_BATCH_IDS = 20;
const SCAN_LIMIT = 20_000;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function websiteUrl(rawPayload: unknown): string | null {
  const seed = record(record(rawPayload)?.reviewSeed);
  const value = seed?.websiteUrl;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing automatic official Evidence crawl outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const [originRows, existingEvidenceRows] = await Promise.all([
    db
      .select({
        candidateId: sourceCandidates.id,
        importBatchId: sourceCandidates.importBatchId,
        officialDomain: sourceRecords.officialDomain,
        rawPayload: sourceRecords.rawPayload,
      })
      .from(sourceCandidates)
      .innerJoin(
        candidateSourceRecords,
        eq(candidateSourceRecords.candidateId, sourceCandidates.id),
      )
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(
        and(
          eq(sourceCandidates.candidateType, 'physical_place'),
          isNull(sourceCandidates.duplicateGroupId),
          inArray(sourceCandidates.candidateStatus, ['new', 'triaged']),
          eq(candidateSourceRecords.relationship, 'origin'),
        ),
      )
      .orderBy(asc(sourceCandidates.id))
      .limit(SCAN_LIMIT),
    db
      .select({ candidateId: candidateSourceRecords.candidateId })
      .from(evidence)
      .innerJoin(
        candidateSourceRecords,
        eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId),
      )
      .where(eq(evidence.evidenceKind, 'official_payment_page')),
  ]);

  const candidatesWithOfficialEvidence = new Set(
    existingEvidenceRows.map((row) => row.candidateId),
  );
  const eligible = originRows.filter(
    (row) =>
      row.importBatchId !== null &&
      row.officialDomain !== null &&
      websiteUrl(row.rawPayload) !== null &&
      !candidatesWithOfficialEvidence.has(row.candidateId),
  );

  const batchIds = [
    ...new Set(eligible.map((row) => row.importBatchId).filter((id): id is string => id !== null)),
  ].slice(0, MAX_BATCH_IDS);

  if (batchIds.length === 0) {
    console.log(
      JSON.stringify({
        target: EXPECTED_TARGET,
        originCandidatesScanned: originRows.length,
        candidatesWithOfficialEvidence: candidatesWithOfficialEvidence.size,
        eligibleWithoutOfficialEvidence: eligible.length,
        selectedBatchIds: 0,
        action: 'no-op',
      }),
    );
    return;
  }

  process.env.CPM_OFFICIAL_EVIDENCE_BATCH_IDS = batchIds.join(',');
  process.env.CPM_OFFICIAL_EVIDENCE_MAX_TARGETS =
    process.env.CPM_OFFICIAL_EVIDENCE_MAX_TARGETS ?? '250';

  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      originCandidatesScanned: originRows.length,
      candidatesWithOfficialEvidence: candidatesWithOfficialEvidence.size,
      eligibleWithoutOfficialEvidence: eligible.length,
      selectedBatchIds: batchIds.length,
      selectedCandidateRows: eligible.filter((row) => batchIds.includes(row.importBatchId ?? '')).length,
    }),
  );

  await import('./crawl-official-payment-evidence-batch');
}

await main();
