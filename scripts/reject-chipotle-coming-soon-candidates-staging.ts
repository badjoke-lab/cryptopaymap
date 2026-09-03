import { and, asc, eq, ilike, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  candidateSourceRecords,
  sourceCandidates,
  sourceRecords,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const TARGET = 'fixed-review-staging';
const SOURCE_SYSTEM = 'chipotle_official_location_directory';
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing Chipotle candidate rejection outside ${TARGET}.`);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateStatus: sourceCandidates.candidateStatus,
      rawPayload: sourceRecords.rawPayload,
      relationship: candidateSourceRecords.relationship,
    })
    .from(sourceCandidates)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.candidateId, sourceCandidates.id))
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(
      and(
        eq(sourceCandidates.candidateType, 'physical_place'),
        ilike(sourceCandidates.normalizedName, '%chipotle%'),
        inArray(sourceCandidates.candidateStatus, ['new', 'triaged', 'linked']),
      ),
    )
    .orderBy(asc(sourceCandidates.id));

  const candidateIds = new Set<string>();
  for (const row of rows) {
    if (row.relationship !== 'origin') continue;
    const payload = record(row.rawPayload);
    if (payload.sourceSystem !== SOURCE_SYSTEM) continue;
    const seed = record(payload.reviewSeed);
    if (typeof seed.name === 'string' && /\bcoming\s+soon\b/i.test(seed.name)) {
      candidateIds.add(row.candidateId);
    }
  }

  const rejected: string[] = [];
  for (const candidateId of [...candidateIds].sort()) {
    await db
      .update(sourceCandidates)
      .set({ candidateStatus: 'rejected', updatedAt: new Date() })
      .where(eq(sourceCandidates.id, candidateId));
    rejected.push(candidateId);
  }

  console.log(
    JSON.stringify({
      target: TARGET,
      merchant: 'Chipotle',
      rejectedComingSoonCandidates: rejected.length,
      candidateIds: rejected,
    }),
  );
}

await main();
