import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  evidence,
  submissionEvents,
  submissions,
  verificationEvents,
} from '../../db/schema';
import { createDrizzleSubmissionApplicationLifecycleBackend } from './drizzle-application-lifecycle-backend';
import type { NegativeRecheckApplicationBackend } from './negative-recheck-application';

const resolvingEventTypes = [
  'reconfirmed',
  'restored',
  'marked_stale',
  'ended',
  'corrected',
] as const;

export function createDrizzleNegativeRecheckApplicationBackend(
  database: CryptoPayMapDatabase,
): NegativeRecheckApplicationBackend {
  const lifecycle = createDrizzleSubmissionApplicationLifecycleBackend(database);
  return {
    readApplication: lifecycle.readApplication,

    async readDecisionState(submissionId, decisionEventId) {
      const rows = await database
        .select({
          submissionId: submissions.id,
          submissionType: submissions.submissionType,
          workflowStatus: submissions.workflowStatus,
          resolution: submissions.resolution,
          eventId: submissionEvents.id,
          eventSubmissionId: submissionEvents.submissionId,
          eventFromStatus: submissionEvents.fromStatus,
          eventToStatus: submissionEvents.toStatus,
          eventAction: submissionEvents.action,
          eventReasonCode: submissionEvents.reasonCode,
          eventInternalNote: submissionEvents.internalNote,
          eventCreatedAt: submissionEvents.createdAt,
        })
        .from(submissions)
        .leftJoin(
          submissionEvents,
          and(
            eq(submissionEvents.id, decisionEventId),
            eq(submissionEvents.submissionId, submissions.id),
          ),
        )
        .where(eq(submissions.id, submissionId))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      return {
        submission: {
          submissionId: row.submissionId,
          submissionType: row.submissionType,
          workflowStatus: row.workflowStatus,
          resolution: row.resolution,
        },
        event:
          row.eventId === null ||
          row.eventSubmissionId === null ||
          row.eventToStatus === null ||
          row.eventAction === null ||
          row.eventCreatedAt === null
            ? null
            : {
                eventId: row.eventId,
                submissionId: row.eventSubmissionId,
                fromStatus: row.eventFromStatus,
                toStatus: row.eventToStatus,
                action: row.eventAction,
                reasonCode: row.eventReasonCode,
                internalNote: row.eventInternalNote,
                createdAt: row.eventCreatedAt.toISOString(),
              },
      };
    },

    async readEvidenceClaim(evidenceId) {
      const rows = await database
        .select({
          evidenceId: evidence.id,
          evidenceClaimId: evidence.claimId,
          evidenceSubmissionId: evidence.submissionId,
          evidenceOriginRole: evidence.originRole,
          evidencePolarity: evidence.polarity,
          evidenceVisibility: evidence.visibility,
          evidenceReviewStatus: evidence.reviewStatus,
          evidenceCreatedAt: evidence.createdAt,
          evidenceDeletedAt: evidence.deletedAt,
          claimId: acceptanceClaims.id,
          claimStatus: acceptanceClaims.claimStatus,
          claimVisibility: acceptanceClaims.visibility,
          claimLastConfirmedAt: acceptanceClaims.lastConfirmedAt,
          claimNextReviewAt: acceptanceClaims.nextReviewAt,
          claimUpdatedAt: acceptanceClaims.updatedAt,
          claimDeletedAt: acceptanceClaims.deletedAt,
        })
        .from(evidence)
        .leftJoin(acceptanceClaims, eq(acceptanceClaims.id, evidence.claimId))
        .where(eq(evidence.id, evidenceId))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      return {
        evidence: {
          evidenceId: row.evidenceId,
          claimId: row.evidenceClaimId,
          submissionId: row.evidenceSubmissionId,
          originRole: row.evidenceOriginRole,
          polarity: row.evidencePolarity,
          visibility: row.evidenceVisibility,
          reviewStatus: row.evidenceReviewStatus,
          createdAt: row.evidenceCreatedAt.toISOString(),
          deletedAt: row.evidenceDeletedAt?.toISOString() ?? null,
        },
        claim:
          row.claimId === null ||
          row.claimStatus === null ||
          row.claimVisibility === null ||
          row.claimUpdatedAt === null
            ? null
            : {
                claimId: row.claimId,
                claimStatus: row.claimStatus,
                visibility: row.claimVisibility,
                lastConfirmedAt: row.claimLastConfirmedAt?.toISOString() ?? null,
                nextReviewAt: row.claimNextReviewAt?.toISOString() ?? null,
                updatedAt: row.claimUpdatedAt.toISOString(),
                deletedAt: row.claimDeletedAt?.toISOString() ?? null,
              },
      };
    },

    async readResolutionEvent(claimId, signalAt) {
      const rows = await database
        .select({
          verificationEventId: verificationEvents.id,
          claimId: verificationEvents.claimId,
          eventType: verificationEvents.eventType,
          effectiveAt: verificationEvents.effectiveAt,
        })
        .from(verificationEvents)
        .where(
          and(
            eq(verificationEvents.claimId, claimId),
            inArray(verificationEvents.eventType, resolvingEventTypes),
            gte(verificationEvents.effectiveAt, signalAt),
          ),
        )
        .orderBy(asc(verificationEvents.effectiveAt), asc(verificationEvents.id))
        .limit(1);
      const row = rows[0];
      return row === undefined
        ? null
        : {
            verificationEventId: row.verificationEventId,
            claimId: row.claimId,
            eventType: row.eventType,
            effectiveAt: row.effectiveAt.toISOString(),
          };
    },
  };
}
