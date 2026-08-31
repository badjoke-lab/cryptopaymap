import { and, asc, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { candidateSourceRecords, evidence, sourceCandidates, sourceRecords } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const BATCH_IDS = [
  '717d2960-e20a-4199-b36b-d338c6b00fe5',
  '9cbf6d49-655b-448a-bb85-bfed2be27ad2',
  '2ce88936-2f37-4131-8806-9f39677aa40e',
  '10d759a6-993e-44b7-ad29-64afd21a6f6f',
  '6b80094e-82de-4373-9705-3db969162a9e',
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
    throw new Error('Refusing private target inspection outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateStatus: sourceCandidates.candidateStatus,
      duplicateGroupId: sourceCandidates.duplicateGroupId,
      evidenceId: evidence.id,
      evidenceSourceUrl: evidence.sourceUrl,
      evidenceReviewStatus: evidence.reviewStatus,
      evidenceVisibility: evidence.visibility,
      evidenceUpdatedAt: evidence.updatedAt,
      officialDomain: sourceRecords.officialDomain,
    })
    .from(evidence)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .innerJoin(sourceRecords, eq(sourceRecords.id, evidence.sourceRecordId))
    .where(and(inArray(sourceCandidates.importBatchId, [...BATCH_IDS]), eq(evidence.evidenceKind, 'official_payment_page')))
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
    const element = record(originPayload?.element);
    const tags = stringMap(element?.tags);
    const countrySources = relations
      .map((relation) => record(relation.rawPayload))
      .filter((payload) => payload?.sourceSystem === 'openstreetmap_nominatim')
      .map((payload) => ({ countryCode: payload?.countryCode ?? null, displayName: payload?.displayName ?? null }));

    details.push({
      candidateHash: await sha256(row.candidateId),
      candidateStatus: row.candidateStatus,
      duplicateGrouped: row.duplicateGroupId !== null,
      evidenceId: row.evidenceId,
      evidenceSourceUrl: row.evidenceSourceUrl,
      evidenceReviewStatus: row.evidenceReviewStatus,
      evidenceVisibility: row.evidenceVisibility,
      evidenceUpdatedAt: row.evidenceUpdatedAt.toISOString(),
      officialDomain: row.officialDomain,
      name: seed?.name ?? null,
      latitude: seed?.latitude ?? null,
      longitude: seed?.longitude ?? null,
      websiteUrl: seed?.websiteUrl ?? null,
      paymentTags: seed?.paymentTags ?? null,
      osmType: element?.type ?? null,
      osmId: element?.id ?? null,
      osmTags: {
        shop: tags.shop ?? null,
        amenity: tags.amenity ?? null,
        office: tags.office ?? null,
        tourism: tags.tourism ?? null,
        addrCountry: tags['addr:country'] ?? null,
        addrCity: tags['addr:city'] ?? null,
        addrStreet: tags['addr:street'] ?? null,
        addrHousenumber: tags['addr:housenumber'] ?? null,
      },
      countrySources,
    });
  }

  process.stdout.write(JSON.stringify({
    target: EXPECTED_TARGET,
    evidenceRows: rows.length,
    mutationPerformed: false,
    publicDataChanged: false,
    payloadExposedInLogs: false,
    details,
  }));
}

await main();
