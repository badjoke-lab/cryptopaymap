import { and, eq } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  candidatePromotionDecisions,
  sourceCandidates,
  submissionEvents,
  submissions,
} from '../../db/schema';
import { createDrizzleSubmissionApplicationLifecycleBackend } from './drizzle-application-lifecycle-backend';
import type {
  SuggestApplicationBindingBackend,
  SuggestApplicationBindingState,
} from './suggest-application-binding';

export function createDrizzleSuggestApplicationBindingBackend(
  database: CryptoPayMapDatabase,
): SuggestApplicationBindingBackend {
  const lifecycle = createDrizzleSubmissionApplicationLifecycleBackend(database);
  return {
    ...lifecycle,

    async readBindingState(applicationId, promotionDecisionId) {
      const application = await lifecycle.readApplication(applicationId);
      if (application === null) return null;

      const submissionRows = await database
        .select({
          submissionId: submissions.id,
          submissionType: submissions.submissionType,
          workflowStatus: submissions.workflowStatus,
          resolution: submissions.resolution,
          eventId: submissionEvents.id,
          eventSubmissionId: submissionEvents.submissionId,
          eventToStatus: submissionEvents.toStatus,
          eventAction: submissionEvents.action,
          eventInternalNote: submissionEvents.internalNote,
          eventCreatedAt: submissionEvents.createdAt,
        })
        .from(submissions)
        .leftJoin(
          submissionEvents,
          and(
            eq(submissionEvents.id, application.sourceDecisionEventId),
            eq(submissionEvents.submissionId, submissions.id),
          ),
        )
        .where(eq(submissions.id, application.submissionId))
        .limit(1);
      const submission = submissionRows[0];
      if (submission === undefined) return null;

      const promotionRows = await database
        .select({
          promotionDecisionId: candidatePromotionDecisions.id,
          candidateId: candidatePromotionDecisions.candidateId,
          entityId: candidatePromotionDecisions.entityId,
          locationId: candidatePromotionDecisions.locationId,
          claimId: candidatePromotionDecisions.claimId,
          promotedAt: candidatePromotionDecisions.promotedAt,
          candidateStatus: sourceCandidates.candidateStatus,
          canonicalEntityId: sourceCandidates.canonicalEntityId,
          canonicalLocationId: sourceCandidates.canonicalLocationId,
        })
        .from(candidatePromotionDecisions)
        .innerJoin(
          sourceCandidates,
          eq(sourceCandidates.id, candidatePromotionDecisions.candidateId),
        )
        .where(eq(candidatePromotionDecisions.id, promotionDecisionId))
        .limit(1);
      const promotion = promotionRows[0];

      return {
        application,
        submission: {
          submissionId: submission.submissionId,
          submissionType: submission.submissionType,
          workflowStatus: submission.workflowStatus,
          resolution: submission.resolution,
        },
        sourceDecisionEvent:
          submission.eventId === null ||
          submission.eventSubmissionId === null ||
          submission.eventToStatus === null ||
          submission.eventAction === null ||
          submission.eventCreatedAt === null
            ? null
            : {
                eventId: submission.eventId,
                submissionId: submission.eventSubmissionId,
                toStatus: submission.eventToStatus,
                action: submission.eventAction,
                internalNote: submission.eventInternalNote,
                createdAt: submission.eventCreatedAt.toISOString(),
              },
        promotionDecision:
          promotion === undefined
            ? null
            : {
                promotionDecisionId: promotion.promotionDecisionId,
                candidateId: promotion.candidateId,
                entityId: promotion.entityId,
                locationId: promotion.locationId,
                claimId: promotion.claimId,
                promotedAt: promotion.promotedAt.toISOString(),
              },
        candidate:
          promotion === undefined
            ? null
            : {
                candidateId: promotion.candidateId,
                candidateStatus: promotion.candidateStatus,
                canonicalEntityId: promotion.canonicalEntityId,
                canonicalLocationId: promotion.canonicalLocationId,
              },
      } satisfies SuggestApplicationBindingState;
    },
  };
}
