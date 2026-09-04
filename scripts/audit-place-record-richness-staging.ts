import { and, asc, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  acceptanceClaims,
  candidateSourceRecords,
  claimAssets,
  entities,
  evidence,
  locations,
  sourceCandidates,
  sourceRecords,
  verificationEvents,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const TARGET = 'fixed-review-staging';
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function strings(value: unknown): Record<string, string> {
  const valueRecord = record(value);
  return Object.fromEntries(
    Object.entries(valueRecord).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && entry[1].trim().length > 0,
    ),
  );
}

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function increment(map: Map<string, number>, key: string | null | undefined) {
  const normalized = key?.trim() || '<none>';
  map.set(normalized, (map.get(normalized) ?? 0) + 1);
}

function sortedObject(map: Map<string, number>) {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing Place richness audit outside ${TARGET}.`);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const places = await db
    .select({
      candidateId: sourceCandidates.id,
      locationId: locations.id,
      locationSlug: locations.slug,
      name: locations.name,
      entityName: entities.name,
      addressLine: locations.addressLine,
      locality: locations.locality,
      region: locations.region,
      postalCode: locations.postalCode,
      countryCode: locations.countryCode,
      latitude: locations.latitude,
      longitude: locations.longitude,
      websiteUrl: locations.websiteUrl,
      phone: locations.phone,
      description: locations.description,
      openingHours: locations.openingHours,
      amenities: locations.amenities,
      socialLinks: locations.socialLinks,
      claimId: acceptanceClaims.id,
      routeType: acceptanceClaims.routeType,
      processorId: acceptanceClaims.processorId,
      howToPay: acceptanceClaims.howToPay,
      merchantReceives: acceptanceClaims.merchantReceives,
      restrictions: acceptanceClaims.restrictions,
      firstConfirmedAt: acceptanceClaims.firstConfirmedAt,
      lastConfirmedAt: acceptanceClaims.lastConfirmedAt,
      nextReviewAt: acceptanceClaims.nextReviewAt,
    })
    .from(sourceCandidates)
    .innerJoin(locations, eq(locations.id, sourceCandidates.canonicalLocationId))
    .innerJoin(entities, eq(entities.id, locations.entityId))
    .innerJoin(acceptanceClaims, eq(acceptanceClaims.locationId, locations.id))
    .where(
      and(
        eq(sourceCandidates.candidateType, 'physical_place'),
        eq(sourceCandidates.candidateStatus, 'promoted'),
        eq(entities.visibility, 'public'),
        eq(locations.visibility, 'public'),
        eq(acceptanceClaims.visibility, 'public'),
        eq(acceptanceClaims.claimStatus, 'confirmed'),
      ),
    )
    .orderBy(asc(locations.slug));

  const claimIds = places.map((place) => place.claimId);
  const candidateIds = places.map((place) => place.candidateId);
  const [payments, evidenceRows, events, origins] = await Promise.all([
    db.select({ claimId: claimAssets.claimId }).from(claimAssets).where(inArray(claimAssets.claimId, claimIds)),
    db
      .select({ claimId: evidence.claimId })
      .from(evidence)
      .where(
        and(
          inArray(evidence.claimId, claimIds),
          eq(evidence.visibility, 'public'),
          eq(evidence.reviewStatus, 'accepted'),
        ),
      ),
    db
      .select({ claimId: verificationEvents.claimId })
      .from(verificationEvents)
      .where(inArray(verificationEvents.claimId, claimIds)),
    db
      .select({
        candidateId: candidateSourceRecords.candidateId,
        sourceUrl: sourceRecords.sourceUrl,
        rawPayload: sourceRecords.rawPayload,
      })
      .from(candidateSourceRecords)
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(
        and(
          inArray(candidateSourceRecords.candidateId, candidateIds),
          eq(candidateSourceRecords.relationship, 'origin'),
        ),
      ),
  ]);

  const paymentCounts = new Map<string, number>();
  for (const row of payments) paymentCounts.set(row.claimId, (paymentCounts.get(row.claimId) ?? 0) + 1);
  const evidenceCounts = new Map<string, number>();
  for (const row of evidenceRows) {
    if (!row.claimId) continue;
    evidenceCounts.set(row.claimId, (evidenceCounts.get(row.claimId) ?? 0) + 1);
  }
  const eventCounts = new Map<string, number>();
  for (const row of events) eventCounts.set(row.claimId, (eventCounts.get(row.claimId) ?? 0) + 1);
  const originByCandidate = new Map(origins.map((row) => [row.candidateId, row]));

  const sourceSystems = new Map<string, number>();
  const amenityTags = new Map<string, number>();
  const tourismTags = new Map<string, number>();
  const shopTags = new Map<string, number>();
  const officeTags = new Map<string, number>();
  const craftTags = new Map<string, number>();
  const leisureTags = new Map<string, number>();
  const healthcareTags = new Map<string, number>();
  const coverageCounts = new Map<string, number>();
  const missingCounts = new Map<string, number>();
  const missingBySource = new Map<string, Map<string, number>>();
  const records: Array<Record<string, unknown>> = [];

  const fields = [
    'name',
    'addressLine',
    'locality',
    'region',
    'postalCode',
    'coordinates',
    'websiteUrl',
    'phone',
    'description',
    'openingHours',
    'amenities',
    'socialLinks',
    'howToPay',
    'routeType',
    'processorWhenRequired',
    'merchantReceivesKnown',
    'restrictions',
    'firstConfirmedAt',
    'lastConfirmedAt',
    'nextReviewAt',
    'paymentAssets',
    'evidence',
    'verificationHistory',
  ] as const;

  for (const place of places) {
    const origin = originByCandidate.get(place.candidateId);
    const payload = record(origin?.rawPayload);
    const sourceSystem = typeof payload.sourceSystem === 'string' ? payload.sourceSystem : 'unknown';
    increment(sourceSystems, sourceSystem);
    const element = record(payload.element);
    const tags = strings(element.tags);
    increment(amenityTags, tags.amenity);
    increment(tourismTags, tags.tourism);
    increment(shopTags, tags.shop);
    increment(officeTags, tags.office);
    increment(craftTags, tags.craft);
    increment(leisureTags, tags.leisure);
    increment(healthcareTags, tags.healthcare);

    const checks: Record<(typeof fields)[number], boolean> = {
      name: nonEmpty(place.name ?? place.entityName),
      addressLine: nonEmpty(place.addressLine),
      locality: nonEmpty(place.locality),
      region: nonEmpty(place.region),
      postalCode: nonEmpty(place.postalCode),
      coordinates: Number.isFinite(Number(place.latitude)) && Number.isFinite(Number(place.longitude)),
      websiteUrl: nonEmpty(place.websiteUrl) || nonEmpty(origin?.sourceUrl),
      phone: nonEmpty(place.phone),
      description: nonEmpty(place.description) && (place.description?.trim().length ?? 0) >= 40,
      openingHours: nonEmpty(place.openingHours),
      amenities: Array.isArray(place.amenities) && place.amenities.length > 0,
      socialLinks: Array.isArray(place.socialLinks) && place.socialLinks.length > 0,
      howToPay: nonEmpty(place.howToPay) && (place.howToPay?.trim().length ?? 0) >= 20,
      routeType: nonEmpty(place.routeType),
      processorWhenRequired: place.routeType !== 'processor_checkout' || Boolean(place.processorId),
      merchantReceivesKnown: nonEmpty(place.merchantReceives) && place.merchantReceives !== 'not_publicly_confirmed',
      restrictions: nonEmpty(place.restrictions),
      firstConfirmedAt: Boolean(place.firstConfirmedAt),
      lastConfirmedAt: Boolean(place.lastConfirmedAt),
      nextReviewAt: Boolean(place.nextReviewAt),
      paymentAssets: (paymentCounts.get(place.claimId) ?? 0) > 0,
      evidence: (evidenceCounts.get(place.claimId) ?? 0) > 0,
      verificationHistory: (eventCounts.get(place.claimId) ?? 0) > 0,
    };

    const missing: string[] = [];
    for (const field of fields) {
      if (checks[field]) coverageCounts.set(field, (coverageCounts.get(field) ?? 0) + 1);
      else {
        missing.push(field);
        missingCounts.set(field, (missingCounts.get(field) ?? 0) + 1);
        const sourceMap = missingBySource.get(sourceSystem) ?? new Map<string, number>();
        sourceMap.set(field, (sourceMap.get(field) ?? 0) + 1);
        missingBySource.set(sourceSystem, sourceMap);
      }
    }

    const sourceAvailable = {
      phone: Boolean(tags.phone || tags['contact:phone'] || tags.mobile || tags['contact:mobile']),
      openingHours: Boolean(tags.opening_hours),
      website: Boolean(tags.website || tags['contact:website'] || tags.url),
      description: Boolean(tags.description || tags['description:en']),
      socials: Boolean(
        tags['contact:facebook'] ||
          tags['contact:instagram'] ||
          tags['contact:twitter'] ||
          tags.facebook ||
          tags.instagram ||
          tags.twitter,
      ),
    };

    records.push({
      placeSlug: place.locationSlug,
      name: place.name ?? place.entityName,
      countryCode: place.countryCode,
      sourceSystem,
      missing,
      sourceAvailable,
      rawCategorySignals: {
        amenity: tags.amenity ?? null,
        tourism: tags.tourism ?? null,
        shop: tags.shop ?? null,
        office: tags.office ?? null,
        craft: tags.craft ?? null,
        leisure: tags.leisure ?? null,
        healthcare: tags.healthcare ?? null,
      },
      evidenceCount: evidenceCounts.get(place.claimId) ?? 0,
      verificationEventCount: eventCounts.get(place.claimId) ?? 0,
      paymentAssetCount: paymentCounts.get(place.claimId) ?? 0,
      descriptionLength: place.description?.trim().length ?? 0,
    });
  }

  const missingBySourceObject = Object.fromEntries(
    [...missingBySource.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([source, counts]) => [source, sortedObject(counts)]),
  );

  const result = {
    target: TARGET,
    publishedPlaces: places.length,
    imagePolicy: 'ignored_for_richness',
    sourceSystems: sortedObject(sourceSystems),
    categorySignals: {
      amenity: sortedObject(amenityTags),
      tourism: sortedObject(tourismTags),
      shop: sortedObject(shopTags),
      office: sortedObject(officeTags),
      craft: sortedObject(craftTags),
      leisure: sortedObject(leisureTags),
      healthcare: sortedObject(healthcareTags),
    },
    coverage: Object.fromEntries(fields.map((field) => [field, coverageCounts.get(field) ?? 0])),
    missing: sortedObject(missingCounts),
    missingBySource: missingBySourceObject,
    records,
  };

  console.log(JSON.stringify(result, null, 2));
}

await main();
