import { and, desc, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  candidateSourceRecords,
  importBatches,
  sourceCandidates,
  sourceRecords,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const EXPECTED_ACTOR = 'osm-overpass-adapter';
const EXPECTED_IMPORTER = 'osm-overpass-v1';
const SEARCH_BATCH_LIMIT = 500;
const RECEIPT = {
  batchCount: 9,
  inputCount: 407,
  acceptedCount: 206,
  rejectedCount: 2,
  replayedCount: 199,
  duplicateSignalCount: 8188,
} as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function websiteUrl(rawPayload: unknown): string | null {
  const seed = asRecord(asRecord(rawPayload)?.reviewSeed);
  const value = seed?.websiteUrl;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

type BatchRow = {
  id: string;
  completedAt: Date;
  inputCount: number;
  acceptedCount: number;
  rejectedCount: number;
  replayedCount: number;
  duplicateSignalCount: number;
};

function sum(rows: BatchRow[], key: keyof typeof RECEIPT): number {
  if (key === 'batchCount') return rows.length;
  return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
}

function matchesReceipt(rows: BatchRow[]): boolean {
  return (Object.keys(RECEIPT) as Array<keyof typeof RECEIPT>).every(
    (key) => sum(rows, key) === RECEIPT[key],
  );
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing OSM eligibility audit outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const db = createDatabase(databaseUrl);
  const recent = (await db
    .select({
      id: importBatches.id,
      completedAt: importBatches.completedAt,
      inputCount: importBatches.inputCount,
      acceptedCount: importBatches.acceptedCount,
      rejectedCount: importBatches.rejectedCount,
      replayedCount: importBatches.replayedCount,
      duplicateSignalCount: importBatches.duplicateSignalCount,
    })
    .from(importBatches)
    .where(
      and(
        eq(importBatches.actorId, EXPECTED_ACTOR),
        eq(importBatches.importKind, 'physical_place'),
        eq(importBatches.importerVersion, EXPECTED_IMPORTER),
      ),
    )
    .orderBy(desc(importBatches.completedAt))
    .limit(SEARCH_BATCH_LIMIT)) as BatchRow[];

  const grouped = new Map<string, BatchRow[]>();
  for (const batch of recent) {
    const key = batch.completedAt.toISOString();
    const group = grouped.get(key) ?? [];
    group.push(batch);
    grouped.set(key, group);
  }
  const matches = [...grouped.values()].filter(matchesReceipt);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one Europe-east acquisition matching the bounded receipt; found ${matches.length}.`);
  }
  const batches = matches[0] as BatchRow[];
  const batchIds = batches.map((batch) => batch.id);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateStatus: sourceCandidates.candidateStatus,
      duplicateGroupId: sourceCandidates.duplicateGroupId,
      officialDomain: sourceRecords.officialDomain,
      rawPayload: sourceRecords.rawPayload,
    })
    .from(sourceCandidates)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.candidateId, sourceCandidates.id))
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(
      and(
        inArray(sourceCandidates.importBatchId, batchIds),
        eq(candidateSourceRecords.relationship, 'origin'),
      ),
    );

  const candidateIds = new Set(rows.map((row) => row.candidateId));
  const active = rows.filter((row) => ['new', 'triaged'].includes(row.candidateStatus));
  const duplicateFree = active.filter((row) => row.duplicateGroupId === null);
  const domainPresent = duplicateFree.filter((row) => row.officialDomain !== null);
  const websitePresent = duplicateFree.filter((row) => websiteUrl(row.rawPayload) !== null);
  const websiteAndDomain = duplicateFree.filter(
    (row) => row.officialDomain !== null && websiteUrl(row.rawPayload) !== null,
  );

  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      acquisitionReceiptMatched: true,
      acquisition: RECEIPT,
      candidateRows: rows.length,
      distinctCandidates: candidateIds.size,
      activeNewOrTriaged: active.length,
      duplicateFree: duplicateFree.length,
      duplicateGrouped: active.length - duplicateFree.length,
      duplicateFreeWithOfficialDomain: domainPresent.length,
      duplicateFreeWithWebsiteSeed: websitePresent.length,
      crawlerEligibleShape: websiteAndDomain.length,
      identifiersExposed: false,
      payloadExposed: false,
    }),
  );
}

await main();
