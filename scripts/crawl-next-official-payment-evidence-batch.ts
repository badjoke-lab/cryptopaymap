import { and, asc, eq, inArray, isNull, like } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  candidateSourceRecords,
  evidence,
  sourceCandidates,
  sourceRecords,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const MAX_BATCH_IDS = 50;
const MAX_TARGETS = 250;
const MAX_PARTITIONS = 16;
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

function targetLimit(): number {
  const raw = process.env.CPM_OFFICIAL_EVIDENCE_MAX_TARGETS?.trim();
  const value = raw ? Number(raw) : MAX_TARGETS;
  if (!Number.isInteger(value) || value < 1 || value > MAX_TARGETS) {
    throw new Error(`CPM_OFFICIAL_EVIDENCE_MAX_TARGETS must be 1-${MAX_TARGETS}.`);
  }
  return value;
}

function partitionConfig(): { count: number; index: number } {
  const count = Number(process.env.CPM_OFFICIAL_EVIDENCE_PARTITION_COUNT ?? '1');
  const index = Number(process.env.CPM_OFFICIAL_EVIDENCE_PARTITION_INDEX ?? '0');
  if (!Number.isInteger(count) || count < 1 || count > MAX_PARTITIONS) {
    throw new Error(`CPM_OFFICIAL_EVIDENCE_PARTITION_COUNT must be 1-${MAX_PARTITIONS}.`);
  }
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new Error('CPM_OFFICIAL_EVIDENCE_PARTITION_INDEX must be within the configured partition count.');
  }
  return { count, index };
}

function candidatePartition(candidateId: string, count: number): number {
  const compact = candidateId.replace(/-/g, '');
  return Number.parseInt(compact.slice(0, 8), 16) % count;
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing automatic official Evidence crawl outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const limit = targetLimit();
  const partition = partitionConfig();
  const db = createDatabase(databaseUrl);

  const [originRows, existingEvidenceRows, attemptedRows] = await Promise.all([
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
    db
      .select({ candidateId: candidateSourceRecords.candidateId })
      .from(candidateSourceRecords)
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(like(sourceRecords.externalId, 'candidate:%:official-payment-crawl-attempt:v2')),
  ]);

  const candidatesWithOfficialEvidence = new Set(existingEvidenceRows.map((row) => row.candidateId));
  const attemptedCandidates = new Set(attemptedRows.map((row) => row.candidateId));
  const eligible = originRows.filter(
    (row) =>
      row.importBatchId !== null &&
      row.officialDomain !== null &&
      websiteUrl(row.rawPayload) !== null &&
      !candidatesWithOfficialEvidence.has(row.candidateId) &&
      !attemptedCandidates.has(row.candidateId) &&
      candidatePartition(row.candidateId, partition.count) === partition.index,
  );
  const selected = eligible.slice(0, limit);
  const batchIds = [
    ...new Set(selected.map((row) => row.importBatchId).filter((id): id is string => id !== null)),
  ];

  if (batchIds.length === 0 || selected.length === 0) {
    console.log(
      JSON.stringify({
        target: EXPECTED_TARGET,
        originCandidatesScanned: originRows.length,
        candidatesWithOfficialEvidence: candidatesWithOfficialEvidence.size,
        attemptedCandidates: attemptedCandidates.size,
        eligibleWithoutOfficialEvidence: eligible.length,
        partition,
        selectedBatchIds: 0,
        selectedCandidateRows: 0,
        action: 'no-op',
      }),
    );
    return;
  }
  if (batchIds.length > MAX_BATCH_IDS) {
    throw new Error(`Selected Candidates span ${batchIds.length} batches; maximum is ${MAX_BATCH_IDS}.`);
  }

  process.env.CPM_OFFICIAL_EVIDENCE_BATCH_IDS = batchIds.join(',');
  process.env.CPM_OFFICIAL_EVIDENCE_CANDIDATE_IDS = selected.map((row) => row.candidateId).join(',');
  process.env.CPM_OFFICIAL_EVIDENCE_MAX_TARGETS = String(selected.length);

  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      originCandidatesScanned: originRows.length,
      candidatesWithOfficialEvidence: candidatesWithOfficialEvidence.size,
      attemptedCandidates: attemptedCandidates.size,
      eligibleWithoutOfficialEvidence: eligible.length,
      partition,
      selectedBatchIds: batchIds.length,
      selectedCandidateRows: selected.length,
      exactCandidateSelection: true,
    }),
  );

  await import('./crawl-official-payment-evidence-batch');
}

await main();
