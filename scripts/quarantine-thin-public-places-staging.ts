import { and, asc, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  acceptanceClaims,
  entities,
  locations,
  sourceCandidates,
  verificationEvents,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const TARGET = 'fixed-review-staging';
const REASON_CODE = 'thin_public_place_profile';
const UPDATE_CHUNK_SIZE = 250;

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function chunks<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size));
  return out;
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing thin Place quarantine outside ${TARGET}.`);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      locationId: locations.id,
      locationSlug: locations.slug,
      locationVisibility: locations.visibility,
      addressLine: locations.addressLine,
      locality: locations.locality,
      description: locations.description,
      claimId: acceptanceClaims.id,
      claimVisibility: acceptanceClaims.visibility,
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

  const targets = rows
    .map((row) => ({
      ...row,
      missingFields: [
        ...(!nonEmpty(row.addressLine) || !nonEmpty(row.locality) ? ['address'] : []),
        ...(!nonEmpty(row.description) ? ['description'] : []),
      ],
    }))
    .filter((row) => row.missingFields.length > 0);

  const locationIds = [...new Set(targets.map((row) => row.locationId))];
  const claimIds = [...new Set(targets.map((row) => row.claimId))];
  const now = new Date();

  for (const batch of chunks(locationIds, UPDATE_CHUNK_SIZE)) {
    if (batch.length < 1) continue;
    await db
      .update(locations)
      .set({ visibility: 'hidden', updatedAt: now })
      .where(inArray(locations.id, batch));
  }

  for (const batch of chunks(claimIds, UPDATE_CHUNK_SIZE)) {
    if (batch.length < 1) continue;
    await db
      .update(acceptanceClaims)
      .set({ visibility: 'hidden', updatedAt: now })
      .where(inArray(acceptanceClaims.id, batch));
  }

  const existingEvents =
    claimIds.length > 0
      ? await db
          .select({ claimId: verificationEvents.claimId })
          .from(verificationEvents)
          .where(
            and(
              inArray(verificationEvents.claimId, claimIds),
              eq(verificationEvents.eventType, 'hidden'),
              eq(verificationEvents.reasonCode, REASON_CODE),
            ),
          )
      : [];
  const existingEventClaims = new Set(existingEvents.map((row) => row.claimId));
  const targetByClaim = new Map(targets.map((row) => [row.claimId, row]));
  const eventValues = claimIds
    .filter((claimId) => !existingEventClaims.has(claimId))
    .map((claimId) => {
      const target = targetByClaim.get(claimId);
      if (!target) throw new Error(`Missing quarantine target for claim ${claimId}.`);
      return {
        claimId,
        eventType: 'hidden' as const,
        fromVisibility: 'public' as const,
        toVisibility: 'hidden' as const,
        reasonCode: REASON_CODE,
        effectiveAt: now,
        publicSummary: `Hidden from publication until source-backed ${target.missingFields.join(' and ')} data is available.`,
        internalNote: null,
        actorType: 'system' as const,
        actorId: null,
      };
    });

  for (const batch of chunks(eventValues, UPDATE_CHUNK_SIZE)) {
    if (batch.length > 0) await db.insert(verificationEvents).values(batch);
  }

  const missingCounts = new Map<string, number>();
  for (const target of targets) {
    for (const field of target.missingFields) {
      missingCounts.set(field, (missingCounts.get(field) ?? 0) + 1);
    }
  }

  console.log(
    JSON.stringify(
      {
        target: TARGET,
        reviewedPublicPlaces: rows.length,
        quarantinedPlaces: locationIds.length,
        hiddenClaims: claimIds.length,
        verificationEventsCreated: eventValues.length,
        missingFields: Object.fromEntries([...missingCounts.entries()].sort()),
        quarantined: targets.map((row) => ({
          placeSlug: row.locationSlug,
          missingFields: row.missingFields,
        })),
      },
      null,
      2,
    ),
  );
}

await main();
