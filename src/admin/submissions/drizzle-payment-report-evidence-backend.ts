import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  assets,
  claimAssets,
  entities,
  evidence,
  networks,
  paymentMethods,
  submissionEvents,
  submissionPayloads,
  submissions,
  verificationEventEvidence,
  verificationEvents,
} from '../../db/schema';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type {
  PositivePaymentEvidenceBackend,
  PositivePaymentEvidenceCommitCommand,
} from './payment-report-evidence';

const paymentReportTypes = ['payment_report'] as const;
type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function paymentSetGuard(
  database: CryptoPayMapDatabase,
  command: PositivePaymentEvidenceCommitCommand,
) {
  return database.execute(sql`
    with locked_payment_rows as materialized (
      select
        ${claimAssets.id} as id,
        ${claimAssets.isPrimary} as is_primary,
        ${assets.status} as asset_status,
        ${networks.slug} as network_slug,
        ${networks.status} as network_status,
        ${paymentMethods.slug} as payment_method_slug,
        ${paymentMethods.status} as payment_method_status,
        ${acceptanceClaims.routeType} as claim_route_type
      from ${claimAssets}
      inner join ${assets} on ${claimAssets.assetId} = ${assets.id}
      inner join ${networks} on ${claimAssets.networkId} = ${networks.id}
      inner join ${paymentMethods} on ${claimAssets.paymentMethodId} = ${paymentMethods.id}
      inner join ${acceptanceClaims} on ${claimAssets.claimId} = ${acceptanceClaims.id}
      where ${claimAssets.claimId} = ${command.claimId}
      for share of ${claimAssets}, ${assets}, ${networks}, ${paymentMethods}
    )
    select 1 / case when
      (
        select coalesce(jsonb_agg(id order by id), '[]'::jsonb)
        from locked_payment_rows
      ) = ${JSON.stringify(command.expectedClaimAssetIds)}::jsonb
      and (
        ${command.decision} <> 'accept_and_reconfirm'
        or (
          (select count(*) from locked_payment_rows) > 0
          and (select count(*) from locked_payment_rows where is_primary = true) = 1
          and not exists (
            select 1 from locked_payment_rows
            where asset_status <> 'active'
              or network_status <> 'active'
              or payment_method_status <> 'active'
              or (
                payment_method_slug in ('lightning_invoice', 'lightning_nfc')
                and network_slug <> 'lightning'
              )
              or (payment_method_slug = 'onchain' and network_slug = 'lightning')
              or (
                payment_method_slug = 'processor_checkout'
                and claim_route_type <> 'processor_checkout'
              )
          )
        )
      )
      then 1 else 0 end as positive_payment_set_guard
  `);
}

export function createDrizzlePositivePaymentEvidenceBackend(
  database: CryptoPayMapDatabase,
): PositivePaymentEvidenceBackend {
  return {
    async readState(submissionId, claimId) {
      const rows = await database
        .select({
          submissionId: submissions.id,
          submissionType: submissions.submissionType,
          targetType: submissions.targetType,
          targetId: submissions.targetId,
          workflowStatus: submissions.workflowStatus,
          updatedAt: submissions.updatedAt,
          normalizedPayload: submissionPayloads.normalizedPayload,
          payloadUpdatedAt: submissionPayloads.updatedAt,
          claimId: acceptanceClaims.id,
          claimEntityId: acceptanceClaims.entityId,
          claimLocationId: acceptanceClaims.locationId,
          routeType: acceptanceClaims.routeType,
          processorName: entities.name,
          claimStatus: acceptanceClaims.claimStatus,
          claimVisibility: acceptanceClaims.visibility,
          claimUpdatedAt: acceptanceClaims.updatedAt,
        })
        .from(submissions)
        .innerJoin(submissionPayloads, eq(submissionPayloads.submissionId, submissions.id))
        .innerJoin(
          acceptanceClaims,
          and(eq(acceptanceClaims.id, claimId), isNull(acceptanceClaims.deletedAt)),
        )
        .leftJoin(
          entities,
          and(eq(entities.id, acceptanceClaims.processorId), isNull(entities.deletedAt)),
        )
        .where(and(eq(submissions.id, submissionId), inArray(submissions.submissionType, paymentReportTypes)))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;

      const optionRows = await database
        .select({
          id: claimAssets.id,
          assetSlug: assets.slug,
          networkSlug: networks.slug,
          paymentMethod: paymentMethods.slug,
        })
        .from(claimAssets)
        .innerJoin(assets, eq(assets.id, claimAssets.assetId))
        .innerJoin(networks, eq(networks.id, claimAssets.networkId))
        .innerJoin(paymentMethods, eq(paymentMethods.id, claimAssets.paymentMethodId))
        .where(eq(claimAssets.claimId, claimId));

      return {
        submissionId: row.submissionId,
        submissionType: row.submissionType,
        targetType: row.targetType,
        targetId: row.targetId,
        workflowStatus: row.workflowStatus,
        updatedAt: row.updatedAt.toISOString(),
        normalizedPayload: row.normalizedPayload,
        payloadUpdatedAt: row.payloadUpdatedAt.toISOString(),
        claim: {
          id: row.claimId,
          entityId: row.claimEntityId,
          locationId: row.claimLocationId,
          routeType: row.routeType,
          processorName: row.processorName,
          claimStatus: row.claimStatus,
          visibility: row.claimVisibility,
          updatedAt: row.claimUpdatedAt.toISOString(),
          options: optionRows,
        },
      };
    },

    async readDecisionEvent(eventId) {
      const rows = await database
        .select({
          eventId: submissionEvents.id,
          submissionId: submissionEvents.submissionId,
          fromStatus: submissionEvents.fromStatus,
          toStatus: submissionEvents.toStatus,
          action: submissionEvents.action,
          actorId: submissionEvents.actorId,
          internalNote: submissionEvents.internalNote,
          createdAt: submissionEvents.createdAt,
        })
        .from(submissionEvents)
        .where(eq(submissionEvents.id, eventId))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      return {
        ...row,
        createdAt: row.createdAt.toISOString(),
      };
    },

    async commitDecision(command) {
      const submissionGuard = database.execute(sql`
        select 1 / case when exists (
          select 1
          from ${submissions}
          inner join ${submissionPayloads}
            on ${submissionPayloads.submissionId} = ${submissions.id}
          where ${submissions.id} = ${command.submissionId}
            and ${submissions.submissionType} = 'payment_report'
            and ${submissions.workflowStatus} = 'in_review'
            and ${submissions.updatedAt} = ${command.expectedSubmissionUpdatedAt}
            and ${submissionPayloads.updatedAt} = ${command.expectedPayloadUpdatedAt}
          for update of ${submissions}, ${submissionPayloads}
        ) then 1 else 0 end as positive_payment_submission_guard
      `);
      const claimGuard = database.execute(sql`
        select 1 / case when exists (
          select 1
          from ${acceptanceClaims}
          where ${acceptanceClaims.id} = ${command.claimId}
            and ${acceptanceClaims.claimStatus} = ${command.expectedClaimStatus}
            and ${acceptanceClaims.visibility} = ${command.expectedClaimVisibility}
            and ${acceptanceClaims.updatedAt} = ${command.expectedClaimUpdatedAt}
            and ${acceptanceClaims.deletedAt} is null
          for update
        ) then 1 else 0 end as positive_payment_claim_guard
      `);

      const statements: unknown[] = [
        submissionGuard,
        claimGuard,
        paymentSetGuard(database, command),
        database.insert(evidence).values({
          id: command.evidenceId,
          claimId: command.claimId,
          submissionId: command.submissionId,
          sourceRecordId: null,
          evidenceKind: command.evidenceKind,
          evidenceClass: command.evidenceClass,
          sourceType: command.sourceType,
          originRole: 'usage_side',
          polarity: 'supporting',
          sourceName: 'CryptoPayMap payment report',
          sourceUrl: command.sourceUrl,
          sourceNativeId: null,
          observedAt: command.observedAt,
          publishedAt: null,
          fetchedAt: command.decidedAt,
          summary: command.summary,
          visibility: command.evidenceVisibility,
          reviewStatus: 'accepted',
          archiveUrl: null,
          contentHash: null,
          licenseId: null,
          attribution: null,
          independenceKey: command.independenceKey,
          createdAt: command.decidedAt,
          updatedAt: command.decidedAt,
        }),
        database
          .update(submissions)
          .set({
            workflowStatus: 'resolved',
            resolution: 'approved',
            updatedAt: command.decidedAt,
            resolvedAt: command.decidedAt,
            withdrawnAt: null,
          })
          .where(eq(submissions.id, command.submissionId)),
        database.insert(submissionEvents).values({
          id: command.eventId,
          submissionId: command.submissionId,
          fromStatus: 'in_review',
          toStatus: 'resolved',
          action: 'positive_payment_evidence_decided',
          reasonCode:
            command.decision === 'accept_and_reconfirm'
              ? 'payment_report_reconfirmed'
              : 'payment_report_evidence_accepted',
          actorId: command.actorId,
          actorType: command.actorType === 'human' ? 'reviewer' : 'system',
          internalNote: command.eventInternalNote,
          createdAt: command.decidedAt,
        }),
      ];

      if (command.decision === 'accept_and_reconfirm' && command.verificationEventId !== null) {
        const eventType = command.expectedClaimStatus === 'stale' ? 'restored' : 'reconfirmed';
        statements.push(
          database
            .update(acceptanceClaims)
            .set({
              claimStatus: 'confirmed',
              lastConfirmedAt: command.decidedAt,
              nextReviewAt: command.nextReviewAt,
              endedAt: null,
              endedReason: null,
              updatedAt: command.decidedAt,
            })
            .where(eq(acceptanceClaims.id, command.claimId)),
          database.insert(verificationEvents).values({
            id: command.verificationEventId,
            claimId: command.claimId,
            eventType,
            fromStatus: command.expectedClaimStatus,
            toStatus: 'confirmed',
            fromVisibility: null,
            toVisibility: null,
            reasonCode: 'successful_payment_report',
            effectiveAt: command.decidedAt,
            publicSummary: command.summary,
            internalNote: command.reviewerNote,
            actorType: 'system',
            actorId: null,
            createdAt: command.decidedAt,
          }),
          database.insert(verificationEventEvidence).values({
            verificationEventId: command.verificationEventId,
            evidenceId: command.evidenceId,
            relationship: 'basis',
            createdAt: command.decidedAt,
          }),
        );
      }

      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new SubmissionPersistenceError(
            'conflict',
            'Positive payment Evidence transaction conflicted with current private state and was rolled back.',
            { cause: error },
          );
        }
        throw error;
      }
    },
  };
}
