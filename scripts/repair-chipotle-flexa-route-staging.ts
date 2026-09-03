import { and, eq, ilike, or } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  acceptanceClaims,
  entities,
  locations,
  provenanceLinks,
  sourceCandidates,
  sourceRecords,
  sources,
  verificationEvents,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const TARGET = 'fixed-review-staging';
const CORRECTION_REASON = 'processor_route_source_alignment';
const FLEXA_SOURCE_RECORD = 'flexa:chipotle-current-digital-asset-acceptance';

async function deterministicUuid(label: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(label));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing Chipotle route repair outside ${TARGET}.`);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  let [flexa] = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.entityType, 'payment_processor'),
        or(eq(entities.slug, 'flexa'), ilike(entities.name, '%flexa%')),
      ),
    )
    .limit(1);

  if (!flexa) {
    [flexa] = await db
      .insert(entities)
      .values({
        id: await deterministicUuid('canonical:payment-processor:flexa'),
        entityType: 'payment_processor',
        name: 'Flexa',
        slug: 'flexa',
        websiteUrl: 'https://flexa.co/',
        entityStatus: 'active',
        visibility: 'public',
      })
      .returning();
  } else if (!flexa.slug || flexa.visibility !== 'public') {
    [flexa] = await db
      .update(entities)
      .set({
        slug: flexa.slug ?? 'flexa',
        websiteUrl: flexa.websiteUrl ?? 'https://flexa.co/',
        entityStatus: 'active',
        visibility: 'public',
        updatedAt: new Date(),
      })
      .where(eq(entities.id, flexa.id))
      .returning();
  }
  if (!flexa) throw new Error('Failed to resolve canonical Flexa processor entity.');

  const [processorSourceRecord] = await db
    .select({ id: sourceRecords.id })
    .from(sourceRecords)
    .innerJoin(sources, eq(sources.id, sourceRecords.sourceId))
    .where(
      and(
        eq(sources.sourceType, 'processor'),
        ilike(sources.name, '%flexa%'),
        eq(sourceRecords.externalId, FLEXA_SOURCE_RECORD),
      ),
    )
    .limit(1);
  if (!processorSourceRecord) {
    throw new Error('Current Flexa Chipotle processor source record is missing.');
  }

  const claims = await db
    .select({
      claimId: acceptanceClaims.id,
      routeType: acceptanceClaims.routeType,
      processorId: acceptanceClaims.processorId,
      claimStatus: acceptanceClaims.claimStatus,
      visibility: acceptanceClaims.visibility,
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

  let corrected = 0;
  let alreadyCorrect = 0;
  let historyCreated = 0;
  for (const claim of claims) {
    const alreadyAligned =
      claim.routeType === 'processor_checkout' && claim.processorId === flexa.id;
    if (alreadyAligned) {
      alreadyCorrect += 1;
    } else {
      await db
        .update(acceptanceClaims)
        .set({
          routeType: 'processor_checkout',
          processorId: flexa.id,
          updatedAt: new Date(),
        })
        .where(eq(acceptanceClaims.id, claim.claimId));
      corrected += 1;
    }

    for (const fieldPath of ['routeType', 'processorId']) {
      await db
        .insert(provenanceLinks)
        .values({
          subjectType: 'acceptance_claim',
          subjectId: claim.claimId,
          fieldPath,
          sourceRecordId: processorSourceRecord.id,
          provenanceRole: alreadyAligned ? 'verification' : 'correction',
        })
        .onConflictDoNothing();
    }

    const [existingEvent] = await db
      .select({ id: verificationEvents.id })
      .from(verificationEvents)
      .where(
        and(
          eq(verificationEvents.claimId, claim.claimId),
          eq(verificationEvents.eventType, 'corrected'),
          eq(verificationEvents.reasonCode, CORRECTION_REASON),
        ),
      )
      .limit(1);
    if (!existingEvent) {
      await db.insert(verificationEvents).values({
        id: await deterministicUuid(`verification:${claim.claimId}:${CORRECTION_REASON}`),
        claimId: claim.claimId,
        eventType: 'corrected',
        reasonCode: CORRECTION_REASON,
        effectiveAt: new Date(),
        publicSummary:
          'Corrected the payment route to identify Flexa as the processor used for this Chipotle digital-asset payment flow.',
        internalNote: null,
        actorType: 'system',
        actorId: null,
      });
      historyCreated += 1;
    }
  }

  console.log(
    JSON.stringify({
      target: TARGET,
      processor: { id: flexa.id, slug: flexa.slug, name: flexa.name },
      chipotlePublicClaims: claims.length,
      corrected,
      alreadyCorrect,
      correctionHistoryCreated: historyCreated,
    }),
  );
  if (claims.length < 1) throw new Error('No public confirmed Chipotle claims found.');
}

await main();
