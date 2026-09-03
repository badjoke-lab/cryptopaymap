import { and, asc, eq, ilike } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  acceptanceClaims,
  candidateSourceRecords,
  locations,
  sourceCandidates,
  sourceRecords,
  verificationEvents,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const TARGET = 'fixed-review-staging';
const SOURCE_SYSTEM = 'chipotle_official_location_directory';
const REASON_CODE = 'official_locator_coming_soon';
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function isComingSoon(value: unknown): boolean {
  return typeof value === 'string' && /\bcoming\s+soon\b/i.test(value);
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing Chipotle coming-soon quarantine outside ${TARGET}.`);
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
      locationVisibility: locations.visibility,
      claimId: acceptanceClaims.id,
      claimVisibility: acceptanceClaims.visibility,
      sourceUrl: sourceRecords.sourceUrl,
      rawPayload: sourceRecords.rawPayload,
      relationship: candidateSourceRecords.relationship,
    })
    .from(sourceCandidates)
    .innerJoin(locations, eq(locations.id, sourceCandidates.canonicalLocationId))
    .innerJoin(acceptanceClaims, eq(acceptanceClaims.locationId, locations.id))
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.candidateId, sourceCandidates.id))
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(
      and(
        eq(sourceCandidates.candidateType, 'physical_place'),
        eq(sourceCandidates.candidateStatus, 'promoted'),
        ilike(sourceCandidates.normalizedName, '%chipotle%'),
      ),
    )
    .orderBy(asc(locations.slug));

  const targets = rows.filter((row) => {
    if (row.relationship !== 'origin') return false;
    const payload = record(row.rawPayload);
    if (payload.sourceSystem !== SOURCE_SYSTEM) return false;
    const seed = record(payload.reviewSeed);
    return isComingSoon(seed.name) || isComingSoon(row.locationName);
  });

  let hiddenLocations = 0;
  let hiddenClaims = 0;
  let eventsCreated = 0;
  const quarantined: Array<{ placeSlug: string; officialUrl: string | null }> = [];

  for (const target of targets) {
    const payload = record(target.rawPayload);
    const seed = record(payload.reviewSeed);
    const officialUrl =
      typeof seed.websiteUrl === 'string' && seed.websiteUrl.trim().length > 0
        ? seed.websiteUrl.trim()
        : target.sourceUrl;
    quarantined.push({ placeSlug: target.locationSlug, officialUrl });

    if (target.locationVisibility !== 'hidden') {
      await db
        .update(locations)
        .set({ visibility: 'hidden', locationStatus: 'unknown', updatedAt: new Date() })
        .where(eq(locations.id, target.locationId));
      hiddenLocations += 1;
    } else {
      await db
        .update(locations)
        .set({ locationStatus: 'unknown', updatedAt: new Date() })
        .where(eq(locations.id, target.locationId));
    }

    if (target.claimVisibility === 'public') {
      const now = new Date();
      await db
        .update(acceptanceClaims)
        .set({ visibility: 'hidden', updatedAt: now })
        .where(eq(acceptanceClaims.id, target.claimId));
      hiddenClaims += 1;

      const existing = await db
        .select({ id: verificationEvents.id })
        .from(verificationEvents)
        .where(
          and(
            eq(verificationEvents.claimId, target.claimId),
            eq(verificationEvents.eventType, 'hidden'),
            eq(verificationEvents.reasonCode, REASON_CODE),
          ),
        )
        .limit(1);
      if (existing.length < 1) {
        await db.insert(verificationEvents).values({
          claimId: target.claimId,
          eventType: 'hidden',
          fromVisibility: 'public',
          toVisibility: 'hidden',
          reasonCode: REASON_CODE,
          effectiveAt: now,
          publicSummary:
            'Official Chipotle locator identifies this location as Coming Soon, so it is hidden until opening can be verified.',
          actorType: 'system',
          actorId: null,
        });
        eventsCreated += 1;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        target: TARGET,
        merchant: 'Chipotle',
        comingSoonTargets: targets.length,
        hiddenLocations,
        hiddenClaims,
        verificationEventsCreated: eventsCreated,
        quarantined,
      },
      null,
      2,
    ),
  );
}

await main();
