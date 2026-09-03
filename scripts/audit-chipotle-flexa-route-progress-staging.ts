import { and, eq, ilike } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { acceptanceClaims, entities, locations, sourceCandidates, verificationEvents } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };
const TARGET = 'fixed-review-staging';
const CORRECTION_REASON = 'processor_route_source_alignment';

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing route progress audit outside ${TARGET}.`);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const [flexa] = await db
    .select({ id: entities.id, slug: entities.slug })
    .from(entities)
    .where(and(eq(entities.entityType, 'payment_processor'), eq(entities.slug, 'flexa')))
    .limit(1);
  if (!flexa) throw new Error('Flexa processor entity is missing.');

  const claims = await db
    .select({
      claimId: acceptanceClaims.id,
      routeType: acceptanceClaims.routeType,
      processorId: acceptanceClaims.processorId,
    })
    .from(sourceCandidates)
    .innerJoin(locations, eq(locations.id, sourceCandidates.canonicalLocationId))
    .innerJoin(acceptanceClaims, eq(acceptanceClaims.locationId, locations.id))
    .where(
      and(
        eq(sourceCandidates.candidateType, 'physical_place'),
        eq(sourceCandidates.candidateStatus, 'promoted'),
        ilike(sourceCandidates.normalizedName, '%chipotle%'),
        eq(acceptanceClaims.claimStatus, 'confirmed'),
        eq(acceptanceClaims.visibility, 'public'),
      ),
    );

  const aligned = claims.filter(
    (claim) => claim.routeType === 'processor_checkout' && claim.processorId === flexa.id,
  );
  const correctionEvents = await db
    .select({ claimId: verificationEvents.claimId })
    .from(verificationEvents)
    .where(
      and(
        eq(verificationEvents.eventType, 'corrected'),
        eq(verificationEvents.reasonCode, CORRECTION_REASON),
      ),
    );
  const eventClaimIds = new Set(correctionEvents.map((row) => row.claimId));

  console.log(
    JSON.stringify({
      target: TARGET,
      publicChipotleClaims: claims.length,
      flexaAlignedClaims: aligned.length,
      remainingRouteCorrections: claims.length - aligned.length,
      claimsWithCorrectionHistory: claims.filter((claim) => eventClaimIds.has(claim.claimId)).length,
      remainingCorrectionHistory: claims.filter((claim) => !eventClaimIds.has(claim.claimId)).length,
    }),
  );
}

await main();
