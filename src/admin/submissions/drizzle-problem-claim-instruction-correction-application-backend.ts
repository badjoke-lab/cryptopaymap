import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  provenanceLinks,
  sourceRecords,
  sources,
  submissionEvents,
  submissionPayloads,
  submissions,
  verificationEvents,
} from '../../db/schema';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import { createDrizzleSubmissionApplicationLifecycleBackend } from './drizzle-application-lifecycle-backend';
import {
  type ProblemClaimInstructionCorrectionApplicationBackend,
  type ProblemClaimInstructionCorrectionApplicationState,
  type ProblemClaimInstructionCorrectionCommitCommand,
  type ProblemClaimInstructionCorrectionCommitReceipt,
  ProblemClaimInstructionCorrectionApplicationError,
  parseProblemClaimInstructionCorrectionEvent,
  problemClaimInstructionCorrectionEventPayloadSchema,
} from './problem-claim-instruction-correction-application';

 type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

async function readCorrectionEvent(
  database: CryptoPayMapDatabase,
  requestId: string,
): Promise<ProblemClaimInstructionCorrectionApplicationState['correctionEvent']> {
  const rows = await database
    .select({
      eventId: submissionEvents.id,
      submissionId: submissionEvents.submissionId,
      toStatus: submissionEvents.toStatus,
      action: submissionEvents.action,
      reasonCode: submissionEvents.reasonCode,
      actorId: submissionEvents.actorId,
      internalNote: submissionEvents.internalNote,
      createdAt: submissionEvents.createdAt,
    })
    .from(submissionEvents)
    .where(eq(submissionEvents.id, requestId))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : { ...row, createdAt: row.createdAt.toISOString() };
}

function replayReceipt(
  event: NonNullable<ProblemClaimInstructionCorrectionApplicationState['correctionEvent']>,
  command: ProblemClaimInstructionCorrectionCommitCommand,
): ProblemClaimInstructionCorrectionCommitReceipt {
  const payload = parseProblemClaimInstructionCorrectionEvent(event.internalNote);
  if (
    event.submissionId !== command.submissionId ||
    event.toStatus !== 'resolved' ||
    event.action !== 'problem_claim_instructions_applied' ||
    event.reasonCode !== 'problem_report_instruction_correction' ||
    event.actorId !== command.actorId ||
    payload === null ||
    payload.requestFingerprint !== command.requestFingerprint ||
    payload.applicationId !== command.applicationId ||
    payload.sourceDecisionEventId !== command.sourceDecisionEventId ||
    payload.claimId !== command.claimId ||
    payload.sourceRecordId !== command.sourceRecord.id ||
    payload.verificationEventId !== command.verificationEventId ||
    payload.expectedClaimUpdatedAt !== command.expectedClaimUpdatedAt.toISOString() ||
    payload.beforeHowToPay !== command.beforeHowToPay ||
    payload.afterHowToPay !== command.afterHowToPay
  ) {
    throw new ProblemClaimInstructionCorrectionApplicationError(
      'idempotency_conflict',
      'The Claim instruction correction UUID was already used for different content.',
    );
  }
  return {
    state: 'replayed',
    correctionEventId: event.eventId,
    claimId: payload.claimId,
    sourceRecordId: payload.sourceRecordId,
    verificationEventId: payload.verificationEventId,
    appliedAt: event.createdAt,
  };
}

export function createDrizzleProblemClaimInstructionCorrectionApplicationBackend(
  database: CryptoPayMapDatabase,
): ProblemClaimInstructionCorrectionApplicationBackend {
  const lifecycle = createDrizzleSubmissionApplicationLifecycleBackend(database);
  return {
    ...lifecycle,

    async readApplicationState(applicationId, correctionEventId) {
      const application = await lifecycle.readApplication(applicationId);
      if (application === null) return null;

      const submissionRows = await database
        .select({
          submissionId: submissions.id,
          publicId: submissions.publicId,
          submissionType: submissions.submissionType,
          targetType: submissions.targetType,
          targetId: submissions.targetId,
          workflowStatus: submissions.workflowStatus,
          resolution: submissions.resolution,
          normalizedPayload: submissionPayloads.normalizedPayload,
          eventId: submissionEvents.id,
          eventSubmissionId: submissionEvents.submissionId,
          eventToStatus: submissionEvents.toStatus,
          eventAction: submissionEvents.action,
          eventInternalNote: submissionEvents.internalNote,
          eventCreatedAt: submissionEvents.createdAt,
        })
        .from(submissions)
        .innerJoin(submissionPayloads, eq(submissionPayloads.submissionId, submissions.id))
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

      const claimRows =
        submission.targetId === null
          ? []
          : await database
              .select({
                claimId: acceptanceClaims.id,
                claimStatus: acceptanceClaims.claimStatus,
                visibility: acceptanceClaims.visibility,
                howToPay: acceptanceClaims.howToPay,
                updatedAt: acceptanceClaims.updatedAt,
                deletedAt: acceptanceClaims.deletedAt,
              })
              .from(acceptanceClaims)
              .where(eq(acceptanceClaims.id, submission.targetId))
              .limit(1);
      const claim = claimRows[0];
      const correctionEvent = await readCorrectionEvent(database, correctionEventId);

      return {
        application,
        submission: {
          submissionId: submission.submissionId,
          publicId: submission.publicId,
          submissionType: submission.submissionType,
          targetType: submission.targetType,
          targetId: submission.targetId,
          workflowStatus: submission.workflowStatus,
          resolution: submission.resolution,
          normalizedPayload: submission.normalizedPayload,
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
        claim:
          claim === undefined
            ? null
            : {
                claimId: claim.claimId,
                claimStatus: claim.claimStatus,
                visibility: claim.visibility,
                howToPay: claim.howToPay,
                updatedAt: claim.updatedAt.toISOString(),
                deletedAt: claim.deletedAt?.toISOString() ?? null,
              },
        correctionEvent,
      } satisfies ProblemClaimInstructionCorrectionApplicationState;
    },

    async commitClaimInstructionCorrection(command) {
      const existing = await readCorrectionEvent(database, command.requestId);
      if (existing !== null) return replayReceipt(existing, command);

      const eventPayload = problemClaimInstructionCorrectionEventPayloadSchema.parse({
        schemaVersion: 'problem-claim-instruction-correction-event-v1',
        requestFingerprint: command.requestFingerprint,
        applicationId: command.applicationId,
        sourceDecisionEventId: command.sourceDecisionEventId,
        claimId: command.claimId,
        sourceRecordId: command.sourceRecord.id,
        verificationEventId: command.verificationEventId,
        expectedClaimUpdatedAt: command.expectedClaimUpdatedAt.toISOString(),
        beforeHowToPay: command.beforeHowToPay,
        afterHowToPay: command.afterHowToPay,
      });
      const statements: unknown[] = [
        database.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${command.claimId}, 0))`,
        ),
        database.select({
          guard: sql<number>`1 / case when exists (
            select 1 from ${sources}
            where ${sources.id} = ${command.sourceRecord.sourceId}
              and ${sources.sourceType} = 'user_submission'
              and ${sources.isActive} = true
          ) then 1 else 0 end`,
        }),
        database.select({
          guard: sql<number>`1 / case when exists (
            select 1 from ${acceptanceClaims}
            where ${acceptanceClaims.id} = ${command.claimId}
              and ${acceptanceClaims.claimStatus} in ('confirmed', 'stale')
              and ${acceptanceClaims.updatedAt} = ${command.expectedClaimUpdatedAt}
              and ${acceptanceClaims.deletedAt} is null
              and ${acceptanceClaims.howToPay} is not distinct from ${command.beforeHowToPay}
            for update
          ) then 1 else 0 end`,
        }),
        database.select({
          guard: sql<number>`1 / case when not exists (
            select 1 from ${submissionEvents}
            where ${submissionEvents.id} = ${command.requestId}
          ) then 1 else 0 end`,
        }),
        database.insert(sourceRecords).values({
          id: command.sourceRecord.id,
          sourceId: command.sourceRecord.sourceId,
          externalId: command.sourceRecord.externalId,
          sourceUrl: null,
          rawPayload: command.sourceRecord.rawPayload,
          observedAt: command.sourceRecord.observedAt,
          publishedAt: null,
          fetchedAt: command.sourceRecord.fetchedAt,
          contentHash: command.sourceRecord.contentHash,
          archiveUrl: null,
          licenseId: null,
        }),
        database
          .update(provenanceLinks)
          .set({ effectiveTo: command.appliedAt })
          .where(
            and(
              eq(provenanceLinks.subjectType, 'acceptance_claim'),
              eq(provenanceLinks.subjectId, command.claimId),
              eq(provenanceLinks.fieldPath, 'howToPay'),
              isNull(provenanceLinks.effectiveTo),
              ne(provenanceLinks.provenanceRole, 'correction'),
            ),
          ),
        database
          .delete(provenanceLinks)
          .where(
            and(
              eq(provenanceLinks.subjectType, 'acceptance_claim'),
              eq(provenanceLinks.subjectId, command.claimId),
              eq(provenanceLinks.fieldPath, 'howToPay'),
              eq(provenanceLinks.provenanceRole, 'correction'),
            ),
          ),
        database.insert(provenanceLinks).values({
          subjectType: 'acceptance_claim',
          subjectId: command.claimId,
          fieldPath: 'howToPay',
          sourceRecordId: command.sourceRecord.id,
          licenseId: null,
          provenanceRole: 'correction',
          effectiveFrom: command.appliedAt,
          effectiveTo: null,
        }),
        database
          .update(acceptanceClaims)
          .set({ howToPay: command.afterHowToPay, updatedAt: command.appliedAt })
          .where(eq(acceptanceClaims.id, command.claimId)),
        database.insert(verificationEvents).values({
          id: command.verificationEventId,
          claimId: command.claimId,
          eventType: 'corrected',
          fromStatus: null,
          toStatus: null,
          fromVisibility: null,
          toVisibility: null,
          reasonCode: 'problem_report_instruction_correction',
          effectiveAt: command.appliedAt,
          publicSummary: command.publicSummary,
          internalNote: command.internalNote,
          actorType: 'system',
          actorId: null,
        }),
        database.insert(submissionEvents).values({
          id: command.requestId,
          submissionId: command.submissionId,
          fromStatus: null,
          toStatus: 'resolved',
          action: 'problem_claim_instructions_applied',
          reasonCode: 'problem_report_instruction_correction',
          actorId: command.actorId,
          actorType: command.actorType === 'human' ? 'reviewer' : 'system',
          internalNote: JSON.stringify(eventPayload),
          createdAt: command.appliedAt,
        }),
      ];

      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code === '23505') {
          const raced = await readCorrectionEvent(database, command.requestId);
          if (raced !== null) return replayReceipt(raced, command);
        }
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new SubmissionPersistenceError(
            'conflict',
            'The Claim instruction correction conflicted with current private state and was rolled back.',
            { cause: error },
          );
        }
        throw error;
      }

      return {
        state: 'committed',
        correctionEventId: command.requestId,
        claimId: command.claimId,
        sourceRecordId: command.sourceRecord.id,
        verificationEventId: command.verificationEventId,
        appliedAt: command.appliedAt.toISOString(),
      } satisfies ProblemClaimInstructionCorrectionCommitReceipt;
    },
  };
}
