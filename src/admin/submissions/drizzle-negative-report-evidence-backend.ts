import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  evidence,
  submissionEvents,
  submissionPayloads,
  submissions,
} from '../../db/schema';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type { NegativeReportEvidenceBackend } from './negative-report-evidence';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];
const negativeSubmissionTypes = ['payment_report', 'problem_report'] as const;

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function createDrizzleNegativeReportEvidenceBackend(
  database: CryptoPayMapDatabase,
): NegativeReportEvidenceBackend {
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
          originalPayload: submissionPayloads.originalPayload,
          normalizedPayload: submissionPayloads.normalizedPayload,
          payloadUpdatedAt: submissionPayloads.updatedAt,
          claimId: acceptanceClaims.id,
          claimEntityId: acceptanceClaims.entityId,
          claimLocationId: acceptanceClaims.locationId,
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
        .where(
          and(
            eq(submissions.id, submissionId),
            inArray(submissions.submissionType, negativeSubmissionTypes),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      return {
        submissionId: row.submissionId,
        submissionType: row.submissionType,
        targetType: row.targetType,
        targetId: row.targetId,
        workflowStatus: row.workflowStatus,
        updatedAt: row.updatedAt.toISOString(),
        originalPayload: row.originalPayload,
        normalizedPayload: row.normalizedPayload,
        payloadUpdatedAt: row.payloadUpdatedAt.toISOString(),
        claim: {
          id: row.claimId,
          entityId: row.claimEntityId,
          locationId: row.claimLocationId,
          claimStatus: row.claimStatus,
          visibility: row.claimVisibility,
          updatedAt: row.claimUpdatedAt.toISOString(),
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
          reasonCode: submissionEvents.reasonCode,
          actorId: submissionEvents.actorId,
          internalNote: submissionEvents.internalNote,
          createdAt: submissionEvents.createdAt,
        })
        .from(submissionEvents)
        .where(eq(submissionEvents.id, eventId))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      return { ...row, createdAt: row.createdAt.toISOString() };
    },

    async commitDecision(command) {
      const submissionGuard = database.execute(sql`
        select 1 / case when exists (
          select 1
          from ${submissions}
          inner join ${submissionPayloads}
            on ${submissionPayloads.submissionId} = ${submissions.id}
          where ${submissions.id} = ${command.submissionId}
            and ${submissions.submissionType} in ('payment_report', 'problem_report')
            and ${submissions.workflowStatus} = 'in_review'
            and ${submissions.updatedAt} = ${command.expectedSubmissionUpdatedAt}
            and ${submissionPayloads.updatedAt} = ${command.expectedPayloadUpdatedAt}
          for update of ${submissions}, ${submissionPayloads}
        ) then 1 else 0 end as negative_report_submission_guard
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
          for share
        ) then 1 else 0 end as negative_report_claim_guard
      `);

      try {
        await database.batch([
          submissionGuard,
          claimGuard,
          database.insert(evidence).values({
            id: command.evidenceId,
            claimId: command.claimId,
            submissionId: command.submissionId,
            sourceRecordId: null,
            evidenceKind: command.evidenceKind,
            evidenceClass: command.evidenceClass,
            sourceType: command.sourceType,
            originRole: 'usage_side',
            polarity: 'contradicting',
            sourceName: 'CryptoPayMap negative report',
            sourceUrl: command.sourceUrl,
            sourceNativeId: null,
            observedAt: command.observedAt,
            publishedAt: null,
            fetchedAt: command.decidedAt,
            summary: command.evidenceSummary,
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
            action: 'negative_report_evidence_decided',
            reasonCode:
              command.decision === 'accept_and_prioritize_recheck'
                ? 'negative_evidence_recheck_priority'
                : 'negative_evidence_accepted',
            actorId: command.actorId,
            actorType: command.actorType === 'human' ? 'reviewer' : 'system',
            internalNote: command.eventInternalNote,
            createdAt: command.decidedAt,
          }),
        ] as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new SubmissionPersistenceError(
            'conflict',
            'Negative Evidence transaction conflicted with current private state and was rolled back.',
            { cause: error },
          );
        }
        throw error;
      }
    },
  };
}
