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
const MAX_BATCH_IDS = 20;

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

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing OSM eligibility audit outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const db = createDatabase(databaseUrl);
  const [latest] = await db
    .select({ completedAt: importBatches.completedAt })
    .from(importBatches)
    .where(
      and(
        eq(importBatches.actorId, EXPECTED_ACTOR),
        eq(importBatches.importKind, 'physical_place'),
        eq(importBatches.importerVersion, EXPECTED_IMPORTER),
      ),
    )
    .orderBy(desc(importBatches.completedAt))
    .limit(1);
  if (!latest) throw new Error('No bounded OSM import batch exists in fixed-review staging.');

  const batches = await db
    .select({
      id: importBatches.id,
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
        eq(importBatches.completedAt, latest.completedAt),
      ),
    );
  if (batches.length === 0 || batches.length > MAX_BATCH_IDS) {
    throw new Error(`Expected 1-${MAX_BATCH_IDS} batches in latest acquisition set.`);
  }
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

  const sum = (key: 'inputCount' | 'acceptedCount' | 'rejectedCount' | 'replayedCount' | 'duplicateSignalCount') =>
    batches.reduce((total, batch) => total + (batch[key] ?? 0), 0);

  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      latestAcquisition: {
        batchCount: batches.length,
        inputCount: sum('inputCount'),
        acceptedCount: sum('acceptedCount'),
        rejectedCount: sum('rejectedCount'),
        replayedCount: sum('replayedCount'),
        duplicateSignalCount: sum('duplicateSignalCount'),
      },
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
