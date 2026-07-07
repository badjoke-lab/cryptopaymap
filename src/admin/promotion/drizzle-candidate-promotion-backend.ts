import { and, eq, inArray, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  candidatePromotionDecisions,
  candidateSourceRecords,
  claimAssets,
  entities,
  legacyPlaceIds,
  locations,
  provenanceLinks,
  sourceCandidates,
} from '../../db/schema';
import {
  CandidatePromotionError,
  type CandidatePromotionBackend,
  type CandidatePromotionCommand,
  type CandidatePromotionReceipt,
} from './candidate-promotion';
import { expandPromotionProvenanceAssignments } from './provenance-plan';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

async function readExistingPromotion(database: CryptoPayMapDatabase, requestId: string) {
  const rows = await database
    .select({
      requestId: candidatePromotionDecisions.requestId,
      candidateId: candidatePromotionDecisions.candidateId,
      entityId: candidatePromotionDecisions.entityId,
      locationId: candidatePromotionDecisions.locationId,
      claimId: candidatePromotionDecisions.claimId,
      claimAssetIds: candidatePromotionDecisions.claimAssetIds,
      canonicalPath: candidatePromotionDecisions.canonicalPath,
      promotedAt: candidatePromotionDecisions.promotedAt,
      requestFingerprint: candidatePromotionDecisions.requestFingerprint,
    })
    .from(candidatePromotionDecisions)
    .where(eq(candidatePromotionDecisions.requestId, requestId))
    .limit(1);
  return rows[0] ?? null;
}

function replayReceipt(
  existing: NonNullable<Awaited<ReturnType<typeof readExistingPromotion>>>,
): CandidatePromotionReceipt {
  return {
    requestId: existing.requestId,
    candidateId: existing.candidateId,
    entityId: existing.entityId,
    locationId: existing.locationId,
    claimId: existing.claimId,
    claimAssetIds: [...existing.claimAssetIds],
    canonicalPath: existing.canonicalPath,
    claimStatus: 'candidate',
    visibility: 'hidden',
    promotedAt: existing.promotedAt.toISOString(),
    state: 'replayed',
  };
}

function candidateGuard(database: CryptoPayMapDatabase, command: CandidatePromotionCommand) {
  return database.execute(sql`
    select 1 / case when exists (
      select 1
      from ${sourceCandidates}
      where ${sourceCandidates.id} = ${command.candidateId}
        and ${sourceCandidates.candidateType} = ${command.expectedCandidateType}
        and ${sourceCandidates.candidateStatus} in ('new', 'triaged')
        and ${sourceCandidates.updatedAt} = ${command.expectedCandidateUpdatedAt}
        and ${sourceCandidates.canonicalEntityId} is null
        and ${sourceCandidates.canonicalLocationId} is null
      for update
    ) then 1 else 0 end as candidate_promotion_guard
  `);
}

function sourceRecordGuard(database: CryptoPayMapDatabase, command: CandidatePromotionCommand) {
  return database.execute(sql`
    select 1 / case when (
      select coalesce(jsonb_agg(locked.source_record_id order by locked.source_record_id), '[]'::jsonb)
      from (
        select ${candidateSourceRecords.sourceRecordId} as source_record_id
        from ${candidateSourceRecords}
        where ${candidateSourceRecords.candidateId} = ${command.candidateId}
        for update
      ) as locked
    ) = ${JSON.stringify(command.sourceRecordIds)}::jsonb then 1 else 0 end
      as candidate_promotion_source_guard
  `);
}

function processorGuard(database: CryptoPayMapDatabase, processorId: string) {
  return database.execute(sql`
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
            'conflict',
            'The promotion request ID was reused with different content.',
          );
        }
        return replayReceipt(existing);
      }

      const candidateRows = await database
        .select({
          id: sourceCandidates.id,
          candidateType: sourceCandidates.candidateType,
          candidateStatus: sourceCandidates.candidateStatus,
          updatedAt: sourceCandidates.updatedAt,
          canonicalEntityId: sourceCandidates.canonicalEntityId,
          canonicalLocationId: sourceCandidates.canonicalLocationId,
        })
        .from(sourceCandidates)
        .where(eq(sourceCandidates.id, command.candidateId))
        .limit(1);
      const candidate = candidateRows[0];
      if (!candidate) {
        throw new CandidatePromotionError('not_found', 'The source Candidate was not found.');
      }
      if (
        candidate.candidateType !== command.expectedCandidateType ||
        candidate.updatedAt.getTime() !== command.expectedCandidateUpdatedAt.getTime() ||
        !['new', 'triaged'].includes(candidate.candidateStatus) ||
        candidate.canonicalEntityId !== null ||
        candidate.canonicalLocationId !== null
      ) {
        throw new CandidatePromotionError(
          'conflict',
          'The source Candidate changed before promotion.',
        );
      }

      const sourceRows = await database
        .select({ sourceRecordId: candidateSourceRecords.sourceRecordId })
        .from(candidateSourceRecords)
        .where(eq(candidateSourceRecords.candidateId, command.candidateId))
        .orderBy(candidateSourceRecords.sourceRecordId);
      if (
        JSON.stringify(sourceRows.map((row) => row.sourceRecordId)) !==
        JSON.stringify(command.sourceRecordIds)
      ) {
        throw new CandidatePromotionError(
          'conflict',
          'The Candidate source provenance changed before promotion.',
        );
      }

      const statements: unknown[] = [
        candidateGuard(database, command),
        sourceRecordGuard(database, command),
      ];
      if (command.claim.value.processorId !== null) {
        statements.push(processorGuard(database, command.claim.value.processorId));
      }

      statements.push(database.insert(entities).values(entityInsert(command)));
      const location = locationInsert(command);
      if (location !== null) {
        statements.push(database.insert(locations).values(location));
      }
      statements.push(
        database.insert(acceptanceClaims).values(claimInsert(command)),
        database.insert(claimAssets).values(
          command.claimAssets.map((row) => ({
            id: row.id,
            claimId: row.value.claimId,
            assetId: row.value.assetId,
            networkId: row.value.networkId,
            paymentMethodId: row.value.paymentMethodId,
            contractAddress: row.value.contractAddress,
            isPrimary: row.value.isPrimary,
            notes: row.value.notes,
            createdAt: command.promotedAt,
            updatedAt: command.promotedAt,
          })),
        ),
      );

      const subjects: Array<{
        subjectType: 'entity' | 'location' | 'acceptance_claim' | 'claim_asset';
        subjectId: string;
      }> = [
        { subjectType: 'entity', subjectId: command.entity.id },
        { subjectType: 'acceptance_claim', subjectId: command.claim.id },
        ...command.claimAssets.map((row) => ({
          subjectType: 'claim_asset' as const,
          subjectId: row.id,
        })),
      ];
      if (command.location !== null) {
        subjects.push({ subjectType: 'location', subjectId: command.location.id });
      }
      const provenanceRows =
        command.provenanceAssignments.length > 0
          ? expandPromotionProvenanceAssignments(command.provenanceAssignments, command.promotedAt)
          : subjects.flatMap((subject) =>
              command.sourceRecordIds.map((sourceRecordId) => ({
                subjectType: subject.subjectType,
                subjectId: subject.subjectId,
                sourceRecordId,
                provenanceRole: 'origin' as const,
                effectiveFrom: command.promotedAt,
              })),
            );
      statements.push(
        database.insert(provenanceLinks).values(provenanceRows),
        database
          .update(legacyPlaceIds)
          .set({
            migrationStatus: 'mapped',
            canonicalPath: command.canonicalPath,
            entityId: command.expectedCandidateType === 'online_service' ? command.entity.id : null,
            locationId:
              command.expectedCandidateType === 'physical_place'
                ? (command.location?.id ?? null)
                : null,
            resolvedAt: command.promotedAt,
            updatedAt: command.promotedAt,
          })
          .where(
            and(
              eq(legacyPlaceIds.migrationStatus, 'pending'),
              inArray(legacyPlaceIds.sourceRecordId, command.sourceRecordIds),
            ),
          ),
        database
          .update(sourceCandidates)
          .set({
            candidateStatus: 'promoted',
            canonicalEntityId: command.entity.id,
            canonicalLocationId: command.location?.id ?? null,
            updatedAt: command.promotedAt,
          })
          .where(eq(sourceCandidates.id, command.candidateId)),
        database.insert(candidatePromotionDecisions).values({
          id: crypto.randomUUID(),
          requestId: command.requestId,
          candidateId: command.candidateId,
          entityId: command.entity.id,
          locationId: command.location?.id ?? null,
          claimId: command.claim.id,
          claimAssetIds: command.claimAssets.map((row) => row.id),
          sourceRecordIds: command.sourceRecordIds,
          canonicalPath: command.canonicalPath,
          actorId: command.actorId,
          actorType: command.actorType,
          expectedCandidateUpdatedAt: command.expectedCandidateUpdatedAt,
          promotedAt: command.promotedAt,
          requestFingerprint: command.requestFingerprint,
        }),
      );

      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code === '23505') {
          const replay = await readExistingPromotion(database, command.requestId);
          if (replay !== null && replay.requestFingerprint === command.requestFingerprint) {
            return replayReceipt(replay);
          }
        }
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new CandidatePromotionError(
            'conflict',
            'The Candidate promotion conflicted with current private state and was rolled back.',
            [`PostgreSQL rejected the atomic batch with code ${code}.`],
            { cause: error },
          );
        }
        throw error;
      }

      return {
        requestId: command.requestId,
        candidateId: command.candidateId,
        entityId: command.entity.id,
        locationId: command.location?.id ?? null,
        claimId: command.claim.id,
        claimAssetIds: command.claimAssets.map((row) => row.id),
        canonicalPath: command.canonicalPath,
        claimStatus: 'candidate',
        visibility: 'hidden',
        promotedAt: command.promotedAt.toISOString(),
        state: 'committed',
      };
    },
  };
}
