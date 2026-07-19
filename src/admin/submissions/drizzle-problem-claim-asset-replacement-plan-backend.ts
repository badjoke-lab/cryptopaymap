import { eq, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  assets,
  claimAssets,
  networks,
  paymentMethods,
  submissionApplications,
  submissionEvents,
  submissions,
} from '../../db/schema';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import { createDrizzleProblemClaimAssetSetPreviewBackend } from './drizzle-problem-claim-asset-set-preview-backend';
import type { ProblemClaimAssetReplacementPlanBackend } from './problem-claim-asset-replacement-plan';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function createDrizzleProblemClaimAssetReplacementPlanBackend(
  database: CryptoPayMapDatabase,
): ProblemClaimAssetReplacementPlanBackend {
  const preview = createDrizzleProblemClaimAssetSetPreviewBackend(database);
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
      const row = rows[0];
      return row === undefined
        ? null
        : {
            ...row,
            createdAt: row.createdAt.toISOString(),
          };
    },

    async commitPlan(command) {
      const expectedSet = JSON.stringify(command.expectedCurrentSet);
      const lock = database.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${command.applicationId}, 0))`,
      );
      const guard = database.select({
        guard: sql<number>`1 / case when
          exists (
            select 1
            from ${submissionApplications} application
            inner join ${submissions} submission
              on submission.id = application.submission_id
            inner join ${acceptanceClaims} claim
              on claim.id = submission.target_id
            where application.id = ${command.applicationId}
              and application.submission_id = ${command.submissionId}
              and application.source_decision_event_id = ${command.sourceDecisionEventId}
              and application.application_status = 'pending'
              and application.publication_status = 'blocked'
              and application.application_receipt_kind is null
              and application.updated_at = ${command.expectedApplicationUpdatedAt}
              and submission.submission_type = 'problem_report'
              and submission.workflow_status = 'resolved'
              and submission.resolution = 'approved'
              and submission.target_type = 'claim'
              and submission.target_id = ${command.claimId}
              and claim.id = ${command.claimId}
              and claim.claim_status in ('confirmed', 'stale')
              and claim.deleted_at is null
              and claim.updated_at = ${command.expectedClaimUpdatedAt}
          )
          and exists (
            select 1 from ${submissionEvents} decision
            where decision.id = ${command.sourceDecisionEventId}
              and decision.submission_id = ${command.submissionId}
              and decision.action = 'problem_correction_handoff_approved'
              and decision.to_status = 'resolved'
          )
          and exists (
            select 1 from ${assets}
            where ${assets.id} = ${command.proposedAssetId}
              and ${assets.status} = 'active'
          )
          and exists (
            select 1 from ${networks}
            where ${networks.id} = ${command.proposedNetworkId}
              and ${networks.status} = 'active'
          )
          and (
            select coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'rowId', current_row.id::text,
                  'claimId', current_row.claim_id::text,
                  'asset', jsonb_build_object(
                    'id', current_asset.id::text,
                    'slug', current_asset.slug,
                    'symbol', current_asset.symbol,
                    'status', current_asset.status
                  ),
                  'network', jsonb_build_object(
                    'id', current_network.id::text,
                    'slug', current_network.slug,
                    'status', current_network.status
                  ),
                  'paymentMethod', jsonb_build_object(
                    'id', current_method.id::text,
                    'slug', current_method.slug,
                    'status', current_method.status
                  ),
                  'contractAddress', current_row.contract_address,
                  'isPrimary', current_row.is_primary,
                  'notes', current_row.notes
                ) order by current_row.id
              ),
              '[]'::jsonb
            )
            from ${claimAssets} current_row
            inner join ${assets} current_asset on current_asset.id = current_row.asset_id
            inner join ${networks} current_network on current_network.id = current_row.network_id
            inner join ${paymentMethods} current_method
              on current_method.id = current_row.payment_method_id
            where current_row.claim_id = ${command.claimId}
          ) = cast(${expectedSet} as jsonb)
          and not exists (
            select 1 from ${submissionEvents}
            where ${submissionEvents.id} = ${command.planId}
          )
          then 1 else 0 end`,
      });
      const event = database.insert(submissionEvents).values({
        id: command.planId,
        submissionId: command.submissionId,
        fromStatus: null,
        toStatus: 'resolved',
        action: 'problem_claim_asset_replacement_planned',
        reasonCode: command.correctionKind,
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
            'Claim Asset replacement planning conflicted with current canonical state.',
            { cause: error },
          );
        }
        throw error;
      }
    },
  };
}
