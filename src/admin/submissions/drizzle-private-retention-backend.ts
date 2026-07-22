import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  notExists,
  or,
  sql,
} from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  evidence,
  mediaAssets,
  quarantineUploadReservations,
  submissionApplications,
  submissionContacts,
  submissionPayloads,
  submissionRetentionItems,
  submissionRetentionRuns,
  submissions,
} from '../../db/schema';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import {
  PRIVATE_RETENTION_DAYS,
  PrivateRetentionError,
  privateRetentionRunReceiptSchema,
  type ApplyPrivateRetentionCandidateCommand,
  type CompletePrivateMediaRetentionCommand,
  type PrivateRetentionBackend,
  type PrivateRetentionDatabaseCandidate,
  type PrivateRetentionRunRecord,
} from './private-retention-contract';

const MILLISECONDS_PER_DAY = 86_400_000;
const REDACTED_CONTACT = 'redacted:submission-contact:v1';
const REDACTED_PAYLOAD = {
  schemaVersion: 'submission-payload-redacted-v1',
  redacted: true,
} as const;

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function persistenceConflict(error: unknown, message: string): never {
  const code = postgresErrorCode(error);
  if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
    throw new SubmissionPersistenceError('conflict', message, { cause: error });
  }
  throw error;
}

function mapRun(row: typeof submissionRetentionRuns.$inferSelect): PrivateRetentionRunRecord {
  return {
    runId: row.id,
    effectiveAt: row.effectiveAt.toISOString(),
    actorId: row.actorId,
    requestFingerprint: row.requestFingerprint,
    state: row.state,
    receipt: row.receipt,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function readRun(
  database: CryptoPayMapDatabase,
  runId: string,
): Promise<PrivateRetentionRunRecord | null> {
  const rows = await database
    .select()
    .from(submissionRetentionRuns)
    .where(eq(submissionRetentionRuns.id, runId))
    .limit(1);
  return rows[0] === undefined ? null : mapRun(rows[0]);
}

async function itemExists(
  database: CryptoPayMapDatabase,
  policy: CompletePrivateMediaRetentionCommand['policy'],
  referenceType: CompletePrivateMediaRetentionCommand['referenceType'] | 'evidence',
  referenceId: string,
): Promise<boolean> {
  const rows = await database
    .select({ id: submissionRetentionItems.id })
    .from(submissionRetentionItems)
    .where(
      and(
        eq(submissionRetentionItems.policy, policy),
        eq(submissionRetentionItems.referenceType, referenceType),
        eq(submissionRetentionItems.referenceId, referenceId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

function completedItemExclusion(
  database: CryptoPayMapDatabase,
  policy: CompletePrivateMediaRetentionCommand['policy'],
  referenceType: CompletePrivateMediaRetentionCommand['referenceType'] | 'evidence',
  referenceId: Parameters<typeof eq>[1],
) {
  return notExists(
    database
      .select({ value: sql<number>`1` })
      .from(submissionRetentionItems)
      .where(
        and(
          eq(submissionRetentionItems.policy, policy),
          eq(submissionRetentionItems.referenceType, referenceType),
          eq(submissionRetentionItems.referenceId, referenceId),
        ),
      ),
  );
}

function terminalSubmissionCondition() {
  return or(
    inArray(submissions.workflowStatus, ['duplicate', 'rejected_spam', 'withdrawn']),
    eq(submissions.workflowStatus, 'resolved'),
  );
}

function sortCandidates(candidates: PrivateRetentionDatabaseCandidate[]) {
  return candidates.sort((left, right) => {
    const byTime = left.eligibleAt.localeCompare(right.eligibleAt);
    if (byTime !== 0) return byTime;
    const byMaterial = left.material.localeCompare(right.material);
    return byMaterial !== 0 ? byMaterial : left.referenceId.localeCompare(right.referenceId);
  });
}

function applicationGuard(database: CryptoPayMapDatabase) {
  return notExists(
    database
      .select({ value: sql<number>`1` })
      .from(submissionApplications)
      .where(
        and(
          eq(submissionApplications.submissionId, submissions.id),
          inArray(submissionApplications.applicationStatus, ['pending', 'failed']),
        ),
      ),
  );
}

function redactionStatements(
  database: CryptoPayMapDatabase,
  command: ApplyPrivateRetentionCandidateCommand,
) {
  const candidate = command.candidate;
  const itemInsert = database.insert(submissionRetentionItems).values({
    id: command.itemId,
    runId: command.runId,
    material: candidate.material,
    policy: candidate.policy,
    referenceType: candidate.referenceType,
    referenceId: candidate.referenceId,
    submissionId: candidate.submissionId,
    outcome: 'redacted',
    deletedObjectCount: 0,
    missingObjectCount: 0,
    actorId: command.actorId,
    completedAt: command.effectiveAt,
  });

  if (candidate.material === 'contact') {
    return [
      database.select({
        guard: sql<number>`1 / case when
          exists (
            select 1 from ${submissionContacts}
            where ${submissionContacts.submissionId} = ${candidate.submissionId}
              and ${submissionContacts.updatedAt} = ${new Date(candidate.expectedUpdatedAt)}
              and ${submissionContacts.retentionUntil} is not null
              and ${submissionContacts.retentionUntil} <= ${command.effectiveAt}
              and ${submissionContacts.encryptedEmail} <> ${REDACTED_CONTACT}
          )
          and exists (
            select 1 from ${submissionRetentionRuns}
            where ${submissionRetentionRuns.id} = ${command.runId}
              and ${submissionRetentionRuns.state} = 'running'
          )
          and not exists (
            select 1 from ${submissionRetentionItems}
            where ${submissionRetentionItems.policy} = ${candidate.policy}
              and ${submissionRetentionItems.referenceType} = ${candidate.referenceType}
              and ${submissionRetentionItems.referenceId} = ${candidate.referenceId}
          )
          then 1 else 0 end`,
      }),
      database
        .update(submissionContacts)
        .set({
          encryptedEmail: REDACTED_CONTACT,
          contactAllowed: false,
          updatedAt: command.effectiveAt,
        })
        .where(eq(submissionContacts.submissionId, candidate.submissionId)),
      itemInsert,
    ];
  }

  if (candidate.material === 'payload') {
    return [
      database.select({
        guard: sql<number>`1 / case when
          exists (
            select 1 from ${submissionPayloads}
            where ${submissionPayloads.submissionId} = ${candidate.submissionId}
              and ${submissionPayloads.updatedAt} = ${new Date(candidate.expectedUpdatedAt)}
              and ${submissionPayloads.originalPayload} <> ${REDACTED_PAYLOAD}
          )
          and exists (
            select 1 from ${submissions}
            where ${submissions.id} = ${candidate.submissionId}
              and ${terminalSubmissionCondition()}
          )
          and not exists (
            select 1 from ${submissionApplications}
            where ${submissionApplications.submissionId} = ${candidate.submissionId}
              and ${submissionApplications.applicationStatus} in ('pending', 'failed')
          )
          and exists (
            select 1 from ${submissionRetentionRuns}
            where ${submissionRetentionRuns.id} = ${command.runId}
              and ${submissionRetentionRuns.state} = 'running'
          )
          and not exists (
            select 1 from ${submissionRetentionItems}
            where ${submissionRetentionItems.policy} = ${candidate.policy}
              and ${submissionRetentionItems.referenceType} = ${candidate.referenceType}
              and ${submissionRetentionItems.referenceId} = ${candidate.referenceId}
          )
          then 1 else 0 end`,
      }),
      database
        .update(submissionPayloads)
        .set({
          originalPayload: REDACTED_PAYLOAD,
          normalizedPayload: null,
          proposedChanges: null,
          updatedAt: command.effectiveAt,
        })
        .where(eq(submissionPayloads.submissionId, candidate.submissionId)),
      itemInsert,
    ];
  }

  return [
    database.select({
      guard: sql<number>`1 / case when
        exists (
          select 1 from ${evidence}
          where ${evidence.id} = ${candidate.referenceId}
            and ${evidence.submissionId} = ${candidate.submissionId}
            and ${evidence.updatedAt} = ${new Date(candidate.expectedUpdatedAt)}
            and ${evidence.visibility} in ('private', 'restricted')
            and ${evidence.reviewStatus} in ('accepted', 'rejected', 'superseded')
            and (${evidence.sourceUrl} is not null or ${evidence.archiveUrl} is not null or ${evidence.sourceNativeId} is not null)
            and ${evidence.deletedAt} is null
        )
        and exists (
          select 1 from ${submissionRetentionRuns}
          where ${submissionRetentionRuns.id} = ${command.runId}
            and ${submissionRetentionRuns.state} = 'running'
        )
        and not exists (
          select 1 from ${submissionRetentionItems}
          where ${submissionRetentionItems.policy} = ${candidate.policy}
            and ${submissionRetentionItems.referenceType} = ${candidate.referenceType}
            and ${submissionRetentionItems.referenceId} = ${candidate.referenceId}
        )
        then 1 else 0 end`,
    }),
    database
      .update(evidence)
      .set({
        sourceUrl: null,
        archiveUrl: null,
        sourceNativeId: null,
        updatedAt: command.effectiveAt,
      })
      .where(eq(evidence.id, candidate.referenceId)),
    itemInsert,
  ];
}

export function createDrizzlePrivateRetentionBackend(
  database: CryptoPayMapDatabase,
): PrivateRetentionBackend {
  return {
    async beginRun(command) {
      const existing = await readRun(database, command.runId);
      if (existing !== null) {
        if (
          existing.requestFingerprint !== command.requestFingerprint ||
          existing.actorId !== command.actorId ||
          existing.effectiveAt !== command.effectiveAt.toISOString()
        ) {
          throw new PrivateRetentionError(
            'idempotency_conflict',
            'The private retention run ID was reused with different content.',
          );
        }
        if (existing.state === 'running') return { state: 'resumed', receipt: null };
        return {
          state: 'replayed',
          receipt: privateRetentionRunReceiptSchema.parse(existing.receipt),
        };
      }

      try {
        await database.insert(submissionRetentionRuns).values({
          id: command.runId,
          effectiveAt: command.effectiveAt,
          actorId: command.actorId,
          requestFingerprint: command.requestFingerprint,
          state: 'running',
          receipt: null,
          createdAt: command.startedAt,
          updatedAt: command.startedAt,
        });
        return { state: 'started', receipt: null };
      } catch (error) {
        if (postgresErrorCode(error) === '23505') {
          const raced = await readRun(database, command.runId);
          if (
            raced !== null &&
            raced.requestFingerprint === command.requestFingerprint &&
            raced.actorId === command.actorId &&
            raced.effectiveAt === command.effectiveAt.toISOString()
          ) {
            return raced.state === 'running'
              ? { state: 'resumed', receipt: null }
              : {
                  state: 'replayed',
                  receipt: privateRetentionRunReceiptSchema.parse(raced.receipt),
                };
          }
          throw new PrivateRetentionError(
            'idempotency_conflict',
            'The private retention run ID was concurrently used with different content.',
            { cause: error },
          );
        }
        throw error;
      }
    },

    async loadDatabaseCandidates(effectiveAt, limit) {
      const terminalBefore = new Date(
        effectiveAt.getTime() - PRIVATE_RETENTION_DAYS.payload * MILLISECONDS_PER_DAY,
      );
      const evidenceBefore = new Date(
        effectiveAt.getTime() - PRIVATE_RETENTION_DAYS.evidence * MILLISECONDS_PER_DAY,
      );

      const contactRows = await database
        .select({
          submissionId: submissionContacts.submissionId,
          updatedAt: submissionContacts.updatedAt,
          retentionUntil: submissionContacts.retentionUntil,
        })
        .from(submissionContacts)
        .where(
          and(
            isNotNull(submissionContacts.retentionUntil),
            lte(submissionContacts.retentionUntil, effectiveAt),
            ne(submissionContacts.encryptedEmail, REDACTED_CONTACT),
            completedItemExclusion(
              database,
              'contact_retention_expired',
              'submission',
              submissionContacts.submissionId,
            ),
          ),
        )
        .orderBy(asc(submissionContacts.retentionUntil), asc(submissionContacts.submissionId))
        .limit(limit + 1);

      const payloadRows = await database
        .select({
          submissionId: submissionPayloads.submissionId,
          payloadUpdatedAt: submissionPayloads.updatedAt,
          submissionUpdatedAt: submissions.updatedAt,
        })
        .from(submissionPayloads)
        .innerJoin(submissions, eq(submissions.id, submissionPayloads.submissionId))
        .where(
          and(
            terminalSubmissionCondition(),
            lte(submissions.updatedAt, terminalBefore),
            lte(submissionPayloads.updatedAt, terminalBefore),
            sql`${submissionPayloads.originalPayload} <> ${REDACTED_PAYLOAD}`,
            applicationGuard(database),
            completedItemExclusion(
              database,
              'terminal_payload_180d',
              'submission',
              submissionPayloads.submissionId,
            ),
          ),
        )
        .orderBy(asc(submissions.updatedAt), asc(submissionPayloads.submissionId))
        .limit(limit + 1);

      const evidenceRows = await database
        .select({
          evidenceId: evidence.id,
          submissionId: evidence.submissionId,
          updatedAt: evidence.updatedAt,
        })
        .from(evidence)
        .where(
          and(
            isNotNull(evidence.submissionId),
            inArray(evidence.visibility, ['private', 'restricted']),
            inArray(evidence.reviewStatus, ['accepted', 'rejected', 'superseded']),
            lte(evidence.updatedAt, evidenceBefore),
            isNull(evidence.deletedAt),
            or(
              isNotNull(evidence.sourceUrl),
              isNotNull(evidence.archiveUrl),
              isNotNull(evidence.sourceNativeId),
            ),
            completedItemExclusion(database, 'private_evidence_180d', 'evidence', evidence.id),
          ),
        )
        .orderBy(asc(evidence.updatedAt), asc(evidence.id))
        .limit(limit + 1);

      const candidates: PrivateRetentionDatabaseCandidate[] = [];
      for (const row of contactRows.slice(0, limit)) {
        if (row.retentionUntil === null) continue;
        candidates.push({
          material: 'contact',
          policy: 'contact_retention_expired',
          referenceType: 'submission',
          referenceId: row.submissionId,
          submissionId: row.submissionId,
          expectedUpdatedAt: row.updatedAt.toISOString(),
          eligibleAt: row.retentionUntil.toISOString(),
        });
      }
      for (const row of payloadRows.slice(0, limit)) {
        candidates.push({
          material: 'payload',
          policy: 'terminal_payload_180d',
          referenceType: 'submission',
          referenceId: row.submissionId,
          submissionId: row.submissionId,
          expectedUpdatedAt: row.payloadUpdatedAt.toISOString(),
          eligibleAt: row.submissionUpdatedAt.toISOString(),
        });
      }
      for (const row of evidenceRows.slice(0, limit)) {
        if (row.submissionId === null) continue;
        candidates.push({
          material: 'evidence',
          policy: 'private_evidence_180d',
          referenceType: 'evidence',
          referenceId: row.evidenceId,
          submissionId: row.submissionId,
          expectedUpdatedAt: row.updatedAt.toISOString(),
          eligibleAt: row.updatedAt.toISOString(),
        });
      }

      const selected = sortCandidates(candidates).slice(0, limit);
      return {
        candidates: selected,
        hasMore:
          contactRows.length > limit ||
          payloadRows.length > limit ||
          evidenceRows.length > limit ||
          candidates.length > limit,
      };
    },

    async applyDatabaseCandidate(command) {
      if (
        await itemExists(
          database,
          command.candidate.policy,
          command.candidate.referenceType,
          command.candidate.referenceId,
        )
      ) {
        return 'replayed';
      }

      const statements = [
        database.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${command.candidate.referenceId}, 0))`,
        ),
        ...redactionStatements(database, command),
      ];
      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
        return 'committed';
      } catch (error) {
        if (postgresErrorCode(error) === '23505') {
          if (
            await itemExists(
              database,
              command.candidate.policy,
              command.candidate.referenceType,
              command.candidate.referenceId,
            )
          ) {
            return 'replayed';
          }
        }
        persistenceConflict(error, 'Private retention conflicted with current restricted state.');
      }
    },

    async completeMediaCandidate(command) {
      if (await itemExists(database, command.policy, command.referenceType, command.referenceId)) {
        return 'replayed';
      }

      const referenceGuard =
        command.referenceType === 'reservation'
          ? sql`exists (select 1 from ${quarantineUploadReservations} where ${quarantineUploadReservations.id} = ${command.referenceId})`
          : command.referenceType === 'submission'
            ? sql`exists (select 1 from ${submissions} where ${submissions.id} = ${command.referenceId})`
            : sql`exists (select 1 from ${mediaAssets} where ${mediaAssets.id} = ${command.referenceId})`;
      const statements = [
        database.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${command.referenceId}, 0))`,
        ),
        database.select({
          guard: sql<number>`1 / case when
            ${referenceGuard}
            and exists (
              select 1 from ${submissionRetentionRuns}
              where ${submissionRetentionRuns.id} = ${command.runId}
                and ${submissionRetentionRuns.state} = 'running'
            )
            and not exists (
              select 1 from ${submissionRetentionItems}
              where ${submissionRetentionItems.policy} = ${command.policy}
                and ${submissionRetentionItems.referenceType} = ${command.referenceType}
                and ${submissionRetentionItems.referenceId} = ${command.referenceId}
            )
            then 1 else 0 end`,
        }),
        database.insert(submissionRetentionItems).values({
          id: command.itemId,
          runId: command.runId,
          material: 'media_object_set',
          policy: command.policy,
          referenceType: command.referenceType,
          referenceId: command.referenceId,
          submissionId: command.submissionId,
          outcome: 'objects_deleted',
          deletedObjectCount: command.deletedObjectCount,
          missingObjectCount: command.missingObjectCount,
          actorId: command.actorId,
          completedAt: command.effectiveAt,
        }),
      ];
      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
        return 'committed';
      } catch (error) {
        if (postgresErrorCode(error) === '23505') {
          if (await itemExists(database, command.policy, command.referenceType, command.referenceId)) {
            return 'replayed';
          }
        }
        persistenceConflict(error, 'Private Media retention receipt conflicted with current state.');
      }
    },

    async finalizeRun(command) {
      const current = await readRun(database, command.runId);
      if (current === null || current.requestFingerprint !== command.requestFingerprint) {
        throw new SubmissionPersistenceError('conflict', 'The private retention run changed.');
      }
      if (current.state !== 'running') {
        const stored = privateRetentionRunReceiptSchema.safeParse(current.receipt);
        if (stored.success && JSON.stringify(stored.data) === JSON.stringify(command.receipt)) return;
        throw new SubmissionPersistenceError(
          'conflict',
          'The private retention run was finalized with different content.',
        );
      }
      const rows = await database
        .update(submissionRetentionRuns)
        .set({
          state: command.state,
          receipt: command.receipt,
          updatedAt: command.completedAt,
        })
        .where(
          and(
            eq(submissionRetentionRuns.id, command.runId),
            eq(submissionRetentionRuns.state, 'running'),
            eq(submissionRetentionRuns.requestFingerprint, command.requestFingerprint),
          ),
        )
        .returning({ id: submissionRetentionRuns.id });
      if (rows.length !== 1) {
        throw new SubmissionPersistenceError(
          'conflict',
          'The private retention run could not be finalized exactly once.',
        );
      }
    },
  };
}
