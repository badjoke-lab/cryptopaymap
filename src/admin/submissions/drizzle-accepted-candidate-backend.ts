import { and, eq, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  candidateSourceRecords,
  sourceCandidates,
  sourceRecords,
  sources,
  submissionEvents,
  submissionPayloads,
  submissions,
} from '../../db/schema';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type { SuggestAcceptedCandidateBackend } from './accepted-candidate';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function createDrizzleSuggestAcceptedCandidateBackend(
  database: CryptoPayMapDatabase,
): SuggestAcceptedCandidateBackend {
  return {
    async readState(submissionId) {
      const rows = await database
        .select({
          submissionId: submissions.id,
          publicId: submissions.publicId,
          submissionType: submissions.submissionType,
          workflowStatus: submissions.workflowStatus,
          updatedAt: submissions.updatedAt,
          priority: submissions.priority,
          normalizedPayload: submissionPayloads.normalizedPayload,
          payloadUpdatedAt: submissionPayloads.updatedAt,
        })
        .from(submissions)
        .innerJoin(submissionPayloads, eq(submissionPayloads.submissionId, submissions.id))
        .where(eq(submissions.id, submissionId))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      return {
        submissionId: row.submissionId,
        publicId: row.publicId,
        submissionType: row.submissionType,
        workflowStatus: row.workflowStatus,
        updatedAt: row.updatedAt.toISOString(),
        priority: row.priority,
        normalizedPayload: row.normalizedPayload,
        payloadUpdatedAt: row.payloadUpdatedAt.toISOString(),
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

    async commitAcceptedCandidate(command) {
      const sourceGuard = database.select({
        guard: sql<number>`1 / case when exists (
          select 1
          from ${sources}
          where ${sources.id} = ${command.sourceId}
            and ${sources.sourceType} = 'user_submission'
            and ${sources.isActive} = true
        ) then 1 else 0 end`,
      });
      const stateGuard = database.select({
        guard: sql<number>`1 / case when exists (
          select 1
          from ${submissions}
          inner join ${submissionPayloads}
            on ${submissionPayloads.submissionId} = ${submissions.id}
          where ${submissions.id} = ${command.submissionId}
            and ${submissions.submissionType} = 'suggest'
            and ${submissions.workflowStatus} = 'in_review'
            and ${submissions.updatedAt} = ${command.expectedUpdatedAt}
            and ${submissionPayloads.updatedAt} = ${command.expectedPayloadUpdatedAt}
        ) then 1 else 0 end`,
      });

      const statements: unknown[] = [
        sourceGuard,
        stateGuard,
        database.insert(sourceRecords).values({
          id: command.sourceRecordId,
          sourceId: command.sourceId,
          externalId: command.publicId,
          sourceUrl: null,
          rawPayload: command.normalizedPayload,
          observedAt: command.observedAt,
          publishedAt: null,
          fetchedAt: command.decidedAt,
          contentHash: command.contentHash,
          archiveUrl: null,
          licenseId: null,
        }),
        database.insert(sourceCandidates).values({
          id: command.candidateId,
          candidateType: command.candidateType,
          normalizedName: command.normalizedName,
          candidateStatus: 'new',
          priority: command.priority,
          duplicateGroupId: null,
          firstSeenAt: command.observedAt,
          lastSeenAt: command.observedAt,
          importBatchId: null,
          canonicalEntityId: null,
          canonicalLocationId: null,
          createdAt: command.decidedAt,
          updatedAt: command.decidedAt,
        }),
        database.insert(candidateSourceRecords).values({
          candidateId: command.candidateId,
          sourceRecordId: command.sourceRecordId,
          relationship: 'origin',
          createdAt: command.decidedAt,
        }),
        database
          .update(submissions)
          .set({
            workflowStatus: 'resolved',
            resolution: 'accepted_as_candidate',
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
          action: 'submission_accepted_as_candidate',
          reasonCode: command.reasonCode,
          actorId: command.actorId,
          actorType: command.actorType === 'human' ? 'reviewer' : 'system',
          internalNote: command.internalNote,
          createdAt: command.decidedAt,
        }),
      ];

      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new SubmissionPersistenceError(
            'conflict',
            'Accepted-as-Candidate transaction conflicted with current private state and was rolled back.',
            { cause: error },
          );
        }
        throw error;
      }
    },
  };
}
