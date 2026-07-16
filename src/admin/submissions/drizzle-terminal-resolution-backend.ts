import { eq, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { submissionEvents, submissions } from '../../db/schema';
import { createDrizzleSubmissionPersistenceBackend } from '../../submissions/drizzle-persistence';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import { assertSubmissionWorkflowTransition } from '../../submissions/workflow';
import type { SubmissionTerminalResolutionBackend } from './terminal-resolution';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function createDrizzleTerminalResolutionBackend(
  database: CryptoPayMapDatabase,
): SubmissionTerminalResolutionBackend {
  const persistence = createDrizzleSubmissionPersistenceBackend(database);
  return {
    async readState(submissionId) {
      const rows = await database
        .select({
          submissionId: submissions.id,
          submissionType: submissions.submissionType,
          workflowStatus: submissions.workflowStatus,
          resolution: submissions.resolution,
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
        resolution: row.resolution,
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
      return {
        eventId: row.eventId,
        submissionId: row.submissionId,
        fromStatus: row.fromStatus,
        toStatus: row.toStatus,
        action: row.action,
        reasonCode: row.reasonCode,
        actorId: row.actorId,
        internalNote: row.internalNote,
        createdAt: row.createdAt.toISOString(),
      };
    },

    async readDuplicateTarget(submissionId) {
      const rows = await database
        .select({
          submissionId: submissions.id,
          publicId: submissions.publicId,
          submissionType: submissions.submissionType,
          workflowStatus: submissions.workflowStatus,
        })
        .from(submissions)
        .where(eq(submissions.id, submissionId))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      return row;
    },

    async commitResolution(command) {
      assertSubmissionWorkflowTransition({
        fromStatus: command.expectedStatus,
        toStatus: command.toStatus,
        resolution: command.resolution,
      });

      if (command.duplicateSubmissionId === null) {
        await persistence.transitionSubmission({
          eventId: command.eventId,
          submissionId: command.submissionId,
          expectedStatus: command.expectedStatus,
          expectedUpdatedAt: command.expectedUpdatedAt,
          toStatus: command.toStatus,
          resolution: command.resolution,
          action: command.eventAction,
          reasonCode: command.reasonCode,
          actorId: command.actorId,
          actorType: 'reviewer',
          internalNote: command.internalNote,
          changedAt: command.changedAt,
        });
        return;
      }

      const guard = database.select({
        guard: sql<number>`1 / case when exists (
          select 1
          from ${submissions}
          where ${submissions.id} = ${command.submissionId}
            and ${submissions.submissionType} = ${command.submissionType}
            and ${submissions.workflowStatus} = ${command.expectedStatus}
            and ${submissions.resolution} is null
            and ${submissions.updatedAt} = ${command.expectedUpdatedAt}
        ) and exists (
          select 1
          from ${submissions}
          where ${submissions.id} = ${command.duplicateSubmissionId}
            and ${submissions.id} <> ${command.submissionId}
            and ${submissions.submissionType} = ${command.submissionType}
            and ${submissions.workflowStatus} not in ('duplicate', 'rejected_spam', 'withdrawn')
        ) then 1 else 0 end`,
      });
      const statements: unknown[] = [
        guard,
        database
          .update(submissions)
          .set({
            workflowStatus: command.toStatus,
            resolution: command.resolution,
            updatedAt: command.changedAt,
            resolvedAt: null,
            withdrawnAt: null,
          })
          .where(eq(submissions.id, command.submissionId)),
        database.insert(submissionEvents).values({
          id: command.eventId,
          submissionId: command.submissionId,
          fromStatus: command.expectedStatus,
          toStatus: command.toStatus,
          action: command.eventAction,
          reasonCode: command.reasonCode,
          actorId: command.actorId,
          actorType: 'reviewer',
          internalNote: command.internalNote,
          createdAt: command.changedAt,
        }),
      ];

      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new SubmissionPersistenceError(
            'conflict',
            'Terminal resolution conflicted with the current Submission or duplicate target.',
            { cause: error },
          );
        }
        throw error;
      }
    },
  };
}
