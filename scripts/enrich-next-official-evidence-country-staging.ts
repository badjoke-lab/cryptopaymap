import { createHash } from 'node:crypto';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  candidateSourceRecords,
  evidence,
  sourceCandidates,
  sourceRecords,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const HARD_MAX_TARGETS = 30;
const REQUEST_INTERVAL_MS = 1_100;
const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'CryptoPayMap-country-enrichment/1.0 (+https://github.com/badjoke-lab/cryptopaymap)';
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

type JsonRecord = Record<string, unknown>;

function object(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringMap(value: unknown): Record<string, string> {
  const row = object(value);
  if (!row) return {};
  return Object.fromEntries(
    Object.entries(row).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestedLimit(): number {
  const raw = process.env.CPM_COUNTRY_ENRICH_MAX_TARGETS?.trim();
  const value = raw ? Number(raw) : HARD_MAX_TARGETS;
  if (!Number.isInteger(value) || value < 1 || value > HARD_MAX_TARGETS) {
    throw new Error(`CPM_COUNTRY_ENRICH_MAX_TARGETS must be 1-${HARD_MAX_TARGETS}.`);
  }
  return value;
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing country enrichment outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const limit = requestedLimit();
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({ candidateId: sourceCandidates.id })
    .from(evidence)
    .innerJoin(
      candidateSourceRecords,
      eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId),
    )
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(
      and(
        eq(sourceCandidates.candidateType, 'physical_place'),
        isNull(sourceCandidates.duplicateGroupId),
        inArray(sourceCandidates.candidateStatus, ['new', 'triaged', 'promoted']),
        eq(evidence.evidenceKind, 'official_payment_page'),
        eq(evidence.evidenceClass, 'a'),
        eq(evidence.sourceType, 'official_page'),
        eq(evidence.originRole, 'merchant_side'),
        eq(evidence.polarity, 'supporting'),
        eq(evidence.visibility, 'private'),
        inArray(evidence.reviewStatus, ['pending', 'accepted']),
      ),
    )
    .orderBy(asc(sourceCandidates.id), asc(evidence.id))
    .limit(500);

  const candidateIds = [...new Set(rows.map((row) => row.candidateId))];
  const counters = {
    candidatesScanned: candidateIds.length,
    considered: 0,
    alreadyHasCountry: 0,
    missingBitcoinPaymentTag: 0,
    missingOrigin: 0,
    reverseLookupFailed: 0,
    enriched: 0,
  };
  let lastRequestAt = 0;

  for (const candidateId of candidateIds) {
    if (counters.considered >= limit) break;
    const relations = await db
      .select({
        sourceRecordId: candidateSourceRecords.sourceRecordId,
        relationship: candidateSourceRecords.relationship,
        sourceId: sourceRecords.sourceId,
        externalId: sourceRecords.externalId,
        rawPayload: sourceRecords.rawPayload,
        licenseId: sourceRecords.licenseId,
      })
      .from(candidateSourceRecords)
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(eq(candidateSourceRecords.candidateId, candidateId))
      .orderBy(asc(candidateSourceRecords.sourceRecordId));

    const origin = relations.find((row) => row.relationship === 'origin');
    const originPayload = object(origin?.rawPayload);
    const seed = object(originPayload?.reviewSeed);
    const element = object(originPayload?.element);
    const tags = stringMap(element?.tags);
    const paymentTags = stringMap(seed?.paymentTags);
    const existingCountry = tags['addr:country']?.trim().toUpperCase();
    const cachedCountry = relations
      .map((row) => object(row.rawPayload))
      .find((payload) => payload?.sourceSystem === 'openstreetmap_nominatim')?.countryCode;

    if (
      (existingCountry && COUNTRY_CODE_PATTERN.test(existingCountry)) ||
      (typeof cachedCountry === 'string' && COUNTRY_CODE_PATTERN.test(cachedCountry.toUpperCase()))
    ) {
      counters.alreadyHasCountry += 1;
      continue;
    }

    const lightningTagged = ['yes', 'only'].includes(
      (paymentTags['payment:lightning'] ?? '').toLowerCase(),
    );
    const bitcoinTagged = ['yes', 'only'].includes(
      (paymentTags['payment:bitcoin'] ?? '').toLowerCase(),
    );
    if (!lightningTagged && !bitcoinTagged) {
      counters.missingBitcoinPaymentTag += 1;
      continue;
    }

    const latitude = typeof seed?.latitude === 'number' ? seed.latitude : null;
    const longitude = typeof seed?.longitude === 'number' ? seed.longitude : null;
    if (!origin || latitude === null || longitude === null) {
      counters.missingOrigin += 1;
      continue;
    }
    counters.considered += 1;

    const elapsed = Date.now() - lastRequestAt;
    if (lastRequestAt > 0 && elapsed < REQUEST_INTERVAL_MS) {
      await sleep(REQUEST_INTERVAL_MS - elapsed);
    }

    const url = new URL(NOMINATIM_BASE_URL);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('zoom', '3');
    url.searchParams.set('addressdetails', '1');
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          'user-agent': USER_AGENT,
          accept: 'application/json',
          'accept-language': 'en',
        },
      });
      lastRequestAt = Date.now();
    } catch {
      counters.reverseLookupFailed += 1;
      continue;
    }
    if (!response.ok) {
      counters.reverseLookupFailed += 1;
      continue;
    }
    const body = await response.text();
    let payload: JsonRecord | null = null;
    try {
      payload = object(JSON.parse(body));
    } catch {
      payload = null;
    }
    const address = object(payload?.address);
    const countryCodeRaw = typeof address?.country_code === 'string' ? address.country_code : '';
    const countryCode = countryCodeRaw.trim().toUpperCase();
    if (!COUNTRY_CODE_PATTERN.test(countryCode)) {
      counters.reverseLookupFailed += 1;
      continue;
    }

    const externalId = `nominatim-reverse:${candidateId}`;
    const [existingRecord] = await db
      .select({ id: sourceRecords.id })
      .from(sourceRecords)
      .where(and(eq(sourceRecords.sourceId, origin.sourceId), eq(sourceRecords.externalId, externalId)))
      .limit(1);
    let sourceRecordId = existingRecord?.id ?? null;
    if (sourceRecordId === null) {
      const [inserted] = await db
        .insert(sourceRecords)
        .values({
          sourceId: origin.sourceId,
          externalId,
          sourceUrl: url.toString(),
          rawPayload: {
            sourceSystem: 'openstreetmap_nominatim',
            candidateId,
            latitude,
            longitude,
            countryCode,
            displayName: typeof payload?.display_name === 'string' ? payload.display_name : null,
            placeId: typeof payload?.place_id === 'number' ? payload.place_id : null,
          },
          observedAt: new Date(),
          fetchedAt: new Date(),
          contentHash: createHash('sha256').update(body).digest('hex'),
          licenseId: origin.licenseId,
        })
        .returning({ id: sourceRecords.id });
      sourceRecordId = inserted?.id ?? null;
    }
    if (sourceRecordId === null) {
      counters.reverseLookupFailed += 1;
      continue;
    }
    await db
      .insert(candidateSourceRecords)
      .values({ candidateId, sourceRecordId, relationship: 'supporting' })
      .onConflictDoNothing();
    counters.enriched += 1;
  }

  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      provider: 'OpenStreetMap Nominatim',
      singleThreaded: true,
      minimumRequestIntervalMs: REQUEST_INTERVAL_MS,
      cachedInSourceRecords: true,
      eligiblePaymentTags: ['payment:bitcoin', 'payment:lightning'],
      ...counters,
    }),
  );
}

await main();
