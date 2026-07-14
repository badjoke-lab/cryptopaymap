import { eq, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { submissionEvents, submissionPayloads, submissions } from '../../db/schema';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type { BusinessClaimVerificationPreparationBackend } from './business-claim-verification-preparation';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function createDrizzleBusinessClaimVerificationPreparationBackend(
  database: CryptoPayMapDatabase,
): BusinessClaimVerificationPreparationBackend {
  return {
    async readState(submissionId) {
      const rows = await database
        .select({
          submissionId: submissions.id,
          submissionType: submissions.submissionType,
          workflowStatus: submissions.workflowStatus,
          updatedAt: submissions.updatedAt,
          normalizedProjection: submissionPayloads.normalizedPayload,
        })
        .from(submissions)
        .leftJoin(submissionPayloads, eq(submissionPayloads.submissionId, submissions.id))
        .where(eq(submissions.id, submissionId))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      return {
        submissionId: row.submissionId,
        submissionType: row.submissionType,
        workflowStatus: row.workflowStatus,
        updatedAt: row.updatedAt.toISOString(),
        normalizedProjection: row.normalizedProjection,
      };
    },

    async readPreparationEvent(eventId) {
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

    async commitPreparation(command) {
      const guard = database.select({
        guard: sql<number>`1 / case when exists (
          select 1
          from ${submissions}
          where ${submissions.id} = ${command.submissionId}
            and ${submissions.submissionType} = 'claim'
            and ${submissions.workflowStatus} = 'in_review'
            and ${submissions.updatedAt} = ${command.expectedUpdatedAt}
        ) then 1 else 0 end`,
      });
      const statements: unknown[] = [
        guard,
        database
          .update(submissions)
          .set({ updatedAt: command.preparedAt })
          .where(eq(submissions.id, command.submissionId)),
        database.insert(submissionEvents).values({
          id: command.eventId,
          submissionId: command.submissionId,
          fromStatus: null,
          toStatus: 'in_review',
          action: 'claim_verification_request_prepared',
          reasonCode: command.method,
          actorId: command.actorId,
          actorType: 'reviewer',
          internalNote: command.internalNote,
          createdAt: command.preparedAt,
        }),
      ];

      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new SubmissionPersistenceError(
            'conflict',
            'Business Claim verification preparation conflicted with current private state and was rolled back.',
            { cause: error },
          );
        }
        throw error;
      }
    },
  };
}
