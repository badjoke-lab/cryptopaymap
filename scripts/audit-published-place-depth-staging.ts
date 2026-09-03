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
function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing Place depth audit outside ${TARGET}.`);
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
      latitude: locations.latitude,
      longitude: locations.longitude,
      websiteUrl: locations.websiteUrl,
      phone: locations.phone,
      description: locations.description,
      openingHours: locations.openingHours,
      amenities: locations.amenities,
      claimId: acceptanceClaims.id,
      routeType: acceptanceClaims.routeType,
      processorId: acceptanceClaims.processorId,
      howToPay: acceptanceClaims.howToPay,
      merchantReceives: acceptanceClaims.merchantReceives,
      lastConfirmedAt: acceptanceClaims.lastConfirmedAt,
      nextReviewAt: acceptanceClaims.nextReviewAt,
    })
    .from(sourceCandidates)
    .innerJoin(locations, eq(locations.id, sourceCandidates.canonicalLocationId))
    .innerJoin(entities, eq(entities.id, locations.entityId))
    .innerJoin(acceptanceClaims, eq(acceptanceClaims.locationId, locations.id))
    .where(
      and(
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
  const [payments, acceptedEvidence, events, origins] = await Promise.all([
    db
      .select({ claimId: claimAssets.claimId })
      .from(claimAssets)
      .where(inArray(claimAssets.claimId, claimIds)),
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
      .select({ claimId: verificationEvents.claimId, eventType: verificationEvents.eventType })
      .from(verificationEvents)
      .where(inArray(verificationEvents.claimId, claimIds)),
    db
      .select({
        candidateId: candidateSourceRecords.candidateId,
        rawPayload: sourceRecords.rawPayload,
        sourceUrl: sourceRecords.sourceUrl,
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
  for (const row of acceptedEvidence) {
    if (!row.claimId) continue;
    evidenceCounts.set(row.claimId, (evidenceCounts.get(row.claimId) ?? 0) + 1);
  }
  const eventCounts = new Map<string, number>();
  for (const row of events) eventCounts.set(row.claimId, (eventCounts.get(row.claimId) ?? 0) + 1);
  const originByCandidate = new Map(origins.map((row) => [row.candidateId, row]));

  const summaries = places.map((place) => {
    const origin = originByCandidate.get(place.candidateId);
    const payload = record(origin?.rawPayload);
    const sourceSystem = typeof payload.sourceSystem === 'string' ? payload.sourceSystem : 'unknown';
    const missing: string[] = [];
    if (!nonEmpty(place.name ?? place.entityName)) missing.push('name');
    if (!nonEmpty(place.addressLine) || !nonEmpty(place.locality)) missing.push('address');
    if (!Number.isFinite(Number(place.latitude)) || !Number.isFinite(Number(place.longitude))) missing.push('coordinates');
    if (!nonEmpty(place.description)) missing.push('description');
    if (!nonEmpty(place.websiteUrl)) missing.push('websiteUrl');
    if (!nonEmpty(place.howToPay)) missing.push('howToPay');
    if (!nonEmpty(place.routeType)) missing.push('routeType');
    if (!nonEmpty(place.merchantReceives)) missing.push('merchantReceives');
    if (!place.lastConfirmedAt) missing.push('lastConfirmedAt');
    if (!place.nextReviewAt) missing.push('nextReviewAt');
    if ((paymentCounts.get(place.claimId) ?? 0) < 1) missing.push('paymentAssets');
    if ((evidenceCounts.get(place.claimId) ?? 0) < 1) missing.push('evidence');
    if ((eventCounts.get(place.claimId) ?? 0) < 1) missing.push('verificationHistory');
    return {
      placeSlug: place.locationSlug,
      name: place.name ?? place.entityName,
      sourceSystem,
      missing,
      optionalProfile: {
        phone: nonEmpty(place.phone),
        openingHours: nonEmpty(place.openingHours),
        amenities: Array.isArray(place.amenities) && place.amenities.length > 0,
      },
      verificationEvents: eventCounts.get(place.claimId) ?? 0,
    };
  });

  const thin = summaries.filter((place) => place.missing.length > 0);
  const sourceCounts = new Map<string, number>();
  for (const row of summaries) sourceCounts.set(row.sourceSystem, (sourceCounts.get(row.sourceSystem) ?? 0) + 1);
  const missingCounts = new Map<string, number>();
  for (const row of thin) {
    for (const field of row.missing) missingCounts.set(field, (missingCounts.get(field) ?? 0) + 1);
  }

  const result = {
    target: TARGET,
    publishedPlaces: summaries.length,
    sourceSystems: Object.fromEntries([...sourceCounts.entries()].sort()),
    thinPlaces: thin.length,
    missingFields: Object.fromEntries([...missingCounts.entries()].sort()),
    optionalProfileCoverage: {
      phone: summaries.filter((row) => row.optionalProfile.phone).length,
      openingHours: summaries.filter((row) => row.optionalProfile.openingHours).length,
      amenities: summaries.filter((row) => row.optionalProfile.amenities).length,
    },
    placesWithoutVerificationHistory: summaries.filter((row) => row.verificationEvents < 1).length,
    thinRecords: thin,
  };

  console.log(JSON.stringify(result, null, 2));

  if (thin.length > 0) {
    throw new Error(
      `Published Place depth audit found ${thin.length} thin record(s); publication must exclude them until source-backed required fields are available.`,
    );
  }
}

await main();
