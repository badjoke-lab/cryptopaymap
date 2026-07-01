import { and, eq, isNull, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  candidatePromotionDecisions,
  candidateSourceRecords,
  entities,
  locations,
  sourceCandidates,
} from '../../db/schema';
import { CandidatePromotionError, type CandidatePromotionReceipt } from './candidate-promotion';
import type { CandidateExistingTargetLinkCommand } from './existing-target-link';

function conflict(message: string): never {
  throw new CandidatePromotionError('conflict', message);
}

export function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export async function readExistingLink(database: CryptoPayMapDatabase, requestId: string) {
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

export function replayExistingLink(
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

export function existingTargetGuards(
  database: CryptoPayMapDatabase,
  command: CandidateExistingTargetLinkCommand,
): unknown[] {
  const expectedType =
    command.expectedCandidateType === 'physical_place' ? 'merchant' : 'online_service';
  const guards: unknown[] = [
    database.execute(sql`
      select 1 / case when exists (
        select 1 from ${sourceCandidates}
        where ${sourceCandidates.id} = ${command.candidateId}
          and ${sourceCandidates.candidateType} = ${command.expectedCandidateType}
          and ${sourceCandidates.candidateStatus} in ('new', 'triaged')
          and ${sourceCandidates.updatedAt} = ${command.expectedCandidateUpdatedAt}
          and ${sourceCandidates.canonicalEntityId} is null
          and ${sourceCandidates.canonicalLocationId} is null
        for update
      ) then 1 else 0 end as candidate_existing_target_guard
    `),
    database.execute(sql`
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
    `),
    database.execute(sql`
      select 1 / case when exists (
        select 1 from ${entities}
        where ${entities.id} = ${command.target.entityId}
          and ${entities.entityType} = ${expectedType}
          and ${entities.entityStatus} in ('active', 'unknown')
          and ${entities.updatedAt} = ${command.target.expectedEntityUpdatedAt}
          and ${entities.deletedAt} is null
        for share
      ) then 1 else 0 end as candidate_existing_target_entity_guard
    `),
    database.execute(sql`
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
    `),
  ];
  if (command.target.locationId !== null) {
    guards.push(
      database.execute(sql`
        select 1 / case when exists (
          select 1 from ${locations}
          where ${locations.id} = ${command.target.locationId}
            and ${locations.entityId} = ${command.target.entityId}
            and ${locations.locationStatus} in ('active', 'temporarily_closed', 'unknown')
            and ${locations.updatedAt} = ${command.target.expectedLocationUpdatedAt}
            and ${locations.deletedAt} is null
          for share
        ) then 1 else 0 end as candidate_existing_target_location_guard
      `),
    );
  }
  if (command.claim.value.processorId !== null) {
    guards.push(
      database.execute(sql`
        select 1 / case when exists (
          select 1 from ${entities}
          where ${entities.id} = ${command.claim.value.processorId}
            and ${entities.entityType} = 'payment_processor'
            and ${entities.deletedAt} is null
          for share
        ) then 1 else 0 end as candidate_existing_target_processor_guard
      `),
    );
  }
  return guards;
}

export async function preflightExistingTargetLink(
  database: CryptoPayMapDatabase,
  command: CandidateExistingTargetLinkCommand,
): Promise<void> {
  const candidateRows = await database
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
  const candidate = candidateRows[0];
  if (!candidate) throw new CandidatePromotionError('not_found', 'The source Candidate was not found.');
  if (
    candidate.candidateType !== command.expectedCandidateType ||
    candidate.updatedAt.getTime() !== command.expectedCandidateUpdatedAt.getTime() ||
    !['new', 'triaged'].includes(candidate.candidateStatus) ||
    candidate.canonicalEntityId !== null ||
    candidate.canonicalLocationId !== null
  ) {
    conflict('The source Candidate changed before existing-target linking.');
  }

  const sourceRows = await database
    .select({ id: candidateSourceRecords.sourceRecordId })
    .from(candidateSourceRecords)
    .where(eq(candidateSourceRecords.candidateId, command.candidateId))
    .orderBy(candidateSourceRecords.sourceRecordId);
  if (JSON.stringify(sourceRows.map((row) => row.id)) !== JSON.stringify(command.sourceRecordIds)) {
    conflict('The Candidate source provenance changed before existing-target linking.');
  }

  const entityRows = await database
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
  const entity = entityRows[0];
  if (!entity) throw new CandidatePromotionError('not_found', 'The canonical Entity target was not found.');
  const expectedType =
    command.expectedCandidateType === 'physical_place' ? 'merchant' : 'online_service';
  if (
    entity.entityType !== expectedType ||
    entity.updatedAt.getTime() !== command.target.expectedEntityUpdatedAt.getTime() ||
    entity.deletedAt !== null ||
    !['active', 'unknown'].includes(entity.entityStatus)
  ) {
    conflict('The canonical Entity target changed or is no longer linkable.');
  }

  if (command.expectedCandidateType === 'physical_place') {
    if (command.target.locationId === null || command.target.expectedLocationUpdatedAt === null) {
      throw new CandidatePromotionError('not_found', 'The canonical Location target was not found.');
    }
    const locationRows = await database
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
    const location = locationRows[0];
    if (!location) throw new CandidatePromotionError('not_found', 'The canonical Location target was not found.');
    if (
      location.entityId !== command.target.entityId ||
      location.updatedAt.getTime() !== command.target.expectedLocationUpdatedAt.getTime() ||
      location.deletedAt !== null ||
      !['active', 'temporarily_closed', 'unknown'].includes(location.locationStatus) ||
      command.target.expectedCanonicalPath !== `/place/${location.slug}`
    ) {
      conflict('The canonical Location target changed or is no longer linkable.');
    }
  } else if (
    command.target.locationId !== null ||
    command.target.expectedLocationUpdatedAt !== null ||
    entity.slug === null ||
    command.target.expectedCanonicalPath !== `/service/${entity.slug}`
  ) {
    conflict('The canonical online-service target changed before linking.');
  }

  const locationCondition =
    command.target.locationId === null
      ? isNull(acceptanceClaims.locationId)
      : eq(acceptanceClaims.locationId, command.target.locationId);
  const claimRows = await database
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
  if (JSON.stringify(claimRows.map((row) => row.id)) !== JSON.stringify(command.target.expectedClaimIds)) {
    conflict('The canonical target Claim set changed before linking.');
  }
}
