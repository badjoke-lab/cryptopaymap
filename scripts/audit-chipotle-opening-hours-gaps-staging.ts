import { and, asc, eq, ilike } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  candidateSourceRecords,
  locations,
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
    throw new Error(`Refusing Chipotle gap audit outside ${TARGET}.`);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateStatus: sourceCandidates.candidateStatus,
      locationSlug: locations.slug,
      locationName: locations.name,
      openingHours: locations.openingHours,
      sourceUrl: sourceRecords.sourceUrl,
      rawPayload: sourceRecords.rawPayload,
      relationship: candidateSourceRecords.relationship,
    })
    .from(sourceCandidates)
    .innerJoin(locations, eq(locations.id, sourceCandidates.canonicalLocationId))
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.candidateId, sourceCandidates.id))
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(
      and(
        eq(sourceCandidates.candidateType, 'physical_place'),
        eq(sourceCandidates.candidateStatus, 'promoted'),
        ilike(sourceCandidates.normalizedName, '%chipotle%'),
      ),
    )
    .orderBy(asc(locations.slug));

  const officialOrigins = rows.filter((row) => {
    const payload = record(row.rawPayload);
    return row.relationship === 'origin' && payload.sourceSystem === SOURCE_SYSTEM;
  });
  const gaps = officialOrigins
    .filter((row) => typeof row.openingHours !== 'string' || row.openingHours.trim().length < 1)
    .map((row) => {
      const seed = record(record(row.rawPayload).reviewSeed);
      const reviewSeedUrl =
        typeof seed.websiteUrl === 'string' && seed.websiteUrl.trim().length > 0
          ? seed.websiteUrl.trim()
          : null;
      return {
        placeSlug: row.locationSlug,
        name: row.locationName,
        officialUrl: reviewSeedUrl ?? row.sourceUrl,
      };
    });

  console.log(
    JSON.stringify(
      {
        target: TARGET,
        merchant: 'Chipotle',
        officialPublishedOrigins: officialOrigins.length,
        missingOpeningHours: gaps.length,
        gaps,
      },
      null,
      2,
    ),
  );
}

await main();
