import { createHash } from 'node:crypto';
import { and, asc, eq, ilike, inArray, isNull } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { candidateSourceRecords, sourceCandidates, sourceRecords } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };
const TARGET = 'fixed-review-staging';
const MAX_TARGETS = 27;
const REQUEST_INTERVAL_MS = 1_100;
const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'CryptoPayMap-country-enrichment/1.0 (+https://github.com/badjoke-lab/cryptopaymap)';
type Rec = Record<string, unknown>;
const rec = (value: unknown): Rec => value && typeof value === 'object' && !Array.isArray(value) ? value as Rec : {};
const stringMap = (value: unknown): Record<string,string> => Object.fromEntries(Object.entries(rec(value)).filter((entry): entry is [string,string] => typeof entry[1] === 'string'));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) throw new Error(`Refusing outside ${TARGET}`);
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const candidates = await db.select({ id: sourceCandidates.id })
    .from(sourceCandidates)
    .where(and(
      eq(sourceCandidates.candidateType, 'physical_place'),
      ilike(sourceCandidates.normalizedName, '%steak%n%shake%'),
      isNull(sourceCandidates.duplicateGroupId),
      inArray(sourceCandidates.candidateStatus, ['new','triaged','promoted']),
    ))
    .orderBy(asc(sourceCandidates.id));
  if (candidates.length !== 44) throw new Error(`Expected 44 released Steak n Shake Candidates; found ${candidates.length}.`);
  const candidateIds = candidates.map((row) => row.id);
  const relations = await db.select({
    candidateId: candidateSourceRecords.candidateId,
    sourceRecordId: candidateSourceRecords.sourceRecordId,
    relationship: candidateSourceRecords.relationship,
    sourceId: sourceRecords.sourceId,
    externalId: sourceRecords.externalId,
    rawPayload: sourceRecords.rawPayload,
    licenseId: sourceRecords.licenseId,
  }).from(candidateSourceRecords)
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(inArray(candidateSourceRecords.candidateId, candidateIds))
    .orderBy(asc(candidateSourceRecords.candidateId), asc(candidateSourceRecords.sourceRecordId));
  const byCandidate = new Map<string, typeof relations>();
  for (const relation of relations) {
    const list = byCandidate.get(relation.candidateId) ?? [];
    list.push(relation);
    byCandidate.set(relation.candidateId, list);
  }

  const counters = { candidatesScanned: 44, alreadyHasCountry: 0, targeted: 0, enriched: 0, us: 0, nonUs: 0, lookupFailed: 0, missingOrigin: 0, missingLightning: 0 };
  let lastRequestAt = 0;
  for (const candidateId of candidateIds) {
    const rows = byCandidate.get(candidateId) ?? [];
    const origin = rows.find((row) => row.relationship === 'origin');
    const payload = rec(origin?.rawPayload);
    const seed = rec(payload.reviewSeed);
    const element = rec(payload.element);
    const tags = stringMap(element.tags);
    const paymentTags = stringMap(seed.paymentTags);
    const cachedCountry = rows.map((row) => rec(row.rawPayload)).find((row) => row.sourceSystem === 'openstreetmap_nominatim')?.countryCode;
    if (/^[A-Z]{2}$/.test(tags['addr:country']?.trim().toUpperCase() ?? '') || (typeof cachedCountry === 'string' && /^[A-Z]{2}$/.test(cachedCountry.trim().toUpperCase()))) {
      counters.alreadyHasCountry += 1;
      continue;
    }
    if (!['yes','only'].includes((paymentTags['payment:lightning'] ?? '').toLowerCase())) {
      counters.missingLightning += 1;
      continue;
    }
    const latitude = typeof seed.latitude === 'number' ? seed.latitude : null;
    const longitude = typeof seed.longitude === 'number' ? seed.longitude : null;
    if (!origin || latitude === null || longitude === null) {
      counters.missingOrigin += 1;
      continue;
    }
    if (counters.targeted >= MAX_TARGETS) throw new Error('Missing-country target count exceeded 27.');
    counters.targeted += 1;
    const elapsed = Date.now() - lastRequestAt;
    if (lastRequestAt > 0 && elapsed < REQUEST_INTERVAL_MS) await sleep(REQUEST_INTERVAL_MS - elapsed);
    const url = new URL(NOMINATIM_BASE_URL);
    url.searchParams.set('format','jsonv2');
    url.searchParams.set('lat',String(latitude));
    url.searchParams.set('lon',String(longitude));
    url.searchParams.set('zoom','3');
    url.searchParams.set('addressdetails','1');
    let response: Response;
    try {
      response = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json', 'accept-language': 'en' } });
      lastRequestAt = Date.now();
    } catch {
      counters.lookupFailed += 1;
      continue;
    }
    if (!response.ok) { counters.lookupFailed += 1; continue; }
    const body = await response.text();
    let result: Rec;
    try { result = rec(JSON.parse(body)); } catch { counters.lookupFailed += 1; continue; }
    const address = rec(result.address);
    const countryCode = typeof address.country_code === 'string' ? address.country_code.trim().toUpperCase() : '';
    if (!/^[A-Z]{2}$/.test(countryCode)) { counters.lookupFailed += 1; continue; }
    if (countryCode === 'US') counters.us += 1; else counters.nonUs += 1;

    const externalId = `nominatim-reverse:${candidateId}`;
    const [existing] = await db.select({ id: sourceRecords.id }).from(sourceRecords)
      .where(and(eq(sourceRecords.sourceId, origin.sourceId), eq(sourceRecords.externalId, externalId))).limit(1);
    let sourceRecordId = existing?.id ?? null;
    if (!sourceRecordId) {
      const now = new Date();
      const [inserted] = await db.insert(sourceRecords).values({
        sourceId: origin.sourceId,
        externalId,
        sourceUrl: url.toString(),
        rawPayload: { sourceSystem: 'openstreetmap_nominatim', candidateId, latitude, longitude, countryCode, displayName: typeof result.display_name === 'string' ? result.display_name : null, placeId: typeof result.place_id === 'number' ? result.place_id : null },
        observedAt: now,
        fetchedAt: now,
        contentHash: createHash('sha256').update(body).digest('hex'),
        licenseId: origin.licenseId,
      }).returning({ id: sourceRecords.id });
      sourceRecordId = inserted?.id ?? null;
    }
    if (!sourceRecordId) { counters.lookupFailed += 1; continue; }
    await db.insert(candidateSourceRecords).values({ candidateId, sourceRecordId, relationship: 'supporting' }).onConflictDoNothing();
    counters.enriched += 1;
  }
  if (counters.targeted !== 27) throw new Error(`Expected exactly 27 missing-country targets; found ${counters.targeted}.`);
  console.log(JSON.stringify({ target: TARGET, merchant: 'Steak n Shake', provider: 'OpenStreetMap Nominatim', singleThreaded: true, minimumRequestIntervalMs: REQUEST_INTERVAL_MS, maxTargets: MAX_TARGETS, ...counters, automaticPublicVisibility: false, candidatePayloadExposed: false }));
}
await main();