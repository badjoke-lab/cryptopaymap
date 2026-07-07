import { and, eq, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  auditEvents,
  candidatePromotions,
  entities,
  locations,
  sourceCandidates,
} from '../../db/schema';
import {
  CandidatePromotionError,
  type CandidatePromotionBackend,
  type CandidatePromotionCommand,
  type CandidatePromotionReceipt,
} from './candidate-promotion';

async function readExistingPromotion(
  database: CryptoPayMapDatabase,
  requestId: string,
): Promise<CandidatePromotionReceipt | null> {
  const [existing] = await database
    .select({
      requestId: candidatePromotions.requestId,
      requestFingerprint: candidatePromotions.requestFingerprint,
      candidateId: candidatePromotions.candidateId,
      entityId: candidatePromotions.entityId,
      locationId: candidatePromotions.locationId,
      claimId: candidatePromotions.claimId,
      promotedBy: candidatePromotions.promotedBy,
      promotedAt: candidatePromotions.promotedAt,
    })
    .from(candidatePromotions)
    .where(eq(candidatePromotions.requestId, requestId))
    .limit(1);

  return existing ?? null;
}

async function lockCandidate(
  database: CryptoPayMapDatabase,
  candidateId: string,
): Promise<void> {
  await database.execute(sql`
    select ${sourceCandidates.id}
    from ${sourceCandidates}
    where ${sourceCandidates.id} = ${candidateId}
    for update
  `);
}

async function guardPromotionTargets(
  database: CryptoPayMapDatabase,
  command: CandidatePromotionCommand,
): Promise<void> {
  const entityId = command.entity.id;
  await database.execute(sql`
    select 1 / case when not exists (
      select 1 from ${entities} where ${entities.id} = ${entityId}
    ) then 1 else 0 end as candidate_promotion_entity_guard
  `);

  if (command.location !== null) {
    const locationId = command.location.id;
    await database.execute(sql`
      select 1 / case when not exists (
        select 1 from ${locations} where ${locations.id} = ${locationId}
      ) then 1 else 0 end as candidate_promotion_location_guard
    `);
  }

  const claimId = command.claim.id;
  await database.execute(sql`
    select 1 / case when not exists (
      select 1 from ${acceptanceClaims} where ${acceptanceClaims.id} = ${claimId}
    ) then 1 else 0 end as candidate_promotion_claim_guard
  `);
}

async function guardProcessor(
  database: CryptoPayMapDatabase,
  processorId: string | null,
): Promise<void> {
  if (processorId === null) return;

  await database.execute(sql`
    select 1 / case when exists (
      select 1
      from ${entities}
      where ${entities.id} = ${processorId}
        and ${entities.entityType} = 'payment_processor'
        and ${entities.deletedAt} is null
      for share
    ) then 1 else 0 end as candidate_promotion_processor_guard
  `);
}

function entityInsert(command: CandidatePromotionCommand) {
  const value = command.entity.value;
  return {
    id: command.entity.id,
    entityType: value.entityType,
    name: value.name,
    slug: value.slug,
    legalName: value.legalName,
    websiteUrl: value.websiteUrl,
    countryCode: value.countryCode,
    entityStatus: value.entityStatus,
    visibility: value.visibility,
    createdAt: command.promotedAt,
    updatedAt: command.promotedAt,
  };
}

function locationInsert(command: CandidatePromotionCommand) {
  if (command.location === null) return null;
  const value = command.location.value;
  return {
    id: command.location.id,
    entityId: command.entity.id,
    name: value.name,
    slug: value.slug,
    addressLine: value.addressLine,
    locality: value.locality,
    region: value.region,
    postalCode: value.postalCode,
    countryCode: value.countryCode,
    latitude: String(value.latitude),
    longitude: String(value.longitude),
    locationStatus: value.locationStatus,
    visibility: value.visibility,
    websiteUrl: value.websiteUrl,
    phone: value.phone,
    description: value.description,
    openingHours: value.openingHours,
    amenities: value.amenities,
    socialLinks: value.socialLinks,
    osmType: value.osmType,
    osmId: value.osmId,
    createdAt: command.promotedAt,
    updatedAt: command.promotedAt,
  };
}

function claimInsert(command: CandidatePromotionCommand) {
  const value = command.claim.value;
  return {
    id: command.claim.id,
    entityId: value.entityId,
    locationId: value.locationId,
    claimScope: value.claimScope,
    routeType: value.routeType,
    acceptanceScope: value.acceptanceScope,
    claimStatus: value.claimStatus,
    visibility: value.visibility,
    customerPaysCrypto: value.customerPaysCrypto,
    merchantExplicitlyAcceptsCrypto: value.merchantExplicitlyAcceptsCrypto,
    processorId: value.processorId,
    howToPay: value.howToPay,
    instructionsLanguage: value.instructionsLanguage,
    merchantReceives: value.merchantReceives,
    restrictions: value.restrictions,
    firstConfirmedAt: null,
    lastConfirmedAt: null,
    nextReviewAt: null,
    endedAt: null,
    endedReason: null,
    createdAt: command.promotedAt,
    updatedAt: command.promotedAt,
  };
}

export function createDrizzleCandidatePromotionBackend(
  database: CryptoPayMapDatabase,
): CandidatePromotionBackend {
  return {
    async commitPromotion(command: CandidatePromotionCommand): Promise<CandidatePromotionReceipt> {
      const existing = await readExistingPromotion(database, command.requestId);
      if (existing !== null) {
        if (existing.requestFingerprint !== command.requestFingerprint) {
          throw new CandidatePromotionError(
            'REQUEST_ID_CONFLICT',
            'The promotion request ID was already used for different promotion contents.',
          );
        }
        return existing;
      }

      return database.transaction(async (transaction) => {
        await lockCandidate(transaction, command.candidate.id);

        const [candidate] = await transaction
          .select({
            id: sourceCandidates.id,
            candidateStatus: sourceCandidates.candidateStatus,
            canonicalEntityId: sourceCandidates.canonicalEntityId,
            canonicalLocationId: sourceCandidates.canonicalLocationId,
          })
          .from(sourceCandidates)
          .where(eq(sourceCandidates.id, command.candidate.id))
          .limit(1);

        if (!candidate) {
          throw new CandidatePromotionError(
            'CANDIDATE_NOT_FOUND',
            'The source candidate no longer exists.',
          );
        }
        if (candidate.candidateStatus !== command.candidate.expectedStatus) {
          throw new CandidatePromotionError(
            'CANDIDATE_STATUS_CONFLICT',
            'The source candidate status changed before promotion.',
          );
        }
        if (candidate.canonicalEntityId !== null || candidate.canonicalLocationId !== null) {
          throw new CandidatePromotionError(
            'CANDIDATE_TARGET_CONFLICT',
            'The source candidate was already linked to canonical records.',
          );
        }

        await guardPromotionTargets(transaction, command);
        await guardProcessor(transaction, command.claim.value.processorId);

        await transaction.insert(entities).values(entityInsert(command));
        const locationValue = locationInsert(command);
        if (locationValue !== null) await transaction.insert(locations).values(locationValue);
        await transaction.insert(acceptanceClaims).values(claimInsert(command));

        const updatedCandidates = await transaction
          .update(sourceCandidates)
          .set({
            candidateStatus: 'promoted',
            canonicalEntityId: command.entity.id,
            canonicalLocationId: command.location?.id ?? null,
            updatedAt: command.promotedAt,
          })
          .where(
            and(
              eq(sourceCandidates.id, command.candidate.id),
              eq(sourceCandidates.candidateStatus, command.candidate.expectedStatus),
            ),
          )
          .returning({ id: sourceCandidates.id });

        if (updatedCandidates.length !== 1) {
          throw new CandidatePromotionError(
            'CANDIDATE_STATUS_CONFLICT',
            'The source candidate changed while the promotion transaction was running.',
          );
        }

        await transaction.insert(candidatePromotions).values({
          requestId: command.requestId,
          requestFingerprint: command.requestFingerprint,
          candidateId: command.candidate.id,
          entityId: command.entity.id,
          locationId: command.location?.id ?? null,
          claimId: command.claim.id,
          promotedBy: command.promotedBy,
          promotedAt: command.promotedAt,
        });

        await transaction.insert(auditEvents).values({
          actorType: 'reviewer',
          actorId: command.promotedBy,
          action: 'candidate.promoted',
          subjectType: 'source_candidate',
          subjectId: command.candidate.id,
          afterValue: {
            entityId: command.entity.id,
            locationId: command.location?.id ?? null,
            claimId: command.claim.id,
          },
          correlationId: command.correlationId,
          createdAt: command.promotedAt,
        });

        return {
          requestId: command.requestId,
          requestFingerprint: command.requestFingerprint,
          candidateId: command.candidate.id,
          entityId: command.entity.id,
          locationId: command.location?.id ?? null,
          claimId: command.claim.id,
          promotedBy: command.promotedBy,
          promotedAt: command.promotedAt,
        };
      });
    },
  };
}
