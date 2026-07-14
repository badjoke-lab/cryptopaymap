import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../db/client';
import {
  submissionContacts,
  submissionEvents,
  submissionPayloads,
  submissionPublicReferenceCounters,
  submissions,
  quarantineUploadReservations,
} from '../db/schema';
import { formatSubmissionPublicId } from './contract';
import { parseSubmissionHoldEventPayload } from './hold-contract';
import { parseSubmissionInformationRequestEventPayload } from './information-request-contract';
import { SubmissionPersistenceError, type SubmissionPersistenceBackend } from './persistence';
import { assertSubmissionWorkflowTransition } from './workflow';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function createDrizzleSubmissionPersistenceBackend(
  database: CryptoPayMapDatabase,
): SubmissionPersistenceBackend {
  return {
    async allocatePublicReference(year, at) {
      if (!Number.isInteger(year) || year < 2000 || year > 9999) {
        throw new SubmissionPersistenceError(
          'reference_exhausted',
          'Submission public reference year is invalid.',
        );
      }

      try {
        const rows = await database
          .insert(submissionPublicReferenceCounters)
          .values({ year, nextSequence: 2, updatedAt: at })
          .onConflictDoUpdate({
            target: submissionPublicReferenceCounters.year,
            set: {
              nextSequence: sql`${submissionPublicReferenceCounters.nextSequence} + 1`,
              updatedAt: at,
            },
          })
          .returning({
            allocatedSequence: sql<number>`${submissionPublicReferenceCounters.nextSequence} - 1`,
          });
        const sequence = rows[0]?.allocatedSequence;
        if (sequence === undefined) {
          throw new SubmissionPersistenceError(
            'reference_exhausted',
            'Submission public reference allocation returned no sequence.',
          );
        }
        return formatSubmissionPublicId(year, sequence);
      } catch (error) {
        if (error instanceof SubmissionPersistenceError) throw error;
        if (postgresErrorCode(error) === '23514') {
          throw new SubmissionPersistenceError(
            'reference_exhausted',
            `Submission public references for ${year} are exhausted.`,
            { cause: error },
          );
        }
        throw error;
      }
    },

    async readByIntakeRequestId(requestId) {
      const rows = await database
        .select({
          submissionId: submissions.id,
          publicId: submissions.publicId,
          requestFingerprint: submissions.requestFingerprint,
          workflowStatus: submissions.workflowStatus,
          statusTokenHash: submissions.statusTokenHash,
          submittedAt: submissions.submittedAt,
        })
        .from(submissions)
        .where(eq(submissions.intakeRequestId, requestId))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      return {
        submissionId: row.submissionId,
        publicId: row.publicId,
        requestFingerprint: row.requestFingerprint,
        workflowStatus: row.workflowStatus,
        statusTokenHash: row.statusTokenHash,
        submittedAt: row.submittedAt.toISOString(),
      };
    },

    async readPrivateStatusByPublicId(publicId) {
      const rows = await database
        .select({
          submissionId: submissions.id,
          publicId: submissions.publicId,
          workflowStatus: submissions.workflowStatus,
          resolution: submissions.resolution,
          statusTokenHash: submissions.statusTokenHash,
        })
        .from(submissions)
        .where(eq(submissions.publicId, publicId))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;

      let requestedAction: string | null = null;
      let publicMessage: string | null = null;
      let nextReviewAt: string | null = null;

      if (row.workflowStatus === 'needs_information') {
        const eventRows = await database
          .select({ internalNote: submissionEvents.internalNote })
          .from(submissionEvents)
          .where(
            and(
              eq(submissionEvents.submissionId, row.submissionId),
              eq(submissionEvents.action, 'submission_information_requested'),
            ),
          )
          .orderBy(desc(submissionEvents.createdAt), desc(submissionEvents.id))
          .limit(1);
        const payload = parseSubmissionInformationRequestEventPayload(
          eventRows[0]?.internalNote ?? null,
        );
        if (payload !== null) {
          requestedAction = payload.requestedAction;
          publicMessage = payload.publicMessage;
        }
      }

      if (row.workflowStatus === 'on_hold') {
        const eventRows = await database
          .select({ internalNote: submissionEvents.internalNote })
          .from(submissionEvents)
          .where(
            and(
              eq(submissionEvents.submissionId, row.submissionId),
              eq(submissionEvents.action, 'submission_hold_started'),
            ),
          )
          .orderBy(desc(submissionEvents.createdAt), desc(submissionEvents.id))
          .limit(1);
        const payload = parseSubmissionHoldEventPayload(eventRows[0]?.internalNote ?? null);
        if (payload !== null) {
          requestedAction = payload.requiredAction;
          publicMessage = payload.publicMessage;
          nextReviewAt = payload.nextReviewAt;
        }
      }

      return {
        publicId: row.publicId,
        workflowStatus: row.workflowStatus,
        resolution: row.resolution,
        statusTokenHash: row.statusTokenHash,
        requestedAction,
        publicMessage,
        nextReviewAt,
      };
    },

    async createSubmission(command) {
      const statements: unknown[] = [
        database.insert(submissions).values({
          id: command.id,
          intakeRequestId: command.intakeRequestId,
          requestFingerprint: command.requestFingerprint,
          publicId: command.publicId,
          submissionType: command.submissionType,
          targetType: command.targetType,
          targetId: command.targetId,
          relationship: command.relationship,
          workflowStatus: 'received',
          resolution: null,
          priority: 0,
          statusTokenHash: command.statusTokenHash,
          submittedAt: command.submittedAt,
          updatedAt: command.submittedAt,
          resolvedAt: null,
          withdrawnAt: null,
        }),
        database.insert(submissionPayloads).values({
          submissionId: command.id,
          originalPayload: command.originalPayload,
          normalizedPayload: command.normalizedPayload ?? null,
          proposedChanges: null,
          updatedAt: command.submittedAt,
        }),
      ];

      if (command.contact !== null) {
        statements.push(
          database.insert(submissionContacts).values({
            submissionId: command.id,
            encryptedEmail: command.contact.encryptedEmail,
            emailHash: command.contact.emailHash,
            contactAllowed: command.contact.contactAllowed,
            retentionUntil: command.contact.retentionUntil,
            updatedAt: command.submittedAt,
          }),
        );
      }

      statements.push(
        database.insert(submissionEvents).values({
          id: crypto.randomUUID(),
          submissionId: command.id,
          fromStatus: null,
          toStatus: 'received',
          action: 'submission_received',
          reasonCode: null,
          actorId: command.actorId,
          actorType: command.actorType,
          internalNote: null,
          createdAt: command.submittedAt,
        }),
      );

      if (command.quarantineUploadIds !== undefined) {
        const reservationIds = command.quarantineUploadIds;
        statements.push(
          database.execute(sql`
            with consumed as (
              update ${quarantineUploadReservations}
              set
                ${quarantineUploadReservations.consumedBySubmissionId} = ${command.id},
                ${quarantineUploadReservations.consumedAt} = ${command.submittedAt}
              where ${inArray(quarantineUploadReservations.id, reservationIds)}
                and ${quarantineUploadReservations.intakeRequestId} = ${command.intakeRequestId}
                and ${quarantineUploadReservations.purpose} = 'public_gallery_candidate'
                and ${quarantineUploadReservations.expiresAt} > ${command.submittedAt}
                and ${quarantineUploadReservations.consumedBySubmissionId} is null
                and ${quarantineUploadReservations.consumedAt} is null
              returning ${quarantineUploadReservations.id}
            )
            select 1 / case when count(*) = ${reservationIds.length} then 1 else 0 end
            from consumed
          `),
        );
      }

      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code !== null && ['23503', '23505', '23514'].includes(code)) {
          throw new SubmissionPersistenceError(
            'conflict',
            `Submission persistence conflicted with current private state (${code}).`,
            { cause: error },
          );
        }
        throw error;
      }

      return {
        submissionId: command.id,
        publicId: command.publicId,
        workflowStatus: 'received',
        submittedAt: command.submittedAt.toISOString(),
      };
    },

    async transitionSubmission(command) {
      assertSubmissionWorkflowTransition({
        fromStatus: command.expectedStatus,
        toStatus: command.toStatus,
        resolution: command.resolution,
      });

      const guard = database.select({
        guard: sql<number>`1 / case when exists (
          select 1
          from ${submissions}
          where ${submissions.id} = ${command.submissionId}
            and ${submissions.workflowStatus} = ${command.expectedStatus}
            and ${submissions.updatedAt} = ${command.expectedUpdatedAt}
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
            resolvedAt: command.toStatus === 'resolved' ? command.changedAt : null,
            withdrawnAt: command.toStatus === 'withdrawn' ? command.changedAt : null,
          })
          .where(eq(submissions.id, command.submissionId)),
        database.insert(submissionEvents).values({
          id: command.eventId ?? crypto.randomUUID(),
          submissionId: command.submissionId,
          fromStatus: command.expectedStatus,
          toStatus: command.toStatus,
          action: command.action,
          reasonCode: command.reasonCode,
          actorId: command.actorId,
          actorType: command.actorType,
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
            'Submission workflow transition conflicted with current private state and was rolled back.',
            { cause: error },
          );
        }
        throw error;
      }

      return {
        submissionId: command.submissionId,
        fromStatus: command.expectedStatus,
        toStatus: command.toStatus,
        resolution: command.resolution,
        changedAt: command.changedAt.toISOString(),
      };
    },
  };
}
