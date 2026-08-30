import { and, asc, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  candidateSourceRecords,
  evidence,
  sourceCandidates,
  sourceRecords,
  sources,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const NOMINATIM_ORIGIN = 'https://nominatim.openstreetmap.org';
const SOURCE_NAME = 'OpenStreetMap Nominatim';
const MAX_TARGETS = 5;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function batchIdsFromEnvironment(): string[] {
  const ids = [
    ...new Set(
      (process.env.CPM_REVIEW_BATCH_IDS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  if (ids.length === 0 || ids.length > 5 || ids.some((id) => !UUID_PATTERN.test(id))) {
    throw new Error('CPM_REVIEW_BATCH_IDS must contain 1-5 UUIDs.');
  }
  return ids;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function reverseCountry(latitude: number, longitude: number) {
  const url = new URL('/reverse', NOMINATIM_ORIGIN);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('zoom', '3');
  url.searchParams.set('addressdetails', '1');

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en',
      'User-Agent': 'CryptoPayMap/3.0 (+https://github.com/badjoke-lab/cryptopaymap)',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Nominatim reverse lookup failed with HTTP ${response.status}.`);

  const body = record(await response.json());
  const address = record(body?.address);
  const countryCode = typeof address?.country_code === 'string' ? address.country_code.toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error('Nominatim response did not contain a country code.');

  return { countryCode, sourceUrl: url.toString() };
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing country enrichment outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const db = createDatabase(databaseUrl);
  const batchIds = batchIdsFromEnvironment();

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateType: sourceCandidates.candidateType,
      candidateStatus: sourceCandidates.candidateStatus,
      duplicateGroupId: sourceCandidates.duplicateGroupId,
      canonicalEntityId: sourceCandidates.canonicalEntityId,
      canonicalLocationId: sourceCandidates.canonicalLocationId,
    })
    .from(evidence)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(
      and(
        inArray(sourceCandidates.importBatchId, batchIds),
        eq(evidence.evidenceKind, 'official_payment_page'),
        eq(evidence.evidenceClass, 'a'),
        eq(evidence.sourceType, 'official_page'),
        eq(evidence.originRole, 'merchant_side'),
        eq(evidence.polarity, 'supporting'),
        eq(evidence.visibility, 'private'),
        eq(evidence.reviewStatus, 'pending'),
      ),
    )
    .orderBy(asc(sourceCandidates.id));

  const unique = new Map(rows.map((row) => [row.candidateId, row]));
  if (unique.size > MAX_TARGETS) throw new Error(`Refusing to enrich more than ${MAX_TARGETS} candidates.`);

  let eligible = 0;
  let alreadyEnriched = 0;
  let requested = 0;
  let enriched = 0;
  let skippedNonLightning = 0;

  const [existingSource] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.sourceType, 'directory'), eq(sources.name, SOURCE_NAME)))
    .limit(1);

  const source =
    existingSource ??
    (
      await db
        .insert(sources)
        .values({
          sourceType: 'directory',
          name: SOURCE_NAME,
          baseUrl: NOMINATIM_ORIGIN,
          attributionText: 'OpenStreetMap contributors',
          isActive: true,
        })
        .returning({ id: sources.id })
    )[0];
  if (!source) throw new Error('Failed to resolve Nominatim source.');

  for (const candidate of unique.values()) {
    const structurallyEligible =
      candidate.candidateType === 'physical_place' &&
      candidate.duplicateGroupId === null &&
      ['new', 'triaged'].includes(candidate.candidateStatus) &&
      candidate.canonicalEntityId === null &&
      candidate.canonicalLocationId === null;
    if (!structurallyEligible) continue;

    const relations = await db
      .select({
        relationship: candidateSourceRecords.relationship,
        sourceRecordId: sourceRecords.id,
        sourceId: sourceRecords.sourceId,
        externalId: sourceRecords.externalId,
        rawPayload: sourceRecords.rawPayload,
      })
      .from(candidateSourceRecords)
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(eq(candidateSourceRecords.candidateId, candidate.candidateId));

    const existingCountry = relations.find((relation) => {
      const payload = record(relation.rawPayload);
      return (
        relation.sourceId === source.id &&
        payload?.sourceSystem === 'openstreetmap_nominatim' &&
        typeof payload.countryCode === 'string' &&
        /^[A-Z]{2}$/.test(payload.countryCode)
      );
    });
    if (existingCountry) {
      alreadyEnriched += 1;
      continue;
    }

    const origin = relations.find((relation) => relation.relationship === 'origin');
    const originPayload = record(origin?.rawPayload);
    const seed = record(originPayload?.reviewSeed);
    const paymentTags = stringMap(seed?.paymentTags);
    const lightningTagged = ['yes', 'only'].includes(
      (paymentTags['payment:lightning'] ?? '').toLowerCase(),
    );
    if (!lightningTagged) {
      skippedNonLightning += 1;
      continue;
    }

    const latitude = typeof seed?.latitude === 'number' ? seed.latitude : null;
    const longitude = typeof seed?.longitude === 'number' ? seed.longitude : null;
    if (latitude === null || longitude === null) throw new Error('Eligible candidate lacks coordinates.');
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new Error('Eligible candidate has invalid coordinates.');
    }

    eligible += 1;
    if (requested > 0) await sleep(1_100);
    const lookup = await reverseCountry(latitude, longitude);
    requested += 1;

    const externalId = `candidate-country:${candidate.candidateId}:v1`;
    const [existingRecord] = await db
      .select({ id: sourceRecords.id })
      .from(sourceRecords)
      .where(and(eq(sourceRecords.sourceId, source.id), eq(sourceRecords.externalId, externalId)))
      .limit(1);

    const sourceRecord =
      existingRecord ??
      (
        await db
          .insert(sourceRecords)
          .values({
            sourceId: source.id,
            externalId,
            sourceUrl: lookup.sourceUrl,
            rawPayload: {
              sourceSystem: 'openstreetmap_nominatim',
              lookupKind: 'reverse_country',
              countryCode: lookup.countryCode,
            },
            fetchedAt: new Date(),
          })
          .returning({ id: sourceRecords.id })
      )[0];
    if (!sourceRecord) throw new Error('Failed to persist Nominatim source record.');

    await db
      .insert(candidateSourceRecords)
      .values({
        candidateId: candidate.candidateId,
        sourceRecordId: sourceRecord.id,
        relationship: 'supporting',
      })
      .onConflictDoNothing();
    enriched += 1;
  }

  process.stdout.write(
    JSON.stringify({
      target: EXPECTED_TARGET,
      batchCount: batchIds.length,
      officialEvidenceCandidates: unique.size,
      eligible,
      alreadyEnriched,
      requested,
      enriched,
      skippedNonLightning,
      evidenceCreated: 0,
      automaticConfirmedCount: 0,
      candidateStateChanged: false,
      publicDataChanged: false,
      payloadExposed: false,
    }),
  );
}

await main();
