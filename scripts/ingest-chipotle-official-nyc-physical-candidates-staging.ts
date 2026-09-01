import { and, eq, ilike, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { candidateSourceRecords, importBatches, sourceCandidates, sourceRecords, sources } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const TARGET = 'fixed-review-staging';
const DIRECTORY_URL = 'https://locations.chipotle.com/ny/new-york';
const SOURCE_NAME = 'Chipotle official location directory';
const SOURCE_SCHEMA_VERSION = 'chipotle-location-directory-v1';
const IMPORTER_VERSION = 'chipotle-official-nyc-v1';
const MAX_LOCATIONS = 40;
const MIN_REQUEST_INTERVAL_MS = 250;

type JsonRecord = Record<string, unknown>;
type LocationSeed = {
  url: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string | null;
  latitude: number;
  longitude: number;
};

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function record(value: unknown): JsonRecord { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function normalizeName(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function deterministicUuid(label: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(label))).slice(0, 16);
  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x80;
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    redirect: 'follow', signal: AbortSignal.timeout(20_000),
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; CryptoPayMap/1.0; +https://cryptopaymap.com)', accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9' },
  });
  if (!response.ok) throw new Error(`Chipotle source fetch failed HTTP ${response.status}: ${url}`);
  return response.text();
}
function discoverDetailUrls(html: string): string[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const raw = (match[1] ?? '').replace(/&amp;/g, '&');
    try {
      const url = new URL(raw, DIRECTORY_URL);
      if (url.hostname !== 'locations.chipotle.com') continue;
      if (!/^\/ny\/new-york\/[a-z0-9-]+$/i.test(url.pathname)) continue;
      urls.add(url.toString());
    } catch { /* ignore malformed links */ }
  }
  return [...urls].sort().slice(0, MAX_LOCATIONS);
}
function jsonLdObjects(html: string): JsonRecord[] {
  const out: JsonRecord[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const value = JSON.parse(match[1] ?? 'null') as unknown;
      const queue: unknown[] = Array.isArray(value) ? [...value] : [value];
      while (queue.length) {
        const item = queue.shift();
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const row = item as JsonRecord;
          out.push(row);
          const graph = row['@graph'];
          if (Array.isArray(graph)) queue.push(...graph);
        }
      }
    } catch { /* ignore invalid JSON-LD */ }
  }
  return out;
}
function seedFromDetail(url: string, html: string): LocationSeed | null {
  for (const item of jsonLdObjects(html)) {
    const geo = record(item.geo);
    const address = record(item.address);
    const latitude = Number(geo.latitude);
    const longitude = Number(geo.longitude);
    const street = typeof address.streetAddress === 'string' ? address.streetAddress.trim() : '';
    const city = typeof address.addressLocality === 'string' ? address.addressLocality.trim() : '';
    const state = typeof address.addressRegion === 'string' ? address.addressRegion.trim() : '';
    const postalCode = typeof address.postalCode === 'string' || typeof address.postalCode === 'number' ? String(address.postalCode).trim() : null;
    const name = typeof item.name === 'string' ? item.name.trim() : 'Chipotle Mexican Grill';
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !street || !city || !state) continue;
    return { url, name, address: street, city, state, postalCode, latitude, longitude };
  }
  return null;
}
function coordinatesFromPayload(rawPayload: unknown): { latitude: number; longitude: number } | null {
  const seed = record(record(rawPayload).reviewSeed);
  const latitude = Number(seed.latitude); const longitude = Number(seed.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}
function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = Math.PI / 180; const lat1 = a.latitude * rad; const lat2 = b.latitude * rad;
  const dLat = (b.latitude - a.latitude) * rad; const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) throw new Error(`Refusing Chipotle ingestion outside ${TARGET}.`);
  const databaseUrl = process.env.DATABASE_URL?.trim(); if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const listingHtml = await fetchHtml(DIRECTORY_URL);
  const detailUrls = discoverDetailUrls(listingHtml);
  if (detailUrls.length < 31) throw new Error(`Expected at least 31 official NYC Chipotle detail links; found ${detailUrls.length}.`);

  const discovered: LocationSeed[] = [];
  let detailFetchFailures = 0; let structuredDataFailures = 0;
  for (const url of detailUrls) {
    try {
      const html = await fetchHtml(url);
      const seed = seedFromDetail(url, html);
      if (seed) discovered.push(seed); else structuredDataFailures += 1;
    } catch { detailFetchFailures += 1; }
    await sleep(MIN_REQUEST_INTERVAL_MS);
  }
  if (discovered.length < 31) throw new Error(`Only ${discovered.length} official Chipotle locations had usable coordinates.`);

  const db = createDatabase(databaseUrl);
  let source = (await db.select().from(sources).where(and(eq(sources.sourceType, 'official_site'), eq(sources.name, SOURCE_NAME))).limit(1))[0];
  if (!source) [source] = await db.insert(sources).values({ sourceType: 'official_site', name: SOURCE_NAME, baseUrl: 'https://locations.chipotle.com/', attributionText: 'Chipotle Mexican Grill official location directory', isActive: true }).returning();
  if (!source) throw new Error('Failed to resolve Chipotle official location source.');

  const externalIds = discovered.map((item) => `chipotle:${new URL(item.url).pathname}`);
  const existingSameSource = await db.select({ externalId: sourceRecords.externalId }).from(sourceRecords).where(and(eq(sourceRecords.sourceId, source.id), inArray(sourceRecords.externalId, externalIds)));
  const existingIds = new Set(existingSameSource.flatMap((row) => row.externalId ? [row.externalId] : []));

  const existingChipotleRows = await db.select({ rawPayload: sourceRecords.rawPayload }).from(sourceCandidates)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.candidateId, sourceCandidates.id))
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(and(eq(sourceCandidates.candidateType, 'physical_place'), ilike(sourceCandidates.normalizedName, '%chipotle%')));
  const existingCoordinates = existingChipotleRows.flatMap((row) => { const c = coordinatesFromPayload(row.rawPayload); return c ? [c] : []; });

  const fresh = discovered.filter((item) => {
    const externalId = `chipotle:${new URL(item.url).pathname}`;
    if (existingIds.has(externalId)) return false;
    return !existingCoordinates.some((coords) => distanceMeters(coords, item) < 80);
  });
  const now = new Date(); const batchId = crypto.randomUUID(); const requestId = crypto.randomUUID();
  await db.insert(importBatches).values({
    id: batchId, requestId, actorId: 'system:chipotle-official-location-directory', actorType: 'system', sourceId: source.id,
    importKind: 'physical_place', sourceSchemaVersion: SOURCE_SCHEMA_VERSION, importerVersion: IMPORTER_VERSION,
    inputChecksum: await sha256(JSON.stringify(discovered.map((x) => [x.url,x.latitude,x.longitude]))), inputCount: discovered.length,
    acceptedCount: fresh.length, rejectedCount: structuredDataFailures + detailFetchFailures,
    replayedCount: discovered.length - fresh.length, outOfScopeCount: 0, duplicateSignalCount: 0, automaticConfirmedCount: 0,
    rejectionSummary: { detailFetchFailures, structuredDataFailures }, startedAt: now, completedAt: now,
  });

  for (const item of fresh) {
    const externalId = `chipotle:${new URL(item.url).pathname}`;
    const sourceRecordId = await deterministicUuid(`source-record:${source.id}:${externalId}`);
    const candidateId = await deterministicUuid(`candidate:${source.id}:${externalId}`);
    const rawPayload = { sourceSystem: 'chipotle_official_location_directory', importerVersion: IMPORTER_VERSION, reviewSeed: { name: item.name, candidateType: 'physical_place', address: item.address, city: item.city, state: item.state, postalCode: item.postalCode, countryCode: 'US', latitude: item.latitude, longitude: item.longitude, websiteUrl: item.url } };
    await db.insert(sourceRecords).values({ id: sourceRecordId, sourceId: source.id, externalId, sourceUrl: item.url, rawPayload, officialDomain: 'chipotle.com', observedAt: now, fetchedAt: now, contentHash: await sha256(JSON.stringify(rawPayload)) });
    await db.insert(sourceCandidates).values({ id: candidateId, candidateType: 'physical_place', normalizedName: normalizeName(item.name), candidateStatus: 'new', priority: 950, duplicateGroupId: null, firstSeenAt: now, lastSeenAt: now, importBatchId: batchId, canonicalEntityId: null, canonicalLocationId: null });
    await db.insert(candidateSourceRecords).values({ candidateId, sourceRecordId, relationship: 'origin' });
  }

  console.log(JSON.stringify({ target: TARGET, source: SOURCE_NAME, listing: DIRECTORY_URL, detailLinks: detailUrls.length, verifiedOfficialLocations: discovered.length, newPhysicalCandidates: fresh.length, replayedOrNearbyExisting: discovered.length - fresh.length, detailFetchFailures, structuredDataFailures, automaticConfirmedCount: 0, automaticPublicVisibility: false, candidatePayloadExposed: false }));
}

await main();