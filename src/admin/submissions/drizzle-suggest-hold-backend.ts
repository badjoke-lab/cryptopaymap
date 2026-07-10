import { eq } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { submissionEvents, submissions } from '../../db/schema';
import { createDrizzleSubmissionPersistenceBackend } from '../../submissions/drizzle-persistence';
import type { SuggestHoldBackend } from './hold';

export function createDrizzleSuggestHoldBackend(database: CryptoPayMapDatabase): SuggestHoldBackend {
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

    async readHoldEvent(eventId) {
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
        eventId: row.eventId,
        submissionId: row.submissionId,
        fromStatus: row.fromStatus,
        toStatus: row.toStatus,
        action: row.action,
        actorId: row.actorId,
        internalNote: row.internalNote,
        createdAt: row.createdAt.toISOString(),
      };
    },

    async commitHold(command) {
      await persistence.transitionSubmission({
        eventId: command.eventId,
        submissionId: command.submissionId,
        expectedStatus: 'in_review',
        expectedUpdatedAt: command.expectedUpdatedAt,
        toStatus: 'on_hold',
        resolution: null,
        action: 'submission_hold_started',
        reasonCode: null,
        actorId: command.actorId,
        actorType: 'reviewer',
        internalNote: command.internalNote,
        changedAt: command.changedAt,
      });
    },
  };
}
