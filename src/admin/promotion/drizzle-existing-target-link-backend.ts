import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
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
import { CandidatePromotionError, type CandidatePromotionReceipt } from './candidate-promotion';
import type {
  CandidateExistingTargetLinkBackend,
  CandidateExistingTargetLinkCommand,
} from './existing-target-link';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

async function readExistingLink(database: CryptoPayMapDatabase, requestId: string) {
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
  existing: NonNullable<Awaited<ReturnType<typeof readExistingLink>>>,
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

function candidateGuard(
  database: CryptoPayMapDatabase,
  command: CandidateExistingTargetLinkCommand,
) {
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
    ) then 1 else 0 end as candidate_existing_target_guard
  `);
}

function sourceRecordGuard(
  database: CryptoPayMapDatabase,
  command: CandidateExistingTargetLinkCommand,
) {
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
      as candidate_existing_target_source_guard
  `);
}

function entityGuard(database: CryptoPayMapDatabase, command: CandidateExistingTargetLinkCommand) {
  const expectedType =
    command.expectedCandidateType === 'physical_place' ? 'merchant' : 'online_service';
  return database.execute(sql`
    select 1 / case when exists (
      select 1
      from ${entities}
      where ${entities.id} = ${command.target.entityId}
        and ${entities.entityType} = ${expectedType}
        and ${entities.entityStatus} in ('active', 'unknown')
        and ${entities.updatedAt} = ${command.target.expectedEntityUpdatedAt}
        and ${entities.deletedAt} is null
      for share
    ) then 1 else 0 end as candidate_existing_target_entity_guard
  `);
}

function locationGuard(
  database: CryptoPayMapDatabase,
  command: CandidateExistingTargetLinkCommand,
) {
  return database.execute(sql`
    select 1 / case when exists (
      select 1
      from ${locations}
      where ${locations.id} = ${command.target.locationId}
        and ${locations.entityId} = ${command.target.entityId}
        and ${locations.locationStatus} in ('active', 'temporarily_closed', 'unknown')
        and ${locations.updatedAt} = ${command.target.expectedLocationUpdatedAt}
        and ${locations.deletedAt} is null
      for share
    ) then 1 else 0 end as candidate_existing_target_location_guard
  `);
}

function claimSetGuard(
  database: CryptoPayMapDatabase,
  command: CandidateExistingTargetLinkCommand,
) {
  return database.execute(sql`
    select 1 / case when (
      select coalesce(jsonb_agg(locked.id order by locked.id), '[]'::jsonb)
      from (
        select ${acceptanceClaims.id} as id
        from ${acceptanceClaims}
        where ${acceptanceClaims.entityId} = ${command.target.entityId}
          and ${acceptanceClaims.locationId} is not distinct from ${command.target.locationId}
          and ${acceptanceClaims.deletedAt} is null
        for share
      ) as locked
    ) = ${JSON.stringify(command.target.expectedClaimIds)}::jsonb then 1 else 0 end
      as candidate_existing_target_claim_set_guard
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
    ) then 1 else 0 end as candidate_existing_target_processor_guard
  `);
}

function claimInsert(command: CandidateExistingTargetLinkCommand) {
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
    createdAt: command.linkedAt,
    updatedAt: command.linkedAt,
  };
}

async function loadCandidateState(
  database: CryptoPayMapDatabase,
  command: CandidateExistingTargetLinkCommand,
) {
  const rows = await database
    .select({
      candidateType: sourceCandidates.candidateType,
      candidateStatus: sourceCandidates.candidateStatus,
      updatedAt: sourceCandidates.updatedAt,
      canonicalEntityId: sourceCandidates.canonicalEntityId,
      canonicalLocationId: sourceCandidates.canonicalLocationId,
    })
    .from(sourceCandidates)
    .where(eq(sourceCandidates.id, command.candidateId))
    .limit(1);
  return rows[0] ?? null;
}

async function loadSourceRecordIds(
  database: CryptoPayMapDatabase,
  command: CandidateExistingTargetLinkCommand,
) {
  return database
    .select({ sourceRecordId: candidateSourceRecords.sourceRecordId })
    .from(candidateSourceRecords)
    .where(eq(candidateSourceRecords.candidateId, command.candidateId))
    .orderBy(candidateSourceRecords.sourceRecordId);
}

async function loadEntityState(
  database: CryptoPayMapDatabase,
  command: CandidateExistingTargetLinkCommand,
) {
  const rows = await database
    .select({
      entityType: entities.entityType,
      slug: entities.slug,
      entityStatus: entities.entityStatus,
      updatedAt: entities.updatedAt,
      deletedAt: entities.deletedAt,
    })
    .from(entities)
    .where(eq(entities.id, command.target.entityId))
    .limit(1);
  return rows[0] ?? null;
}

async function loadLocationState(
  database: CryptoPayMapDatabase,
  command: CandidateExistingTargetLinkCommand,
) {
  if (command.target.locationId === null) return null;
  const rows = await database
    .select({
      entityId: locations.entityId,
      slug: locations.slug,
      locationStatus: locations.locationStatus,
      updatedAt: locations.updatedAt,
      deletedAt: locations.deletedAt,
    })
    .from(locations)
    .where(eq(locations.id, command.target.locationId))
    .limit(1);
  return rows[0] ?? null;
}

async function loadTargetClaimIds(
  database: CryptoPayMapDatabase,
  command: CandidateExistingTargetLinkCommand,
) {
  const locationCondition =
    command.target.locationId === null
      ? isNull(acceptanceClaims.locationId)
      : eq(acceptanceClaims.locationId, command.target.locationId);
  return database
    .select({ id: acceptanceClaims.id })
    .from(acceptanceClaims)
    .where(
      and(
        eq(acceptanceClaims.entityId, command.target.entityId),
        locationCondition,
        isNull(acceptanceClaims.deletedAt),
      ),
    )
    .orderBy(acceptanceClaims.id);
}

export function createDrizzleExistingTargetLinkBackend(
  database: CryptoPayMapDatabase,
): CandidateExistingTargetLinkBackend {
  return {
    async commitExistingTargetLink(
      command: CandidateExistingTargetLinkCommand,
    ): Promise<CandidatePromotionReceipt> {
      const existing = await readExistingLink(database, command.requestId);
      if (existing !== null) {
        if (existing.requestFingerprint !== command.requestFingerprint) {
          throw new CandidatePromotionError(
            'conflict',
            'The existing-target request ID was reused with different content.',
          );
        }
        return replayReceipt(existing);
      }

      const candidate = await loadCandidateState(database, command);
      if (candidate === null) {
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
          'The source Candidate changed before existing-target linking.',
        );
      }

      const sourceRows = await loadSourceRecordIds(database, command);
      if (
        JSON.stringify(sourceRows.map((row) => row.sourceRecordId)) !==
        JSON.stringify(command.sourceRecordIds)
      ) {
        throw new CandidatePromotionError(
          'conflict',
          'The Candidate source provenance changed before existing-target linking.',
        );
      }

      const entity = await loadEntityState(database, command);
      if (entity === null) {
        throw new CandidatePromotionError(
          'not_found',
          'The canonical Entity target was not found.',
        );
      }
      const expectedEntityType =
        command.expectedCandidateType === 'physical_place' ? 'merchant' : 'online_service';
      if (
        entity.entityType !== expectedEntityType ||
        entity.updatedAt.getTime() !== command.target.expectedEntityUpdatedAt.getTime() ||
        entity.deletedAt !== null ||
        !['active', 'unknown'].includes(entity.entityStatus)
      ) {
        throw new CandidatePromotionError(
          'conflict',
          'The canonical Entity target changed or is no longer linkable.',
        );
      }

      const location = await loadLocationState(database, command);
      if (command.expectedCandidateType === 'physical_place') {
        if (
          location === null ||
          command.target.locationId === null ||
          command.target.expectedLocationUpdatedAt === null
        ) {
          throw new CandidatePromotionError(
            'not_found',
            'The canonical Location target was not found.',
          );
        }
        if (
          location.entityId !== command.target.entityId ||
          location.updatedAt.getTime() !== command.target.expectedLocationUpdatedAt.getTime() ||
          location.deletedAt !== null ||
          !['active', 'temporarily_closed', 'unknown'].includes(location.locationStatus) ||
          command.target.expectedCanonicalPath !== `/place/${location.slug}`
        ) {
          throw new CandidatePromotionError(
            'conflict',
            'The canonical Location target changed or is no longer linkable.',
          );
        }
      } else if (
        location !== null ||
        command.target.locationId !== null ||
        command.target.expectedLocationUpdatedAt !== null ||
        entity.slug === null ||
        command.target.expectedCanonicalPath !== `/service/${entity.slug}`
      ) {
        throw new CandidatePromotionError(
          'conflict',
          'The canonical online-service target changed before linking.',
        );
      }

      const claimRows = await loadTargetClaimIds(database, command);
      if (
        JSON.stringify(claimRows.map((row) => row.id)) !==
        JSON.stringify(command.target.expectedClaimIds)
      ) {
        throw new CandidatePromotionError(
          'conflict',
          'The canonical target Claim set changed before linking.',
        );
      }

      const statements: unknown[] = [
        candidateGuard(database, command),
        sourceRecordGuard(database, command),
        entityGuard(database, command),
        claimSetGuard(database, command),
      ];
      if (command.target.locationId !== null) {
        statements.push(locationGuard(database, command));
      }
      if (command.claim.value.processorId !== null) {
        statements.push(processorGuard(database, command.claim.value.processorId));
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
            createdAt: command.linkedAt,
            updatedAt: command.linkedAt,
          })),
        ),
      );

      const identitySubjects: Array<{
        subjectType: 'entity' | 'location';
        subjectId: string;
      }> = [{ subjectType: 'entity', subjectId: command.target.entityId }];
      if (command.target.locationId !== null) {
        identitySubjects.push({
          subjectType: 'location',
          subjectId: command.target.locationId,
        });
      }
      const originSubjects: Array<{
        subjectType: 'acceptance_claim' | 'claim_asset';
        subjectId: string;
      }> = [
        { subjectType: 'acceptance_claim', subjectId: command.claim.id },
        ...command.claimAssets.map((row) => ({
          subjectType: 'claim_asset' as const,
          subjectId: row.id,
        })),
      ];

      statements.push(
        database
          .insert(provenanceLinks)
          .values([
            ...identitySubjects.flatMap((subject) =>
              command.sourceRecordIds.map((sourceRecordId) => ({
                subjectType: subject.subjectType,
                subjectId: subject.subjectId,
                sourceRecordId,
                provenanceRole: 'attribution' as const,
                effectiveFrom: command.linkedAt,
              })),
            ),
            ...originSubjects.flatMap((subject) =>
              command.sourceRecordIds.map((sourceRecordId) => ({
                subjectType: subject.subjectType,
                subjectId: subject.subjectId,
                sourceRecordId,
                provenanceRole: 'origin' as const,
                effectiveFrom: command.linkedAt,
              })),
            ),
          ])
          .onConflictDoNothing(),
        database
          .update(legacyPlaceIds)
          .set({
            migrationStatus: 'mapped',
            canonicalPath: command.target.expectedCanonicalPath,
            entityId:
              command.expectedCandidateType === 'online_service' ? command.target.entityId : null,
            locationId:
              command.expectedCandidateType === 'physical_place' ? command.target.locationId : null,
            resolvedAt: command.linkedAt,
            updatedAt: command.linkedAt,
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
            canonicalEntityId: command.target.entityId,
            canonicalLocationId: command.target.locationId,
            updatedAt: command.linkedAt,
          })
          .where(eq(sourceCandidates.id, command.candidateId)),
        database.insert(candidatePromotionDecisions).values({
          id: crypto.randomUUID(),
          requestId: command.requestId,
          candidateId: command.candidateId,
          entityId: command.target.entityId,
          locationId: command.target.locationId,
          claimId: command.claim.id,
          claimAssetIds: command.claimAssets.map((row) => row.id),
          sourceRecordIds: command.sourceRecordIds,
          canonicalPath: command.target.expectedCanonicalPath,
          actorId: command.actorId,
          actorType: command.actorType,
          expectedCandidateUpdatedAt: command.expectedCandidateUpdatedAt,
          promotedAt: command.linkedAt,
          requestFingerprint: command.requestFingerprint,
        }),
      );

      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code === '23505') {
          const replay = await readExistingLink(database, command.requestId);
          if (replay !== null && replay.requestFingerprint === command.requestFingerprint) {
            return replayReceipt(replay);
          }
        }
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new CandidatePromotionError(
            'conflict',
            'The existing-target link conflicted with current private state and was rolled back.',
            [`PostgreSQL rejected the atomic batch with code ${code}.`],
            { cause: error },
          );
        }
        throw error;
      }

      return {
        requestId: command.requestId,
        candidateId: command.candidateId,
        entityId: command.target.entityId,
        locationId: command.target.locationId,
        claimId: command.claim.id,
        claimAssetIds: command.claimAssets.map((row) => row.id),
        canonicalPath: command.target.expectedCanonicalPath,
        claimStatus: 'candidate',
        visibility: 'hidden',
        promotedAt: command.linkedAt.toISOString(),
        state: 'committed',
      };
    },
  };
}
