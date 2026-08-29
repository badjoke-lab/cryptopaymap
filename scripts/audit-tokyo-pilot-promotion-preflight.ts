import { and, eq } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  candidateSourceRecords,
  evidence,
  sourceCandidates,
  sourceRecords,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const TOKYO_BATCH_ID = '9a7aa03b-ebce-4ee0-ad44-731149450d85';

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringMap(value: unknown): Record<string, string> {
  const valueRecord = record(value);
  if (!valueRecord) return {};
  return Object.fromEntries(
    Object.entries(valueRecord).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing pilot preflight outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const pendingRows = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateStatus: sourceCandidates.candidateStatus,
      duplicateGroupId: sourceCandidates.duplicateGroupId,
      canonicalEntityId: sourceCandidates.canonicalEntityId,
      canonicalLocationId: sourceCandidates.canonicalLocationId,
    })
    .from(evidence)
    .innerJoin(
      candidateSourceRecords,
      eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId),
    )
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(
      and(
        eq(sourceCandidates.importBatchId, TOKYO_BATCH_ID),
        eq(evidence.evidenceKind, 'official_payment_page'),
        eq(evidence.reviewStatus, 'pending'),
        eq(evidence.visibility, 'private'),
      ),
    );

  const uniqueCandidates = new Map(pendingRows.map((row) => [row.candidateId, row]));
  let promotableState = 0;
  let withOriginSnapshot = 0;
  let withCountryTag = 0;
  let withLightningTag = 0;
  let withBitcoinTag = 0;
  let withCryptoGenericTag = 0;

  for (const candidate of uniqueCandidates.values()) {
    const promotable =
      ['new', 'triaged'].includes(candidate.candidateStatus) &&
      candidate.duplicateGroupId === null &&
      candidate.canonicalEntityId === null &&
      candidate.canonicalLocationId === null;
    if (!promotable) continue;
    promotableState += 1;

    const origins = await db
      .select({ rawPayload: sourceRecords.rawPayload })
      .from(candidateSourceRecords)
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(
        and(
          eq(candidateSourceRecords.candidateId, candidate.candidateId),
          eq(candidateSourceRecords.relationship, 'origin'),
        ),
      )
      .limit(1);
    const raw = record(origins[0]?.rawPayload);
    const seed = record(raw?.reviewSeed);
    const element = record(raw?.element);
    const tags = stringMap(element?.tags);
    const paymentTags = stringMap(seed?.paymentTags);
    if (
      typeof seed?.name === 'string' &&
      typeof seed?.latitude === 'number' &&
      typeof seed?.longitude === 'number'
    ) {
      withOriginSnapshot += 1;
    }
    if (typeof tags['addr:country'] === 'string' && tags['addr:country'].trim().length > 0) {
      withCountryTag += 1;
    }
    if (['yes', 'only'].includes((paymentTags['payment:lightning'] ?? '').toLowerCase())) {
      withLightningTag += 1;
    }
    if (['yes', 'only'].includes((paymentTags['payment:bitcoin'] ?? '').toLowerCase())) {
      withBitcoinTag += 1;
    }
    if (['yes', 'only'].includes((paymentTags['payment:cryptocurrencies'] ?? '').toLowerCase())) {
      withCryptoGenericTag += 1;
    }
  }

  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      batchId: TOKYO_BATCH_ID,
      pendingOfficialEvidenceCandidates: uniqueCandidates.size,
      promotableState,
      withOriginSnapshot,
      withCountryTag,
      withLightningTag,
      withBitcoinTag,
      withCryptoGenericTag,
      mutationPerformed: false,
      payloadExposed: false,
    }),
  );
}

await main();
