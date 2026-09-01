import { and, eq, ilike } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { candidateSourceRecords, sourceCandidates, sourceRecords } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const TARGET = 'fixed-review-staging';
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringMap(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record(value)).flatMap(([key, child]) =>
      typeof child === 'string' ? [[key, child] as const] : [],
    ),
  );
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing staging normalization outside ${TARGET}.`);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      sourceRecordId: sourceRecords.id,
      rawPayload: sourceRecords.rawPayload,
    })
    .from(sourceCandidates)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.candidateId, sourceCandidates.id))
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(
      and(
        eq(sourceCandidates.candidateType, 'physical_place'),
        ilike(sourceCandidates.normalizedName, '%steak%n%shake%'),
        eq(candidateSourceRecords.relationship, 'origin'),
      ),
    );

  const unique = new Map(rows.map((row) => [row.candidateId, row]));
  let directUs = 0;
  let normalized = 0;
  let alreadyNormalized = 0;
  let skippedNonUsOrMissingCountry = 0;
  let skippedMissingGeometry = 0;
  let skippedMissingLightning = 0;

  for (const row of unique.values()) {
    const root = record(row.rawPayload);
    const element = record(root.element ?? root.rawRecord ?? root.normalizedRecord ?? root);
    const tags = stringMap(element.tags);
    if ((tags['addr:country'] ?? '').trim().toUpperCase() !== 'US') {
      skippedNonUsOrMissingCountry += 1;
      continue;
    }
    directUs += 1;

    const center = record(element.center);
    const latitude = finiteNumber(element.lat) ?? finiteNumber(center.lat);
    const longitude = finiteNumber(element.lon) ?? finiteNumber(center.lon);
    if (latitude === null || longitude === null) {
      skippedMissingGeometry += 1;
      continue;
    }

    const lightning = (tags['payment:lightning'] ?? '').trim().toLowerCase();
    if (!['yes', 'only', 'true', '1'].includes(lightning)) {
      skippedMissingLightning += 1;
      continue;
    }

    const name = tags.name?.trim();
    if (!name) {
      skippedMissingGeometry += 1;
      continue;
    }

    const existingSeed = record(root.reviewSeed);
    const matches =
      existingSeed.name === name &&
      existingSeed.latitude === latitude &&
      existingSeed.longitude === longitude &&
      record(existingSeed.paymentTags)['payment:lightning'] === tags['payment:lightning'];
    if (matches) {
      alreadyNormalized += 1;
      continue;
    }

    await db
      .update(sourceRecords)
      .set({
        rawPayload: {
          ...root,
          reviewSeed: {
            ...existingSeed,
            name,
            latitude,
            longitude,
            countryCode: 'US',
            paymentTags: tags,
            phone: tags.phone ?? tags['contact:phone'] ?? null,
          },
        },
      })
      .where(eq(sourceRecords.id, row.sourceRecordId));
    normalized += 1;
  }

  console.log(JSON.stringify({
    target: TARGET,
    merchant: 'Steak n Shake',
    candidatesScanned: unique.size,
    directUs,
    normalized,
    alreadyNormalized,
    skippedNonUsOrMissingCountry,
    skippedMissingGeometry,
    skippedMissingLightning,
    candidatePayloadExposed: false,
  }));
}

await main();
