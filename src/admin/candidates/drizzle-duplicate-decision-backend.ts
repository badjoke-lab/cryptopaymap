import { and, eq, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  candidateDuplicateDecisions,
  candidateDuplicateGroups,
  sourceCandidates,
  type CandidateDuplicateDecisionMemberState,
} from '../../db/schema';
import {
  CandidateDuplicateDecisionError,
  type CandidateDuplicateDecisionBackend,
  type CandidateDuplicateDecisionCommand,
  type CandidateDuplicateDecisionReceipt,
} from './duplicate-decision';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

async function readExistingDecision(
  database: CryptoPayMapDatabase,
  requestId: string,
) {
  const rows = await database
    .select({
      id: candidateDuplicateDecisions.id,
      requestId: candidateDuplicateDecisions.requestId,
      duplicateGroupId: candidateDuplicateDecisions.duplicateGroupId,
      action: candidateDuplicateDecisions.action,
      primaryCandidateId: candidateDuplicateDecisions.primaryCandidateId,
      memberCandidateIds: candidateDuplicateDecisions.memberCandidateIds,
      decidedAt: candidateDuplicateDecisions.decidedAt,
      decisionFingerprint: candidateDuplicateDecisions.decisionFingerprint,
    })
    .from(candidateDuplicateDecisions)
    .where(eq(candidateDuplicateDecisions.requestId, requestId))
    .limit(1);
  return rows[0] ?? null;
}

function replayReceipt(
  existing: NonNullable<Awaited<ReturnType<typeof readExistingDecision>>>,
): CandidateDuplicateDecisionReceipt {
  return {
    decisionId: existing.id,
    requestId: existing.requestId,
    duplicateGroupId: existing.duplicateGroupId,
    action: existing.action,
    primaryCandidateId: existing.primaryCandidateId,
    memberCandidateIds: [...existing.memberCandidateIds],
    groupStatus: existing.action === 'confirm_duplicate' ? 'resolved' : 'dismissed',
    decidedAt: existing.decidedAt.toISOString(),
    state: 'replayed',
  };
}

function groupGuard(
  database: CryptoPayMapDatabase,
  command: CandidateDuplicateDecisionCommand,
) {
  return database.execute(sql`
    select 1 / case when exists (
      select 1
      from ${candidateDuplicateGroups}
      where ${candidateDuplicateGroups.id} = ${command.duplicateGroupId}
        and ${candidateDuplicateGroups.status} = 'open'
        and ${candidateDuplicateGroups.updatedAt} = ${command.expectedGroupUpdatedAt}
      for update
    ) then 1 else 0 end as duplicate_group_guard
  `);
}

function membershipGuard(
  database: CryptoPayMapDatabase,
  command: CandidateDuplicateDecisionCommand,
) {
  return database.execute(sql`
    select 1 / case when (
      select coalesce(jsonb_agg(locked.id order by locked.id), '[]'::jsonb)
      from (
        select ${sourceCandidates.id} as id
        from ${sourceCandidates}
        where ${sourceCandidates.duplicateGroupId} = ${command.duplicateGroupId}
        for update
      ) as locked
    ) = ${JSON.stringify(command.memberCandidateIds)}::jsonb then 1 else 0 end
      as duplicate_membership_guard
  `);
}

function memberGuard(
  database: CryptoPayMapDatabase,
  state: CandidateDuplicateDecisionMemberState,
  duplicateGroupId: string,
) {
  return database.execute(sql`
    select 1 / case when exists (
      select 1
      from ${sourceCandidates}
      where ${sourceCandidates.id} = ${state.candidateId}
        and ${sourceCandidates.duplicateGroupId} = ${duplicateGroupId}
        and ${sourceCandidates.candidateStatus} = ${state.candidateStatus}
        and ${sourceCandidates.candidateType} = ${state.candidateType}
        and ${sourceCandidates.updatedAt} = ${new Date(state.updatedAt)}
    ) then 1 else 0 end as duplicate_member_guard
  `);
}

export function createDrizzleDuplicateDecisionBackend(
  database: CryptoPayMapDatabase,
): CandidateDuplicateDecisionBackend {
  return {
    async commitDecision(
      command: CandidateDuplicateDecisionCommand,
    ): Promise<CandidateDuplicateDecisionReceipt> {
      const existing = await readExistingDecision(database, command.requestId);
      if (existing !== null) {
        if (existing.decisionFingerprint !== command.decisionFingerprint) {
          throw new CandidateDuplicateDecisionError(
            'conflict',
            'The duplicate decision request ID was reused with different content.',
          );
        }
        return replayReceipt(existing);
      }

      const groupRows = await database
        .select({
          id: candidateDuplicateGroups.id,
          status: candidateDuplicateGroups.status,
          updatedAt: candidateDuplicateGroups.updatedAt,
        })
        .from(candidateDuplicateGroups)
        .where(eq(candidateDuplicateGroups.id, command.duplicateGroupId))
        .limit(1);
      const group = groupRows[0];
      if (!group) {
        throw new CandidateDuplicateDecisionError(
          'not_found',
          'The Candidate duplicate group was not found.',
        );
      }

      const memberRows = await database
        .select({
          candidateId: sourceCandidates.id,
          candidateStatus: sourceCandidates.candidateStatus,
          candidateType: sourceCandidates.candidateType,
          updatedAt: sourceCandidates.updatedAt,
        })
        .from(sourceCandidates)
        .where(eq(sourceCandidates.duplicateGroupId, command.duplicateGroupId))
        .orderBy(sourceCandidates.id);
      const memberCandidateIds = memberRows.map((member) => member.candidateId);
      if (JSON.stringify(memberCandidateIds) !== JSON.stringify(command.memberCandidateIds)) {
        throw new CandidateDuplicateDecisionError(
          'conflict',
          'The Candidate duplicate group membership changed before commit.',
        );
      }
      if (new Set(memberRows.map((member) => member.candidateType)).size !== 1) {
        throw new CandidateDuplicateDecisionError(
          'conflict',
          'A duplicate group cannot contain different Candidate types.',
        );
      }
      if (memberRows.some((member) => !['new', 'triaged'].includes(member.candidateStatus))) {
        throw new CandidateDuplicateDecisionError(
          'conflict',
          'Only new or triaged Candidates can be resolved as duplicates.',
        );
      }

      const previousMemberStates: CandidateDuplicateDecisionMemberState[] = memberRows.map(
        (member) => ({
          candidateId: member.candidateId,
          candidateStatus: member.candidateStatus,
          candidateType: member.candidateType,
          updatedAt: member.updatedAt.toISOString(),
        }),
      );
      const statements: unknown[] = [
        groupGuard(database, command),
        membershipGuard(database, command),
        ...previousMemberStates.map((state) =>
          memberGuard(database, state, command.duplicateGroupId),
        ),
      ];

      if (command.action === 'confirm_duplicate') {
        for (const member of memberRows) {
          if (member.candidateId === command.primaryCandidateId) continue;
          statements.push(
            database
              .update(sourceCandidates)
              .set({ candidateStatus: 'duplicate', updatedAt: command.decidedAt })
              .where(
                and(
                  eq(sourceCandidates.id, member.candidateId),
                  eq(sourceCandidates.duplicateGroupId, command.duplicateGroupId),
                ),
              ),
          );
        }
      }

      statements.push(
        database
          .update(candidateDuplicateGroups)
          .set({
            status: command.action === 'confirm_duplicate' ? 'resolved' : 'dismissed',
            resolutionNote: command.note,
            resolvedAt: command.decidedAt,
            updatedAt: command.decidedAt,
          })
          .where(eq(candidateDuplicateGroups.id, command.duplicateGroupId)),
        database.insert(candidateDuplicateDecisions).values({
          id: command.decisionId,
          requestId: command.requestId,
          duplicateGroupId: command.duplicateGroupId,
          action: command.action,
          primaryCandidateId: command.primaryCandidateId,
          memberCandidateIds: command.memberCandidateIds,
          previousMemberStates,
          reasonCode: command.reasonCode,
          note: command.note,
          actorId: command.actorId,
          actorType: command.actorType,
          expectedGroupUpdatedAt: command.expectedGroupUpdatedAt,
          decidedAt: command.decidedAt,
          decisionFingerprint: command.decisionFingerprint,
        }),
      );

      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code === '23505') {
          const replay = await readExistingDecision(database, command.requestId);
          if (replay !== null && replay.decisionFingerprint === command.decisionFingerprint) {
            return replayReceipt(replay);
          }
        }
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new CandidateDuplicateDecisionError(
            'conflict',
            'The Candidate duplicate decision conflicted with current private state and was rolled back.',
            [`PostgreSQL rejected the atomic batch with code ${code}.`],
            { cause: error },
          );
        }
        throw error;
      }

      return {
        decisionId: command.decisionId,
        requestId: command.requestId,
        duplicateGroupId: command.duplicateGroupId,
        action: command.action,
        primaryCandidateId: command.primaryCandidateId,
        memberCandidateIds: [...command.memberCandidateIds],
        groupStatus: command.action === 'confirm_duplicate' ? 'resolved' : 'dismissed',
        decidedAt: command.decidedAt.toISOString(),
        state: 'committed',
      };
    },
  };
}
