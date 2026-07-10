import { eq } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { submissionEvents, submissions } from '../../db/schema';
import { createDrizzleSubmissionPersistenceBackend } from '../../submissions/drizzle-persistence';
import type { SuggestReviewTransitionBackend } from './transitions';

export function createDrizzleSuggestReviewTransitionBackend(
  database: CryptoPayMapDatabase,
): SuggestReviewTransitionBackend {
  const persistence = createDrizzleSubmissionPersistenceBackend(database);
  return {
    async readState(submissionId) {
      const rows = await database
        .select({
          submissionId: submissions.id,
          submissionType: submissions.submissionType,
          workflowStatus: submissions.workflowStatus,
          updatedAt: submissions.updatedAt,
        })
        .from(submissions)
        .where(eq(submissions.id, submissionId))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      return {
        submissionId: row.submissionId,
        submissionType: row.submissionType,
        workflowStatus: row.workflowStatus,
        updatedAt: row.updatedAt.toISOString(),
      };
    },

    async readEvent(eventId) {
      const rows = await database
        .select({
          eventId: submissionEvents.id,
          submissionId: submissionEvents.submissionId,
          fromStatus: submissionEvents.fromStatus,
          toStatus: submissionEvents.toStatus,
          action: submissionEvents.action,
          actorId: submissionEvents.actorId,
          createdAt: submissionEvents.createdAt,
        })
        .from(submissionEvents)
        .where(eq(submissionEvents.id, eventId))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      return {
        eventId: row.eventId,
        submissionId: row.submissionId,
        fromStatus: row.fromStatus,
        toStatus: row.toStatus,
        action: row.action,
        actorId: row.actorId,
        createdAt: row.createdAt.toISOString(),
      };
    },

    async commitTransition(command) {
      await persistence.transitionSubmission({
        eventId: command.eventId,
        submissionId: command.submissionId,
        expectedStatus: command.expectedStatus,
        expectedUpdatedAt: command.expectedUpdatedAt,
        toStatus: command.toStatus,
        resolution: null,
        action: command.eventAction,
        reasonCode: null,
        actorId: command.actorId,
        actorType: 'reviewer',
        internalNote: null,
        changedAt: command.changedAt,
      });
    },
  };
}
