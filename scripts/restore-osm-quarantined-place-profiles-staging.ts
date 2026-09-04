import { and, asc, eq } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  acceptanceClaims,
  candidateSourceRecords,
  entities,
  locations,
  provenanceLinks,
  sourceCandidates,
  sourceRecords,
  verificationEvents,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const TARGET = 'fixed-review-staging';
const QUARANTINE_REASON = 'thin_public_place_profile';
const RESTORE_REASON = 'source_backed_osm_profile_restored';
const GENERATED_DESCRIPTION_MARKER =
  'This record tracks verified in-person cryptocurrency payment acceptance.';
const REVERSE_MAX = Number.parseInt(process.env.CPM_OSM_PROFILE_REVERSE_MAX ?? '100', 10);
const REVERSE_DELAY_MS = 1_100;

type JsonRecord = Record<string, unknown>;

type ReverseResult = {
  display_name?: unknown;
  address?: unknown;
};

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function strings(value: unknown): Record<string, string> {
  const object = record(value);
  return Object.fromEntries(
    Object.entries(object).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0,
    ),
  );
}

function first(...values: Array<string | undefined | null>): string | null {
  return values.map((value) => value?.trim()).find((value) => Boolean(value)) ?? null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function thinDescription(value: string | null): boolean {
  return !value?.trim() || value.includes(GENERATED_DESCRIPTION_MARKER);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compact(values: Array<string | null | undefined>): string[] {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
}

function addressFromTags(tags: Record<string, string>): {
  addressLine: string | null;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string | null;
  fields: string[];
} {
  const full = first(tags['addr:full']);
  const house = first(tags['addr:housenumber']);
  const street = first(tags['addr:street'], tags['addr:place']);
  const line = full ?? (street ? compact([house, street]).join(' ') : null);
  const locality = first(
    tags['addr:city'],
    tags['addr:town'],
    tags['addr:village'],
    tags['addr:municipality'],
    tags['addr:suburb'],
    tags['addr:place'],
  );
  const region = first(tags['addr:state'], tags['addr:province'], tags['addr:region']);
  const postalCode = first(tags['addr:postcode']);
  const countryCode = first(tags['addr:country'])?.toUpperCase() ?? null;
  const fields = [
    ...(line ? ['addressLine'] : []),
    ...(locality ? ['locality'] : []),
    ...(region ? ['region'] : []),
    ...(postalCode ? ['postalCode'] : []),
    ...(countryCode ? ['countryCode'] : []),
  ];
  return { addressLine: line, locality, region, postalCode, countryCode, fields };
}

function descriptiveProfile(tags: Record<string, string>): string | null {
  const direct = first(tags.description, tags['description:en']);
  if (direct) return direct;

  const facts: string[] = [];
  for (const [label, key] of [
    ['amenity', 'amenity'],
    ['shop', 'shop'],
    ['office', 'office'],
    ['tourism', 'tourism'],
    ['craft', 'craft'],
    ['healthcare', 'healthcare'],
    ['leisure', 'leisure'],
    ['cuisine', 'cuisine'],
    ['brand', 'brand'],
    ['operator', 'operator'],
  ] as const) {
    const value = first(tags[key]);
    if (value) facts.push(`${label}: ${value}`);
  }
  if (facts.length < 1) return null;
  return `OpenStreetMap profile — ${facts.join('; ')}.`;
}

async function reverseAddress(latitude: number, longitude: number): Promise<{
  addressLine: string | null;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string | null;
} | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('zoom', '18');
  url.searchParams.set('addressdetails', '1');
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'CryptoPayMap-staging-profile-repair/1.0 (+https://github.com/badjoke-lab/cryptopaymap)',
      Accept: 'application/json',
    },
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as ReverseResult;
  const address = strings(payload.address);
  const road = first(
    address.road,
    address.pedestrian,
    address.footway,
    address.residential,
    address.retail,
    address.neighbourhood,
  );
  const house = first(address.house_number);
  const addressLine = road ? compact([house, road]).join(' ') : first(address.shop, address.amenity, address.building);
  const locality = first(
    address.city,
    address.town,
    address.village,
    address.municipality,
    address.borough,
    address.suburb,
    address.county,
  );
  const region = first(address.state, address.state_district, address.region);
  const postalCode = first(address.postcode);
  const countryCode = first(address.country_code)?.toUpperCase() ?? null;
  return { addressLine, locality, region, postalCode, countryCode };
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing OSM Place restore outside ${TARGET}.`);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      locationId: locations.id,
      placeSlug: locations.slug,
      name: locations.name,
      entityName: entities.name,
      locationVisibility: locations.visibility,
      addressLine: locations.addressLine,
      locality: locations.locality,
      region: locations.region,
      postalCode: locations.postalCode,
      countryCode: locations.countryCode,
      latitude: locations.latitude,
      longitude: locations.longitude,
      description: locations.description,
      claimId: acceptanceClaims.id,
      claimVisibility: acceptanceClaims.visibility,
      claimStatus: acceptanceClaims.claimStatus,
      sourceRecordId: sourceRecords.id,
      rawPayload: sourceRecords.rawPayload,
    })
    .from(sourceCandidates)
    .innerJoin(locations, eq(locations.id, sourceCandidates.canonicalLocationId))
    .innerJoin(entities, eq(entities.id, locations.entityId))
    .innerJoin(acceptanceClaims, eq(acceptanceClaims.locationId, locations.id))
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.candidateId, sourceCandidates.id))
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(
      and(
        eq(sourceCandidates.candidateType, 'physical_place'),
        eq(sourceCandidates.candidateStatus, 'promoted'),
        eq(candidateSourceRecords.relationship, 'origin'),
        eq(entities.visibility, 'public'),
        eq(acceptanceClaims.claimStatus, 'confirmed'),
      ),
    )
    .orderBy(asc(locations.slug));

  let osmRows = 0;
  let reverseLookups = 0;
  let reverseFailures = 0;
  let restoredPlaces = 0;
  let restoredClaims = 0;
  let locationsUpdated = 0;
  let descriptionsBackfilled = 0;
  let addressesBackfilled = 0;
  let provenanceLinksCreated = 0;
  const unresolved: Array<{ placeSlug: string; missingFields: string[] }> = [];

  for (const row of rows) {
    const payload = record(row.rawPayload);
    const element = record(payload.element);
    const tags = strings(element.tags);
    if (Object.keys(tags).length < 1) continue;
    osmRows += 1;

    const tagAddress = addressFromTags(tags);
    const description = thinDescription(row.description) ? descriptiveProfile(tags) : null;

    let finalAddressLine = row.addressLine ?? tagAddress.addressLine;
    let finalLocality = row.locality ?? tagAddress.locality;
    let finalRegion = row.region ?? tagAddress.region;
    let finalPostalCode = row.postalCode ?? tagAddress.postalCode;
    let finalCountryCode = row.countryCode ?? tagAddress.countryCode;

    const needsReverse = !nonEmpty(finalAddressLine) || !nonEmpty(finalLocality);
    if (
      needsReverse &&
      reverseLookups < REVERSE_MAX &&
      Number.isFinite(row.latitude) &&
      Number.isFinite(row.longitude)
    ) {
      if (reverseLookups > 0) await sleep(REVERSE_DELAY_MS);
      reverseLookups += 1;
      try {
        const reverse = await reverseAddress(row.latitude, row.longitude);
        if (reverse) {
          finalAddressLine = finalAddressLine ?? reverse.addressLine;
          finalLocality = finalLocality ?? reverse.locality;
          finalRegion = finalRegion ?? reverse.region;
          finalPostalCode = finalPostalCode ?? reverse.postalCode;
          finalCountryCode = finalCountryCode ?? reverse.countryCode;
        } else {
          reverseFailures += 1;
        }
      } catch {
        reverseFailures += 1;
      }
    }

    const updateFields: Record<string, unknown> = {};
    const provenanceFields = new Set<string>();
    if (!nonEmpty(row.addressLine) && nonEmpty(finalAddressLine)) {
      updateFields.addressLine = finalAddressLine;
      if (tagAddress.addressLine) provenanceFields.add('addressLine');
    }
    if (!nonEmpty(row.locality) && nonEmpty(finalLocality)) {
      updateFields.locality = finalLocality;
      if (tagAddress.locality) provenanceFields.add('locality');
    }
    if (!nonEmpty(row.region) && nonEmpty(finalRegion)) {
      updateFields.region = finalRegion;
      if (tagAddress.region) provenanceFields.add('region');
    }
    if (!nonEmpty(row.postalCode) && nonEmpty(finalPostalCode)) {
      updateFields.postalCode = finalPostalCode;
      if (tagAddress.postalCode) provenanceFields.add('postalCode');
    }
    if (!nonEmpty(row.countryCode) && nonEmpty(finalCountryCode)) {
      updateFields.countryCode = finalCountryCode;
      if (tagAddress.countryCode) provenanceFields.add('countryCode');
    }
    if (description) {
      updateFields.description = description;
      provenanceFields.add('description');
      descriptionsBackfilled += 1;
    }

    if (Object.keys(updateFields).length > 0) {
      updateFields.updatedAt = new Date();
      await db.update(locations).set(updateFields).where(eq(locations.id, row.locationId));
      locationsUpdated += 1;
      if (!nonEmpty(row.addressLine) && nonEmpty(finalAddressLine)) addressesBackfilled += 1;
      for (const fieldPath of provenanceFields) {
        const inserted = await db
          .insert(provenanceLinks)
          .values({
            subjectType: 'location',
            subjectId: row.locationId,
            fieldPath,
            sourceRecordId: row.sourceRecordId,
            provenanceRole: 'origin',
          })
          .onConflictDoNothing()
          .returning({ id: provenanceLinks.id });
        provenanceLinksCreated += inserted.length;
      }
    }

    const finalDescription = description ?? row.description;
    const missingFields = [
      ...(!nonEmpty(finalAddressLine) || !nonEmpty(finalLocality) ? ['address'] : []),
      ...(thinDescription(finalDescription) ? ['description'] : []),
    ];

    if (missingFields.length > 0) {
      unresolved.push({ placeSlug: row.placeSlug, missingFields });
      continue;
    }

    const wasHidden = row.locationVisibility === 'hidden' || row.claimVisibility === 'hidden';
    if (!wasHidden) continue;

    if (row.locationVisibility === 'hidden') {
      await db
        .update(locations)
        .set({ visibility: 'public', updatedAt: new Date() })
        .where(eq(locations.id, row.locationId));
      restoredPlaces += 1;
    }
    if (row.claimVisibility === 'hidden') {
      await db
        .update(acceptanceClaims)
        .set({ visibility: 'public', updatedAt: new Date() })
        .where(eq(acceptanceClaims.id, row.claimId));
      restoredClaims += 1;
    }

    await db.insert(verificationEvents).values({
      claimId: row.claimId,
      eventType: 'restored',
      fromVisibility: row.claimVisibility,
      toVisibility: 'public',
      reasonCode: RESTORE_REASON,
      effectiveAt: new Date(),
      publicSummary: 'Restored after source-backed OSM profile data was completed.',
      internalNote: `Reversed quarantine reason: ${QUARANTINE_REASON}.`,
      actorType: 'system',
      actorId: null,
    });
  }

  console.log(
    JSON.stringify(
      {
        target: TARGET,
        osmRows,
        reverseLookups,
        reverseFailures,
        locationsUpdated,
        descriptionsBackfilled,
        addressesBackfilled,
        provenanceLinksCreated,
        restoredPlaces,
        restoredClaims,
        unresolvedCount: unresolved.length,
        unresolved,
      },
      null,
      2,
    ),
  );
}

await main();
