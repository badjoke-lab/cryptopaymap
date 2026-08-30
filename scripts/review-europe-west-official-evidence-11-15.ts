import { and, asc, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  candidateSourceRecords,
  evidence,
  sourceCandidates,
  sourceRecords,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const BATCH_IDS = [
  '7d43f605-5f3e-4a79-a6a9-a222775821be',
  '500467c1-075d-4f01-b2ef-15f141f30c82',
  'cb7bdcb7-e39d-46cb-90fe-0c3c05d45f8e',
  'd079f027-9ea4-4a9a-9e52-a7753d917986',
  'aa493ab1-c32b-4b0f-9df7-944f61f90e4c',
] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringMap(value: unknown): Record<string, string> {
  const source = record(value);
  if (!source) return {};
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing exact Evidence review outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateStatus: sourceCandidates.candidateStatus,
      duplicateGroupId: sourceCandidates.duplicateGroupId,
      canonicalEntityId: sourceCandidates.canonicalEntityId,
      canonicalLocationId: sourceCandidates.canonicalLocationId,
      candidateUpdatedAt: sourceCandidates.updatedAt,
      evidenceId: evidence.id,
      evidenceClass: evidence.evidenceClass,
      evidenceSourceType: evidence.sourceType,
      evidenceOriginRole: evidence.originRole,
      evidencePolarity: evidence.polarity,
      evidenceReviewStatus: evidence.reviewStatus,
      evidenceVisibility: evidence.visibility,
      evidenceUpdatedAt: evidence.updatedAt,
      sourceUrl: evidence.sourceUrl,
    })
    .from(evidence)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(
      and(
        inArray(sourceCandidates.importBatchId, [...BATCH_IDS]),
        eq(evidence.evidenceKind, 'official_payment_page'),
      ),
    )
    .orderBy(asc(sourceCandidates.id), asc(evidence.id));

  const details: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const relations = await db
      .select({ relationship: candidateSourceRecords.relationship, rawPayload: sourceRecords.rawPayload })
      .from(candidateSourceRecords)
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(eq(candidateSourceRecords.candidateId, row.candidateId));
    const origin = relations.find((relation) => relation.relationship === 'origin');
    const originPayload = record(origin?.rawPayload);
    const seed = record(originPayload?.reviewSeed);
    const paymentTags = stringMap(seed?.paymentTags);
    const countryCode =
      relations
        .map((relation) => record(relation.rawPayload))
        .filter((payload) => payload?.sourceSystem === 'openstreetmap_nominatim')
        .map((payload) => payload?.countryCode)
        .find((value): value is string => typeof value === 'string' && /^[A-Z]{2}$/.test(value)) ?? null;
    const structurallyValid =
      ['new', 'triaged'].includes(row.candidateStatus) &&
      row.duplicateGroupId === null &&
      row.canonicalEntityId === null &&
      row.canonicalLocationId === null &&
      row.evidenceClass === 'a' &&
      row.evidenceSourceType === 'official_page' &&
      row.evidenceOriginRole === 'merchant_side' &&
      row.evidencePolarity === 'supporting' &&
      row.evidenceReviewStatus === 'pending' &&
      row.evidenceVisibility === 'private';

    details.push({
      candidateHash: await sha256(row.candidateId),
      candidateUpdatedAt: row.candidateUpdatedAt.toISOString(),
      evidenceId: row.evidenceId,
      evidenceUpdatedAt: row.evidenceUpdatedAt.toISOString(),
      countryCode,
      paymentTags,
      structurallyValid,
      sourceUrl: row.sourceUrl,
    });
  }

  process.stdout.write(
    JSON.stringify({
      target: EXPECTED_TARGET,
      evidenceRows: rows.length,
      structurallyValidRows: details.filter((row) => row.structurallyValid === true).length,
      mutationPerformed: false,
      publicDataChanged: false,
      payloadExposedInLogs: false,
      details,
    }),
  );
}

await main();
