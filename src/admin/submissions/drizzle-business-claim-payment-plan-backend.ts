import { and, asc, eq, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  assets,
  claimAssets,
  entities,
  locations,
  networks,
  paymentMethods,
  submissionApplications,
  submissionEvents,
  submissions,
} from '../../db/schema';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import { createDrizzleBusinessClaimPaymentPreviewBackend } from './drizzle-business-claim-payment-preview-backend';
import type {
  BusinessClaimPaymentPlanBackend,
  BusinessClaimPaymentPlanEventRecord,
  BusinessClaimPaymentPlanExpectedClaim,
} from './business-claim-payment-plan';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function eventRecord(row: {
  eventId: string;
  submissionId: string;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  reasonCode: string | null;
  actorId: string;
  actorType: string;
  internalNote: string | null;
  createdAt: Date;
}): BusinessClaimPaymentPlanEventRecord {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

function claimGuard(claim: BusinessClaimPaymentPlanExpectedClaim) {
  const expectedRows = JSON.stringify(claim.expectedRows);
  return sql`exists (
    select 1
    from ${acceptanceClaims} guarded_claim
    where guarded_claim.id = ${claim.claimId}
      and guarded_claim.deleted_at is null
      and guarded_claim.claim_status in ('candidate', 'confirmed', 'stale')
      and guarded_claim.updated_at = ${claim.expectedClaimUpdatedAt}
      and (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'rowId', guarded_row.id::text,
              'assetId', guarded_row.asset_id::text,
              'networkId', guarded_row.network_id::text,
              'paymentMethodId', guarded_row.payment_method_id::text,
              'contractAddress', guarded_row.contract_address,
              'isPrimary', guarded_row.is_primary
            ) order by guarded_row.id
          ),
          '[]'::jsonb
        )
        from ${claimAssets} guarded_row
        where guarded_row.claim_id = guarded_claim.id
      ) = cast(${expectedRows} as jsonb)
  )`;
}

function allGuards(parts: ReturnType<typeof sql>[]) {
  return parts.length === 0 ? sql`true` : sql.join(parts, sql` and `);
}

export function createDrizzleBusinessClaimPaymentPlanBackend(
  database: CryptoPayMapDatabase,
): BusinessClaimPaymentPlanBackend {
  const preview = createDrizzleBusinessClaimPaymentPreviewBackend(database);
  return {
    ...preview,

    async readPlanEvent(planId) {
      const rows = await database
        .select({
          eventId: submissionEvents.id,
          submissionId: submissionEvents.submissionId,
          fromStatus: submissionEvents.fromStatus,
          toStatus: submissionEvents.toStatus,
          action: submissionEvents.action,
          reasonCode: submissionEvents.reasonCode,
          actorId: submissionEvents.actorId,
          actorType: submissionEvents.actorType,
          internalNote: submissionEvents.internalNote,
          createdAt: submissionEvents.createdAt,
        })
        .from(submissionEvents)
        .where(eq(submissionEvents.id, planId))
        .limit(1);
      return rows[0] === undefined ? null : eventRecord(rows[0]);
    },

    async readCurrentPlanEvent(applicationId) {
      const rows = await database
        .select({
          eventId: submissionEvents.id,
          submissionId: submissionEvents.submissionId,
          fromStatus: submissionEvents.fromStatus,
          toStatus: submissionEvents.toStatus,
          action: submissionEvents.action,
          reasonCode: submissionEvents.reasonCode,
          actorId: submissionEvents.actorId,
          actorType: submissionEvents.actorType,
          internalNote: submissionEvents.internalNote,
          createdAt: submissionEvents.createdAt,
        })
        .from(submissionApplications)
        .innerJoin(
          submissionEvents,
          and(
            eq(submissionEvents.submissionId, submissionApplications.submissionId),
            eq(submissionEvents.action, 'business_claim_payment_plan_prepared'),
          ),
        )
        .where(eq(submissionApplications.id, applicationId))
        .orderBy(asc(submissionEvents.createdAt), asc(submissionEvents.id))
        .limit(2);
      if (rows.length > 1)
        throw new Error('Business Claim application contains multiple payment plans.');
      return rows[0] === undefined ? null : eventRecord(rows[0]);
    },

    async readTargetPlanningContext(targetType, targetId) {
      if (targetType === 'entity') {
        const rows = await database
          .select({
            entityId: entities.id,
            entityType: entities.entityType,
            entityUpdatedAt: entities.updatedAt,
            entityDeletedAt: entities.deletedAt,
          })
          .from(entities)
          .where(eq(entities.id, targetId))
          .limit(1);
        const row = rows[0];
        if (row === undefined || row.entityDeletedAt !== null) return null;
        return {
          targetType,
          targetId: row.entityId,
          entityId: row.entityId,
          entityType: row.entityType,
          entityUpdatedAt: row.entityUpdatedAt.toISOString(),
          locationId: null,
          locationUpdatedAt: null,
        };
      }

      const rows = await database
        .select({
          locationId: locations.id,
          locationUpdatedAt: locations.updatedAt,
          locationDeletedAt: locations.deletedAt,
          entityId: entities.id,
          entityType: entities.entityType,
          entityUpdatedAt: entities.updatedAt,
          entityDeletedAt: entities.deletedAt,
        })
        .from(locations)
        .innerJoin(entities, eq(entities.id, locations.entityId))
        .where(eq(locations.id, targetId))
        .limit(1);
      const row = rows[0];
      if (row === undefined || row.locationDeletedAt !== null || row.entityDeletedAt !== null) {
        return null;
      }
      return {
        targetType,
        targetId: row.locationId,
        entityId: row.entityId,
        entityType: row.entityType,
        entityUpdatedAt: row.entityUpdatedAt.toISOString(),
        locationId: row.locationId,
        locationUpdatedAt: row.locationUpdatedAt.toISOString(),
      };
    },

    async commitPlan(command) {
      const existingClaimGuards = command.expectedExistingClaims.map(claimGuard);
      const assetGuards = command.assetIds.map(
        (id) =>
          sql`exists (select 1 from ${assets} where ${assets.id} = ${id} and ${assets.status} = 'active')`,
      );
      const networkGuards = command.networkIds.map(
        (id) =>
          sql`exists (select 1 from ${networks} where ${networks.id} = ${id} and ${networks.status} = 'active')`,
      );
      const methodGuards = command.paymentMethodIds.map(
        (id) =>
          sql`exists (select 1 from ${paymentMethods} where ${paymentMethods.id} = ${id} and ${paymentMethods.status} = 'active')`,
      );
      const processorGuards = command.processorIds.map(
        (id) => sql`exists (
          select 1 from ${entities}
          where ${entities.id} = ${id}
            and ${entities.entityType} = 'payment_processor'
            and ${entities.entityStatus} = 'active'
            and ${entities.deletedAt} is null
        )`,
      );
      const targetGuard =
        command.target.targetType === 'entity'
          ? sql`exists (
              select 1 from ${entities} target_entity
              where target_entity.id = ${command.target.entityId}
                and target_entity.entity_type = ${command.target.entityType}
                and target_entity.updated_at = ${new Date(command.target.entityUpdatedAt)}
                and target_entity.deleted_at is null
            )`
          : sql`exists (
              select 1
              from ${locations} target_location
              inner join ${entities} target_entity on target_entity.id = target_location.entity_id
              where target_location.id = ${command.target.locationId as string}
                and target_location.updated_at = ${new Date(command.target.locationUpdatedAt as string)}
                and target_location.deleted_at is null
                and target_entity.id = ${command.target.entityId}
                and target_entity.entity_type = ${command.target.entityType}
                and target_entity.updated_at = ${new Date(command.target.entityUpdatedAt)}
                and target_entity.deleted_at is null
            )`;

      const lock = database.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${command.applicationId}, 0))`,
      );
      const guard = database.select({
        guard: sql<number>`1 / case when
          exists (
            select 1
            from ${submissionApplications} application
            inner join ${submissions} submission on submission.id = application.submission_id
            where application.id = ${command.applicationId}
              and application.submission_id = ${command.submissionId}
              and application.source_decision_event_id = ${command.sourceDecisionEventId}
              and application.application_status = 'pending'
              and application.publication_status = 'blocked'
              and application.application_receipt_kind is null
              and application.updated_at = ${command.expectedApplicationUpdatedAt}
              and submission.submission_type = 'claim'
              and submission.workflow_status = 'resolved'
              and submission.resolution = 'approved'
              and submission.target_type = ${command.target.targetType}
              and submission.target_id = ${command.target.targetId}
          )
          and exists (
            select 1 from ${submissionEvents} relationship_decision
            where relationship_decision.id = ${command.sourceDecisionEventId}
              and relationship_decision.submission_id = ${command.submissionId}
              and relationship_decision.action = 'business_claim_relationship_approved'
              and relationship_decision.to_status = 'resolved'
          )
          and exists (
            select 1 from ${submissionEvents} field_event
            where field_event.id = ${command.fieldApplicationEventId}
              and field_event.submission_id = ${command.submissionId}
              and field_event.action = 'business_claim_fields_applied'
          )
          and ${targetGuard}
          and ${allGuards(existingClaimGuards)}
          and ${allGuards(assetGuards)}
          and ${allGuards(networkGuards)}
          and ${allGuards(methodGuards)}
          and ${allGuards(processorGuards)}
          and not exists (
            select 1 from ${submissionEvents} prior_plan
            where prior_plan.submission_id = ${command.submissionId}
              and prior_plan.action = 'business_claim_payment_plan_prepared'
          )
          and not exists (
            select 1 from ${submissionEvents} duplicate_id
            where duplicate_id.id = ${command.planId}
          )
          then 1 else 0 end`,
      });
      const event = database.insert(submissionEvents).values({
        id: command.planId,
        submissionId: command.submissionId,
        fromStatus: null,
        toStatus: 'resolved',
        action: 'business_claim_payment_plan_prepared',
        reasonCode: 'payment_information',
        actorId: command.actorId,
        actorType: command.actorType === 'human' ? 'reviewer' : 'system',
        internalNote: command.internalNote,
        createdAt: command.plannedAt,
      });

      try {
        await database.batch([lock, guard, event] as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new SubmissionPersistenceError(
            'conflict',
            'Business Claim payment planning conflicted with current canonical state.',
            { cause: error },
          );
        }
        throw error;
      }
    },
  };
}
