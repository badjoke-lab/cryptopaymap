import { and, asc, desc, eq } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { importBatches } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const EXPECTED_ACTOR = 'osm-overpass-adapter';
const EXPECTED_IMPORTER = 'osm-overpass-v1';
const MAX_BATCH_IDS = 20;

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing latest OSM batch resolution outside fixed-review staging.');
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

  const rows = await db
    .select({ id: importBatches.id })
    .from(importBatches)
    .where(
      and(
        eq(importBatches.actorId, EXPECTED_ACTOR),
        eq(importBatches.importKind, 'physical_place'),
        eq(importBatches.importerVersion, EXPECTED_IMPORTER),
        eq(importBatches.completedAt, latest.completedAt),
      ),
    )
    .orderBy(asc(importBatches.id));

  if (rows.length === 0 || rows.length > MAX_BATCH_IDS) {
    throw new Error(`Expected 1-${MAX_BATCH_IDS} batches in the latest OSM acquisition set.`);
  }

  console.log(rows.map((row) => row.id).join(','));
}

await main();
