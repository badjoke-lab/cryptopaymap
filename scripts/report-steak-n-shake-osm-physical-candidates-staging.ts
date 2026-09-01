import { and, eq, ilike } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { candidateSourceRecords, sourceCandidates, sourceRecords, sources } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const TARGET = 'fixed-review-staging';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function tags(rawPayload: unknown): Record<string, string> {
  const root = record(rawPayload);
  const element = record(root.element ?? root.rawRecord ?? root.normalizedRecord ?? root);
  const value = record(element.tags ?? record(root.normalizedRecord).paymentTags);
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      typeof child === 'string' ? [[key, child] as const] : [],
    ),
  );
}

function isAffirmative(value: string | undefined): boolean {
  return value === 'yes' || value === 'only' || value === 'true' || value === '1';
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing staging report outside ${TARGET}.`);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      normalizedName: sourceCandidates.normalizedName,
      rawPayload: sourceRecords.rawPayload,
      sourceUrl: sourceRecords.sourceUrl,
      sourceType: sources.sourceType,
    })
    .from(sourceCandidates)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.candidateId, sourceCandidates.id))
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .innerJoin(sources, eq(sources.id, sourceRecords.sourceId))
    .where(
      and(
        eq(sourceCandidates.candidateType, 'physical_place'),
        ilike(sourceCandidates.normalizedName, '%steak%n%shake%'),
        eq(candidateSourceRecords.relationship, 'origin'),
      ),
    );

  const unique = new Map(rows.map((row) => [row.candidateId, row]));
  const candidates = [...unique.values()].map((row) => {
    const paymentTags = tags(row.rawPayload);
    const bitcoin = isAffirmative(paymentTags['payment:bitcoin']);
    const lightning = isAffirmative(paymentTags['payment:lightning']);
    const crypto = isAffirmative(paymentTags['payment:cryptocurrencies']);
    return { ...row, bitcoin, lightning, crypto };
  });

  console.log(
    JSON.stringify({
      target: TARGET,
      merchant: 'Steak n Shake',
      matchingPhysicalCandidates: candidates.length,
      bitcoinTagged: candidates.filter((row) => row.bitcoin).length,
      lightningTagged: candidates.filter((row) => row.lightning).length,
      genericCryptoTagged: candidates.filter((row) => row.crypto).length,
      anyCryptoTagged: candidates.filter((row) => row.bitcoin || row.lightning || row.crypto).length,
      osmOriginCandidates: candidates.filter((row) => row.sourceType === 'osm').length,
      readOnly: true,
      candidatePayloadExposed: false,
    }),
  );
}

await main();
