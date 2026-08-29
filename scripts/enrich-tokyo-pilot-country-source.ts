import { and, eq } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  candidateSourceRecords,
  evidence,
  licenses,
  sourceCandidates,
  sourceRecords,
  sources,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const TOKYO_BATCH_ID = '9a7aa03b-ebce-4ee0-ad44-731149450d85';
const SOURCE_NAME = 'OpenStreetMap Nominatim reverse geocoding';

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function seedCoordinates(rawPayload: unknown): { lat: number; lon: number } | null {
  const seed = record(record(rawPayload)?.reviewSeed);
  const lat = seed?.latitude;
  const lon = seed?.longitude;
  return typeof lat === 'number' && typeof lon === 'number' ? { lat, lon } : null;
}

async function sha256(value: unknown): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing country enrichment outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const [odbl] = await db.select({ id: licenses.id }).from(licenses).where(eq(licenses.slug, 'odbl-1-0')).limit(1);
  if (!odbl) throw new Error('ODbL license is required.');
  const existingSource = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.sourceType, 'osm'), eq(sources.name, SOURCE_NAME)))
    .limit(1);
  const sourceId = existingSource[0]?.id ?? (
    await db.insert(sources).values({
      sourceType: 'osm',
      name: SOURCE_NAME,
      baseUrl: 'https://nominatim.openstreetmap.org/',
      defaultLicenseId: odbl.id,
      attributionText: '© OpenStreetMap contributors',
      isActive: true,
    }).returning({ id: sources.id })
  )[0]?.id;
  if (!sourceId) throw new Error('Failed to resolve Nominatim source.');

  const pending = await db
    .select({ candidateId: sourceCandidates.id })
    .from(evidence)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(and(
      eq(sourceCandidates.importBatchId, TOKYO_BATCH_ID),
      eq(sourceCandidates.candidateStatus, 'new'),
      eq(evidence.evidenceKind, 'official_payment_page'),
      eq(evidence.reviewStatus, 'pending'),
      eq(evidence.visibility, 'private'),
    ));
  const ids = [...new Set(pending.map((row) => row.candidateId))].sort();
  let resolvedJP = 0;
  let created = 0;
  let alreadyPersisted = 0;
  let unresolved = 0;

  for (const candidateId of ids) {
    const [origin] = await db
      .select({ rawPayload: sourceRecords.rawPayload })
      .from(candidateSourceRecords)
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(and(
        eq(candidateSourceRecords.candidateId, candidateId),
        eq(candidateSourceRecords.relationship, 'origin'),
      ))
      .limit(1);
    const coordinates = seedCoordinates(origin?.rawPayload);
    if (!coordinates) { unresolved += 1; continue; }

    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(coordinates.lat));
    url.searchParams.set('lon', String(coordinates.lon));
    url.searchParams.set('zoom', '5');
    url.searchParams.set('addressdetails', '1');
    const response = await fetch(url, {
      headers: { 'user-agent': 'CryptoPayMap/0.0.0 (https://github.com/badjoke-lab/cryptopaymap)' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) { unresolved += 1; continue; }
    const payload = record(await response.json());
    const address = record(payload?.address);
    const countryCode = typeof address?.country_code === 'string' ? address.country_code.toUpperCase() : null;
    if (countryCode !== 'JP') { unresolved += 1; continue; }
    resolvedJP += 1;

    const externalId = `candidate:${candidateId}:nominatim-country`;
    const [existing] = await db
      .select({ id: sourceRecords.id })
      .from(sourceRecords)
      .where(and(eq(sourceRecords.sourceId, sourceId), eq(sourceRecords.externalId, externalId)))
      .limit(1);
    let recordId = existing?.id;
    if (!recordId) {
      const fetchedAt = new Date();
      const rawPayload = { sourceSystem: 'openstreetmap_nominatim', countryCode: 'JP' };
      recordId = (
        await db.insert(sourceRecords).values({
          sourceId,
          externalId,
          sourceUrl: url.toString(),
          rawPayload,
          observedAt: fetchedAt,
          fetchedAt,
          contentHash: await sha256(rawPayload),
          licenseId: odbl.id,
        }).returning({ id: sourceRecords.id })
      )[0]?.id;
      if (!recordId) throw new Error('Failed to persist Nominatim country source record.');
      await db.insert(candidateSourceRecords).values({
        candidateId,
        sourceRecordId: recordId,
        relationship: 'supporting',
      });
      created += 1;
    } else {
      alreadyPersisted += 1;
    }
  }

  console.log(JSON.stringify({
    target: EXPECTED_TARGET,
    batchId: TOKYO_BATCH_ID,
    candidates: ids.length,
    resolvedJP,
    sourceRecordsCreated: created,
    alreadyPersisted,
    unresolved,
    candidateStateChanged: false,
    publicDataChanged: false,
    payloadExposed: false,
  }));
}

await main();
