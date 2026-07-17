import { and, asc, eq, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  candidatePromotionDecisions,
  submissionApplicationEvents,
  submissionApplications,
  submissionEvents,
  submissions,
} from '../../db/schema';
import { parseSuggestAcceptedCandidateEventPayload } from '../../submissions/accepted-candidate-contract';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type {
  SubmissionApplicationReceiptReference,
  SubmissionApplicationRegistrationBackend,
  SubmissionApplicationRegistrationRecord,
} from './application-registration';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function receipt(
  kind: SubmissionApplicationRegistrationRecord['applicationReceipt'] extends infer T
    ? T extends SubmissionApplicationReceiptReference
      ? T['kind']
      : never
    : never,
  ids: string[],
): SubmissionApplicationReceiptReference | null {
  return kind === null || ids.length === 0 ? null : { kind, ids };
}

function mapRecord(
  row: typeof submissionApplications.$inferSelect,
): SubmissionApplicationRegistrationRecord {
  return {
    registrationRequestId: row.registrationRequestId,
    applicationId: row.id,
    submissionId: row.submissionId,
    submissionType: row.submissionType,
    sourceDecisionKind: row.sourceDecisionKind,
    sourceDecisionEventId: row.sourceDecisionEventId,
    applicationKind: row.applicationKind,
    applicationStatus: row.applicationStatus,
    publicationStatus: row.publicationStatus,
    applicationReceipt: receipt(row.applicationReceiptKind, row.applicationReceiptIds),
    publicationReceipt: receipt(row.publicationReceiptKind, row.publicationReceiptIds),
    actorId: row.actorId,
    requestFingerprint: row.requestFingerprint,
    registeredAt: row.registeredAt.toISOString(),
  };
}

async function readOneApplication(
  database: CryptoPayMapDatabase,
  where: ReturnType<typeof eq>,
): Promise<SubmissionApplicationRegistrationRecord | null> {
  const rows = await database.select().from(submissionApplications).where(where).limit(1);
  const row = rows[0];
  return row === undefined ? null : mapRecord(row);
}

export function createDrizzleSubmissionApplicationRegistrationBackend(
  database: CryptoPayMapDatabase,
): SubmissionApplicationRegistrationBackend {
  return {
    async readRegistration(requestId) {
      return readOneApplication(
        database,
        eq(submissionApplications.registrationRequestId, requestId),
      );
    },

    async readApplicationBySubmission(submissionId) {
      return readOneApplication(database, eq(submissionApplications.submissionId, submissionId));
    },

    async readState(submissionId, sourceDecisionEventId) {
      const rows = await database
        .select({
          submissionId: submissions.id,
          submissionType: submissions.submissionType,
          workflowStatus: submissions.workflowStatus,
          resolution: submissions.resolution,
          updatedAt: submissions.updatedAt,
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
            eq(submissionEvents.id, sourceDecisionEventId),
            eq(submissionEvents.submissionId, submissions.id),
          ),
        )
        .where(eq(submissions.id, submissionId))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;

      let candidatePromotionDecisionId: string | null = null;
      if (row.eventAction === 'submission_accepted_as_candidate') {
        const payload = parseSuggestAcceptedCandidateEventPayload(row.eventInternalNote);
        if (payload === null) {
          throw new Error('Suggest Candidate decision event payload is invalid.');
        }
        const promotionRows = await database
          .select({ id: candidatePromotionDecisions.id })
          .from(candidatePromotionDecisions)
          .where(eq(candidatePromotionDecisions.candidateId, payload.candidateId))
          .limit(1);
        candidatePromotionDecisionId = promotionRows[0]?.id ?? null;
      }

      const applicationEventRows = await database
        .select({ id: submissionEvents.id })
        .from(submissionEvents)
        .where(
          and(
            eq(submissionEvents.submissionId, submissionId),
            eq(submissionEvents.action, 'business_claim_fields_applied'),
          ),
        )
        .orderBy(asc(submissionEvents.createdAt), asc(submissionEvents.id))
        .limit(2);
      if (applicationEventRows.length > 1) {
        throw new Error('Business Claim Submission contains multiple field-application events.');
      }

      return {
        submissionId: row.submissionId,
        submissionType: row.submissionType,
        workflowStatus: row.workflowStatus,
        resolution: row.resolution,
        updatedAt: row.updatedAt.toISOString(),
        sourceDecisionEvent:
          row.eventId === null ||
          row.eventSubmissionId === null ||
          row.eventToStatus === null ||
          row.eventAction === null ||
          row.eventCreatedAt === null
            ? null
            : {
                eventId: row.eventId,
                submissionId: row.eventSubmissionId,
                toStatus: row.eventToStatus,
                action: row.eventAction,
                createdAt: row.eventCreatedAt.toISOString(),
              },
        candidatePromotionDecisionId,
        businessClaimFieldApplicationEventId: applicationEventRows[0]?.id ?? null,
      };
    },

    async commitRegistration(command) {
      const lock = database.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${command.submissionId}, 0))`,
      );
      const guard = database.select({
        guard: sql<number>`1 / case when
          exists (
            select 1 from ${submissions}
            where ${submissions.id} = ${command.submissionId}
              and ${submissions.submissionType} = ${command.submissionType}
              and ${submissions.workflowStatus} = 'resolved'
              and ${submissions.updatedAt} = ${command.expectedSubmissionUpdatedAt}
          )
          and exists (
            select 1 from ${submissionEvents}
            where ${submissionEvents.id} = ${command.sourceDecisionEventId}
              and ${submissionEvents.submissionId} = ${command.submissionId}
              and ${submissionEvents.toStatus} = 'resolved'
          )
          and not exists (
            select 1 from ${submissionApplications}
            where ${submissionApplications.submissionId} = ${command.submissionId}
               or ${submissionApplications.registrationRequestId} = ${command.registrationRequestId}
               or ${submissionApplications.sourceDecisionEventId} = ${command.sourceDecisionEventId}
          )
          then 1 else 0 end`,
      });
      const statements: unknown[] = [
        lock,
        guard,
        database.insert(submissionApplications).values({
          id: command.applicationId,
          registrationRequestId: command.registrationRequestId,
          submissionId: command.submissionId,
          submissionType: command.submissionType,
          sourceDecisionKind: command.sourceDecisionKind,
          sourceDecisionEventId: command.sourceDecisionEventId,
          applicationKind: command.applicationKind,
          applicationStatus: command.applicationStatus,
          publicationStatus: command.publicationStatus,
          applicationReceiptKind: command.applicationReceipt?.kind ?? null,
          applicationReceiptIds: command.applicationReceipt?.ids ?? [],
          publicationReceiptKind: command.publicationReceipt?.kind ?? null,
          publicationReceiptIds: command.publicationReceipt?.ids ?? [],
          expectedSubmissionUpdatedAt: command.expectedSubmissionUpdatedAt,
          actorId: command.actorId,
          actorType: command.actorType,
          requestFingerprint: command.requestFingerprint,
          registeredAt: command.registeredAt,
          updatedAt: command.registeredAt,
        }),
        database.insert(submissionApplicationEvents).values({
          id: command.registrationRequestId,
          applicationId: command.applicationId,
          action: 'registered',
          fromApplicationStatus: null,
          toApplicationStatus: command.applicationStatus,
          fromPublicationStatus: null,
          toPublicationStatus: command.publicationStatus,
          sourceDecisionEventId: command.sourceDecisionEventId,
          actorId: command.actorId,
          actorType: command.actorType,
          requestFingerprint: command.requestFingerprint,
          createdAt: command.registeredAt,
        }),
      ];

      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new SubmissionPersistenceError(
            'conflict',
            'Submission application registration conflicted with current state.',
            { cause: error },
          );
        }
        throw error;
      }
    },
  };
}
