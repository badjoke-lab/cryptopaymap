import { readFile } from 'node:fs/promises';
import { and, eq } from 'drizzle-orm';
import { createDatabase } from '../src/db/client.ts';
import { entities, locations, sourceCandidates } from '../src/db/schema/index.ts';

const TARGET = 'fixed-review-staging';
const SOURCE_FILE = 'sheetz-official-directory.json';

function text(value) {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}
function normalize(value) {
  return text(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function postal(value) {
  return text(value).split('-')[0] ?? '';
}
function addressKey(address, city, state, zip) {
  return [normalize(address), normalize(city), normalize(state), postal(zip)].join('|');
}
function radians(value) {
  return (value * Math.PI) / 180;
}
function distanceMeters(aLat, aLon, bLat, bLon) {
  const earthRadius = 6_371_000;
  const dLat = radians(bLat - aLat);
  const dLon = radians(bLon - aLon);
  const lat1 = radians(aLat);
  const lat2 = radians(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing Sheetz overlap audit outside ${TARGET}.`);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const parsed = JSON.parse(await readFile(SOURCE_FILE, 'utf8'));
  if (!Array.isArray(parsed.rows)) throw new Error(`${SOURCE_FILE} is missing rows.`);
  const official = parsed.rows;
  const eligible = official.filter((row) => row?.features?.cryptoFlexaPay === true);
  if (eligible.length === 0) throw new Error('No current official cryptoFlexaPay=true stores were found.');

  const db = createDatabase(databaseUrl);
  const publishedRows = await db
    .select({
      candidateId: sourceCandidates.id,
      locationId: locations.id,
      locationName: locations.name,
      entityName: entities.name,
      addressLine: locations.addressLine,
      locality: locations.locality,
      region: locations.region,
      postalCode: locations.postalCode,
      latitude: locations.latitude,
      longitude: locations.longitude,
    })
    .from(sourceCandidates)
    .innerJoin(locations, eq(locations.id, sourceCandidates.canonicalLocationId))
    .innerJoin(entities, eq(entities.id, locations.entityId))
    .where(
      and(
        eq(sourceCandidates.candidateStatus, 'promoted'),
        eq(entities.visibility, 'public'),
        eq(locations.visibility, 'public'),
      ),
    );

  const publishedByLocation = new Map(publishedRows.map((row) => [row.locationId, row]));
  const published = [...publishedByLocation.values()];
  const sheetzPublished = published.filter((row) =>
    /\bsheetz\b/i.test(`${row.locationName ?? ''} ${row.entityName ?? ''}`),
  );
  const addressIndex = new Map();
  for (const row of published) {
    const key = addressKey(row.addressLine, row.locality, row.region, row.postalCode);
    if (!key.replaceAll('|', '')) continue;
    const bucket = addressIndex.get(key) ?? [];
    bucket.push(row);
    addressIndex.set(key, bucket);
  }

  const matches = eligible.map((store) => {
    const storeNumber = text(store.storeNumber);
    const lat = Number(store.latitude);
    const lon = Number(store.longitude);
    const exactAddress = addressIndex.get(addressKey(store.address, store.city, store.state, store.zip)) ?? [];
    const nearbySheetz = Number.isFinite(lat) && Number.isFinite(lon)
      ? sheetzPublished
          .map((row) => ({
            row,
            distanceMeters: distanceMeters(lat, lon, Number(row.latitude), Number(row.longitude)),
          }))
          .filter((candidate) => Number.isFinite(candidate.distanceMeters) && candidate.distanceMeters <= 150)
          .sort((left, right) => left.distanceMeters - right.distanceMeters)
      : [];
    const locationIds = new Set([
      ...exactAddress.map((row) => row.locationId),
      ...nearbySheetz.map((candidate) => candidate.row.locationId),
    ]);
    return {
      storeNumber,
      state: text(store.state),
      exactAddressLocationIds: exactAddress.map((row) => row.locationId),
      nearbySheetz: nearbySheetz.map((candidate) => ({
        locationId: candidate.row.locationId,
        name: candidate.row.locationName ?? candidate.row.entityName,
        distanceMeters: Math.round(candidate.distanceMeters * 10) / 10,
      })),
      matchedLocationIds: [...locationIds],
    };
  });

  const matched = matches.filter((row) => row.matchedLocationIds.length > 0);
  const ambiguous = matches.filter((row) => row.matchedLocationIds.length > 1);
  const existingMatchedLocationIds = new Set(matched.flatMap((row) => row.matchedLocationIds));
  const publishedSheetzMatched = new Set(
    sheetzPublished
      .filter((row) => existingMatchedLocationIds.has(row.locationId))
      .map((row) => row.locationId),
  );
  const publishedSheetzUnmatched = sheetzPublished.filter((row) => !publishedSheetzMatched.has(row.locationId));

  const result = {
    target: TARGET,
    officialDirectoryFetched: official.length,
    officialCryptoFlexaPayTrue: eligible.length,
    officialCryptoFlexaPayFalse: official.filter((row) => row?.features?.cryptoFlexaPay === false).length,
    officialCryptoCurrencyAcceptanceTrue: official.filter((row) => row?.features?.cryptoCurrencyAcceptance === true).length,
    publishedPhysicalLocations: published.length,
    publishedSheetzByName: sheetzPublished.length,
    eligibleExactAddressMatches: matches.filter((row) => row.exactAddressLocationIds.length > 0).length,
    eligibleNearbySheetzMatches: matches.filter((row) => row.nearbySheetz.length > 0).length,
    eligibleMatchedExisting: matched.length,
    eligibleUnmatched: eligible.length - matched.length,
    ambiguousEligibleMatches: ambiguous.length,
    matchedExistingLocationIds: existingMatchedLocationIds.size,
    publishedSheetzMatchedToCurrentEligible: publishedSheetzMatched.size,
    publishedSheetzNotMatchedToCurrentEligible: publishedSheetzUnmatched.length,
    ambiguousMatches: ambiguous,
    unmatchedPublishedSheetz: publishedSheetzUnmatched.map((row) => ({
      locationId: row.locationId,
      name: row.locationName ?? row.entityName,
      addressLine: row.addressLine,
      locality: row.locality,
      region: row.region,
      postalCode: row.postalCode,
      latitude: row.latitude,
      longitude: row.longitude,
    })),
  };

  console.log(JSON.stringify(result, null, 2));
  if (ambiguous.length > 0) {
    throw new Error(`Sheetz overlap audit found ${ambiguous.length} ambiguous official-to-canonical matches.`);
  }
}

await main();
