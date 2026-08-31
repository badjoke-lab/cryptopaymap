import { and, desc, eq } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { importBatches } from '../src/db/schema';

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
    throw new Error('Refusing OSM batch resolution outside fixed-review staging.');
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

  console.log(matches[0]!.map((row) => row.id).sort().join(','));
}

await main();
