import { and, asc, eq, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  submissionApplicationEvents,
  submissionApplications,
} from '../../db/schema';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type { SubmissionApplicationReceiptReference } from './application-registration';
import type {
  SubmissionApplicationLifecycleBackend,
  SubmissionApplicationLifecycleRecord,
  SubmissionApplicationTransitionReplayRecord,
} from './application-lifecycle';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function receipt(
  kind: SubmissionApplicationReceiptReference['kind'] | null,
  ids: string[],
): SubmissionApplicationReceiptReference | null {
  return kind === null || ids.length === 0 ? null : { kind, ids };
}

export function createDrizzleSubmissionApplicationLifecycleBackend(
  database: CryptoPayMapDatabase,
): SubmissionApplicationLifecycleBackend {
  return {
    async readApplication(applicationId) {
      const rows = await database
        .select()
        .from(submissionApplications)
        .where(eq(submissionApplications.id, applicationId))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;

      const eventRows = await database
        .select({
          eventId: submissionApplicationEvents.id,
          action: submissionApplicationEvents.action,
          fromApplicationStatus: submissionApplicationEvents.fromApplicationStatus,
          toApplicationStatus: submissionApplicationEvents.toApplicationStatus,
          fromPublicationStatus: submissionApplicationEvents.fromPublicationStatus,
          toPublicationStatus: submissionApplicationEvents.toPublicationStatus,
          createdAt: submissionApplicationEvents.createdAt,
        })
        .from(submissionApplicationEvents)
        .where(eq(submissionApplicationEvents.applicationId, applicationId))
        .orderBy(asc(submissionApplicationEvents.createdAt), asc(submissionApplicationEvents.id))
        .limit(51);
      if (eventRows.length > 50) {
        throw new Error('Submission application lifecycle exceeds the bounded event history.');
      }

      return {
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
        registeredAt: row.registeredAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        events: eventRows.map((event) => ({
          eventId: event.eventId,
          action: event.action,
          fromApplicationStatus: event.fromApplicationStatus,
          toApplicationStatus: event.toApplicationStatus,
          fromPublicationStatus: event.fromPublicationStatus,
          toPublicationStatus: event.toPublicationStatus,
          createdAt: event.createdAt.toISOString(),
        })),
      } satisfies SubmissionApplicationLifecycleRecord;
    },

    async readTransition(requestId) {
      const rows = await database
        .select({
          transitionEventId: submissionApplicationEvents.id,
          applicationId: submissionApplicationEvents.applicationId,
          action: submissionApplicationEvents.action,
          fromApplicationStatus: submissionApplicationEvents.fromApplicationStatus,
          toApplicationStatus: submissionApplicationEvents.toApplicationStatus,
          fromPublicationStatus: submissionApplicationEvents.fromPublicationStatus,
          toPublicationStatus: submissionApplicationEvents.toPublicationStatus,
          actorId: submissionApplicationEvents.actorId,
          requestFingerprint: submissionApplicationEvents.requestFingerprint,
          changedAt: submissionApplicationEvents.createdAt,
        })
        .from(submissionApplicationEvents)
        .where(eq(submissionApplicationEvents.id, requestId))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      return {
        transitionEventId: row.transitionEventId,
        applicationId: row.applicationId,
        action: row.action,
        fromApplicationStatus: row.fromApplicationStatus,
        toApplicationStatus: row.toApplicationStatus,
        fromPublicationStatus: row.fromPublicationStatus,
        toPublicationStatus: row.toPublicationStatus,
        actorId: row.actorId,
        requestFingerprint: row.requestFingerprint,
        changedAt: row.changedAt.toISOString(),
      } satisfies SubmissionApplicationTransitionReplayRecord;
    },

    async commitTransition(command) {
      const lock = database.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${command.applicationId}, 0))`,
      );
      const guard = database.select({
        guard: sql<number>`1 / case when
          exists (
            select 1 from ${submissionApplications}
            where ${submissionApplications.id} = ${command.applicationId}
              and ${submissionApplications.sourceDecisionEventId} = ${command.sourceDecisionEventId}
              and ${submissionApplications.applicationStatus} = ${command.fromApplicationStatus}
              and ${submissionApplications.publicationStatus} = ${command.fromPublicationStatus}
              and ${submissionApplications.updatedAt} = ${command.expectedUpdatedAt}
          )
          and not exists (
            select 1 from ${submissionApplicationEvents}
            where ${submissionApplicationEvents.id} = ${command.transitionEventId}
          )
          then 1 else 0 end`,
      });
      const update = database
        .update(submissionApplications)
        .set({
          applicationStatus: command.toApplicationStatus,
          publicationStatus: command.toPublicationStatus,
          applicationReceiptKind: command.nextApplicationReceipt?.kind ?? null,
          applicationReceiptIds: command.nextApplicationReceipt?.ids ?? [],
          publicationReceiptKind: command.nextPublicationReceipt?.kind ?? null,
          publicationReceiptIds: command.nextPublicationReceipt?.ids ?? [],
          updatedAt: command.changedAt,
        })
        .where(
          and(
            eq(submissionApplications.id, command.applicationId),
            eq(submissionApplications.sourceDecisionEventId, command.sourceDecisionEventId),
            eq(submissionApplications.applicationStatus, command.fromApplicationStatus),
            eq(submissionApplications.publicationStatus, command.fromPublicationStatus),
            eq(submissionApplications.updatedAt, command.expectedUpdatedAt),
          ),
        );
      const event = database.insert(submissionApplicationEvents).values({
        id: command.transitionEventId,
        applicationId: command.applicationId,
        action: command.action,
        fromApplicationStatus: command.fromApplicationStatus,
        toApplicationStatus: command.toApplicationStatus,
        fromPublicationStatus: command.fromPublicationStatus,
        toPublicationStatus: command.toPublicationStatus,
        sourceDecisionEventId: command.sourceDecisionEventId,
        actorId: command.actorId,
        actorType: command.actorType,
        requestFingerprint: command.requestFingerprint,
        createdAt: command.changedAt,
      });

      try {
        await database.batch([lock, guard, update, event] as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new SubmissionPersistenceError(
            'conflict',
            'Submission application lifecycle transition conflicted with current state.',
            { cause: error },
          );
        }
        throw error;
      }
    },
  };
}
