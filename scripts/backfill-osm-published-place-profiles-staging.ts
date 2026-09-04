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
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const TARGET = 'fixed-review-staging';
const GENERATED_DESCRIPTION_MARKER =
  'This record tracks verified in-person cryptocurrency payment acceptance.';

type JsonRecord = Record<string, unknown>;
type SocialLink = { platform: string; url: string; handle: string | null };

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

function isThinDescription(value: string | null): boolean {
  return !value?.trim() || value.includes(GENERATED_DESCRIPTION_MARKER);
}

function sourceAmenities(tags: Record<string, string>): string[] {
  const values = new Set<string>();
  if (tags.wheelchair === 'yes') values.add('wheelchair_accessible');
  if (tags.wheelchair === 'limited') values.add('wheelchair_limited');
  if (tags.outdoor_seating === 'yes') values.add('outdoor_seating');
  if (tags.takeaway === 'yes' || tags.takeaway === 'only') values.add('takeaway');
  if (tags.delivery === 'yes') values.add('delivery');
  if (tags.drive_through === 'yes') values.add('drive_through');
  if (tags.internet_access && tags.internet_access !== 'no') values.add('internet_access');
  if (tags.toilets === 'yes') values.add('toilets');
  if (tags.air_conditioning === 'yes') values.add('air_conditioning');
  if (tags.reservation === 'yes' || tags.reservation === 'required') values.add('reservations');
  if (tags.smoking === 'no') values.add('smoke_free');
  return [...values];
}

function sourceSocialLinks(tags: Record<string, string>): SocialLink[] {
  const known: Array<[string, string | undefined]> = [
    ['facebook', first(tags['contact:facebook'], tags.facebook) ?? undefined],
    ['instagram', first(tags['contact:instagram'], tags.instagram) ?? undefined],
    ['twitter', first(tags['contact:twitter'], tags.twitter) ?? undefined],
    ['mastodon', first(tags['contact:mastodon'], tags.mastodon) ?? undefined],
    ['telegram', first(tags['contact:telegram'], tags.telegram) ?? undefined],
  ];
  const links: SocialLink[] = [];
  for (const [platform, raw] of known) {
    if (!raw) continue;
    try {
      const parsed = new URL(raw);
      if (!['http:', 'https:'].includes(parsed.protocol)) continue;
      links.push({ platform, url: parsed.toString(), handle: null });
    } catch {}
  }
  return links;
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing OSM Place profile backfill outside ${TARGET}.`);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      locationId: locations.id,
      locationSlug: locations.slug,
      locationName: locations.name,
      entityName: entities.name,
      websiteUrl: locations.websiteUrl,
      phone: locations.phone,
      description: locations.description,
      openingHours: locations.openingHours,
      amenities: locations.amenities,
      socialLinks: locations.socialLinks,
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
        eq(locations.visibility, 'public'),
        eq(acceptanceClaims.visibility, 'public'),
        eq(acceptanceClaims.claimStatus, 'confirmed'),
      ),
    )
    .orderBy(asc(locations.slug));

  const counters = {
    publishedOrigins: rows.length,
    osmOrigins: 0,
    locationsUpdated: 0,
    descriptionsBackfilled: 0,
    phonesBackfilled: 0,
    openingHoursBackfilled: 0,
    websitesBackfilled: 0,
    amenitiesBackfilled: 0,
    socialLinksBackfilled: 0,
  };
  const unresolvedDescriptions: Array<{ placeSlug: string; name: string }> = [];

  for (const row of rows) {
    const payload = record(row.rawPayload);
    const element = record(payload.element);
    const tags = strings(element.tags);
    if (Object.keys(tags).length < 1) continue;
    counters.osmOrigins += 1;

    const description = isThinDescription(row.description)
      ? first(tags.description, tags['description:en'])
      : null;
    const phone = !row.phone?.trim()
      ? first(tags.phone, tags['contact:phone'], tags.mobile, tags['contact:mobile'])
      : null;
    const openingHours = !row.openingHours?.trim() ? first(tags.opening_hours) : null;
    const website = !row.websiteUrl?.trim()
      ? first(tags.website, tags['contact:website'], tags.url)
      : null;
    const amenities = row.amenities?.length ? [] : sourceAmenities(tags);
    const socialLinks = row.socialLinks?.length ? [] : sourceSocialLinks(tags);

    const updateFields: Record<string, unknown> = {};
    const provenanceFields: string[] = [];
    if (description) {
      updateFields.description = description;
      provenanceFields.push('description');
      counters.descriptionsBackfilled += 1;
    }
    if (phone) {
      updateFields.phone = phone;
      provenanceFields.push('phone');
      counters.phonesBackfilled += 1;
    }
    if (openingHours) {
      updateFields.openingHours = openingHours;
      provenanceFields.push('openingHours');
      counters.openingHoursBackfilled += 1;
    }
    if (website) {
      updateFields.websiteUrl = website;
      provenanceFields.push('websiteUrl');
      counters.websitesBackfilled += 1;
    }
    if (amenities.length > 0) {
      updateFields.amenities = amenities;
      provenanceFields.push('amenities');
      counters.amenitiesBackfilled += 1;
    }
    if (socialLinks.length > 0) {
      updateFields.socialLinks = socialLinks;
      provenanceFields.push('socialLinks');
      counters.socialLinksBackfilled += 1;
    }

    if (provenanceFields.length > 0) {
      updateFields.updatedAt = new Date();
      await db.update(locations).set(updateFields).where(eq(locations.id, row.locationId));
      counters.locationsUpdated += 1;
      for (const fieldPath of provenanceFields) {
        await db
          .insert(provenanceLinks)
          .values({
            subjectType: 'location',
            subjectId: row.locationId,
            fieldPath,
            sourceRecordId: row.sourceRecordId,
            provenanceRole: 'origin',
          })
          .onConflictDoNothing();
      }
    }

    const finalDescription = description ?? row.description;
    if (isThinDescription(finalDescription)) {
      unresolvedDescriptions.push({
        placeSlug: row.locationSlug,
        name: row.locationName ?? row.entityName,
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        target: TARGET,
        ...counters,
        unresolvedDescriptionCount: unresolvedDescriptions.length,
        unresolvedDescriptions,
      },
      null,
      2,
    ),
  );
}

await main();
