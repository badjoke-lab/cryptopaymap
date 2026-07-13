import { and, eq, isNull, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  entities,
  evidence,
  locations,
  submissionEvents,
  submissionPayloads,
  submissions,
  verificationEventEvidence,
  verificationEvents,
} from '../../db/schema';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type {
  ProblemReportDecisionBackend,
  ProblemReportDecisionCommand,
  ProblemReportDecisionState,
} from './problem-report-decision';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function duplicateTargetGuard(
  database: CryptoPayMapDatabase,
  command: ProblemReportDecisionCommand,
): unknown | null {
  const target = command.duplicateTarget;
  if (target === null) return null;
  if (target.targetType === 'entity') {
    return database.execute(sql`
      select 1 / case when exists (
        select 1 from ${entities}
        where ${entities.id} = ${target.targetId}
          and ${entities.deletedAt} is null
        for share
      ) then 1 else 0 end as duplicate_entity_guard
    `);
  }
  if (target.targetType === 'location') {
    return database.execute(sql`
      select 1 / case when exists (
        select 1 from ${locations}
        where ${locations.id} = ${target.targetId}
          and ${locations.deletedAt} is null
        for share
      ) then 1 else 0 end as duplicate_location_guard
    `);
  }
  return database.execute(sql`
    select 1 / case when exists (
      select 1 from ${acceptanceClaims}
      where ${acceptanceClaims.id} = ${target.targetId}
        and ${acceptanceClaims.deletedAt} is null
      for share
    ) then 1 else 0 end as duplicate_claim_guard
  `);
}

export function createDrizzleProblemReportDecisionBackend(
  database: CryptoPayMapDatabase,
): ProblemReportDecisionBackend {
  return {
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
      return { ...row, createdAt: row.createdAt.toISOString() };
    },

    async readState(submissionId, claimId, evidenceId) {
      const submissionRows = await database
        .select({
          submissionId: submissions.id,
          submissionType: submissions.submissionType,
          targetType: submissions.targetType,
          targetId: submissions.targetId,
          workflowStatus: submissions.workflowStatus,
          resolution: submissions.resolution,
          updatedAt: submissions.updatedAt,
          originalPayload: submissionPayloads.originalPayload,
          normalizedPayload: submissionPayloads.normalizedPayload,
          payloadUpdatedAt: submissionPayloads.updatedAt,
        })
        .from(submissions)
        .innerJoin(submissionPayloads, eq(submissionPayloads.submissionId, submissions.id))
        .where(eq(submissions.id, submissionId))
        .limit(1);
      const submission = submissionRows[0];
      if (submission === undefined) return null;

      let claim: ProblemReportDecisionState['claim'] = null;
      if (claimId !== null) {
        const claimRows = await database
          .select({
            id: acceptanceClaims.id,
            entityId: acceptanceClaims.entityId,
            locationId: acceptanceClaims.locationId,
            claimStatus: acceptanceClaims.claimStatus,
            visibility: acceptanceClaims.visibility,
            updatedAt: acceptanceClaims.updatedAt,
          })
          .from(acceptanceClaims)
          .where(and(eq(acceptanceClaims.id, claimId), isNull(acceptanceClaims.deletedAt)))
          .limit(1);
        const row = claimRows[0];
        if (row !== undefined) {
          claim = { ...row, updatedAt: row.updatedAt.toISOString() };
        }
      }

      let evidenceState: ProblemReportDecisionState['evidence'] = null;
      if (evidenceId !== null) {
        const evidenceRows = await database
          .select({
            id: evidence.id,
            claimId: evidence.claimId,
            submissionId: evidence.submissionId,
            reviewStatus: evidence.reviewStatus,
            polarity: evidence.polarity,
            deletedAt: evidence.deletedAt,
            negativeEvidenceDecisionRecorded: sql<boolean>`exists (
              select 1
              from ${submissionEvents}
              where ${submissionEvents.submissionId} = ${submissionId}
                and ${submissionEvents.action} = 'negative_report_evidence_decided'
                and ${submissionEvents.reasonCode} in (
                  'negative_evidence_accepted',
                  'negative_evidence_recheck_priority'
                )
            )`,
          })
          .from(evidence)
          .where(eq(evidence.id, evidenceId))
          .limit(1);
        const row = evidenceRows[0];
        if (row !== undefined) {
          evidenceState = {
            ...row,
            deletedAt: row.deletedAt?.toISOString() ?? null,
          };
        }
      }

      return {
        submissionId: submission.submissionId,
        submissionType: submission.submissionType,
        targetType: submission.targetType,
        targetId: submission.targetId,
        workflowStatus: submission.workflowStatus,
        resolution: submission.resolution,
        updatedAt: submission.updatedAt.toISOString(),
        originalPayload: submission.originalPayload,
        normalizedPayload: submission.normalizedPayload,
        payloadUpdatedAt: submission.payloadUpdatedAt.toISOString(),
        claim,
        evidence: evidenceState,
      };
    },

    async readDuplicateTargetExists(targetType, targetId) {
      if (targetType === 'entity') {
        const rows = await database
          .select({ id: entities.id })
          .from(entities)
          .where(and(eq(entities.id, targetId), isNull(entities.deletedAt)))
          .limit(1);
        return rows.length === 1;
      }
      if (targetType === 'location') {
        const rows = await database
          .select({ id: locations.id })
          .from(locations)
          .where(and(eq(locations.id, targetId), isNull(locations.deletedAt)))
          .limit(1);
        return rows.length === 1;
      }
      const rows = await database
        .select({ id: acceptanceClaims.id })
        .from(acceptanceClaims)
        .where(and(eq(acceptanceClaims.id, targetId), isNull(acceptanceClaims.deletedAt)))
        .limit(1);
      return rows.length === 1;
    },

    async commitDecision(command) {
      const submissionGuard = database.execute(sql`
        select 1 / case when exists (
          select 1
          from ${submissions}
          inner join ${submissionPayloads}
            on ${submissionPayloads.submissionId} = ${submissions.id}
          where ${submissions.id} = ${command.submissionId}
            and ${submissions.workflowStatus} = ${command.expectedSubmissionStatus}
            and ${submissions.resolution} is not distinct from ${command.expectedSubmissionResolution}
            and ${submissions.updatedAt} = ${command.expectedSubmissionUpdatedAt}
            and ${submissionPayloads.updatedAt} = ${command.expectedPayloadUpdatedAt}
          for update of ${submissions}, ${submissionPayloads}
        ) then 1 else 0 end as problem_submission_guard
      `);
      const statements: unknown[] = [submissionGuard];

      const duplicateGuard = duplicateTargetGuard(database, command);
      if (duplicateGuard !== null) statements.push(duplicateGuard);

      if (
        command.claimId !== null &&
        command.expectedClaimUpdatedAt !== null &&
        command.expectedClaimStatus !== null &&
        command.expectedClaimVisibility !== null
      ) {
        statements.push(
          database.execute(sql`
            select 1 / case when exists (
              select 1
              from ${acceptanceClaims}
              inner join ${submissions}
                on ${submissions.id} = ${command.submissionId}
              where ${acceptanceClaims.id} = ${command.claimId}
                and ${acceptanceClaims.claimStatus} = ${command.expectedClaimStatus}
                and ${acceptanceClaims.visibility} = ${command.expectedClaimVisibility}
                and ${acceptanceClaims.updatedAt} = ${command.expectedClaimUpdatedAt}
                and ${acceptanceClaims.deletedAt} is null
                and (
                  (${submissions.targetType} = 'claim'
                    and ${submissions.targetId} = ${acceptanceClaims.id})
                  or (${submissions.targetType} = 'entity'
                    and ${submissions.targetId} = ${acceptanceClaims.entityId})
                  or (${submissions.targetType} = 'location'
                    and ${submissions.targetId} = ${acceptanceClaims.locationId})
                )
              for update of ${acceptanceClaims}
            ) then 1 else 0 end as problem_claim_guard
          `),
        );
      }

      if (command.evidenceId !== null && command.claimId !== null) {
        statements.push(
          database.execute(sql`
            select 1 / case when exists (
              select 1 from ${evidence}
              where ${evidence.id} = ${command.evidenceId}
                and ${evidence.claimId} = ${command.claimId}
                and ${evidence.submissionId} = ${command.submissionId}
                and ${evidence.reviewStatus} = 'accepted'
                and ${evidence.polarity} = 'contradicting'
                and ${evidence.deletedAt} is null
                and exists (
                  select 1
                  from ${submissionEvents}
                  where ${submissionEvents.submissionId} = ${command.submissionId}
                    and ${submissionEvents.action} = 'negative_report_evidence_decided'
                    and ${submissionEvents.reasonCode} in (
                      'negative_evidence_accepted',
                      'negative_evidence_recheck_priority'
                    )
                )
              for share
            ) then 1 else 0 end as problem_evidence_guard
          `),
        );
      }

      if (command.operation === 'apply_negative_claim_action') {
        statements.push(
          database
            .update(submissions)
            .set({ updatedAt: command.decidedAt })
            .where(eq(submissions.id, command.submissionId)),
        );
      } else {
        statements.push(
          database
            .update(submissions)
            .set({
              workflowStatus: command.toSubmissionStatus,
              resolution: command.toSubmissionResolution,
              updatedAt: command.decidedAt,
              resolvedAt: command.decidedAt,
              withdrawnAt: null,
            })
            .where(eq(submissions.id, command.submissionId)),
        );
      }

      if (command.claimId !== null && command.toClaimVisibility !== null) {
        statements.push(
          database
            .update(acceptanceClaims)
            .set({
              visibility: command.toClaimVisibility,
              updatedAt: command.decidedAt,
            })
            .where(eq(acceptanceClaims.id, command.claimId)),
        );
      }
      if (command.claimId !== null && command.toClaimStatus === 'stale') {
        statements.push(
          database
            .update(acceptanceClaims)
            .set({
              claimStatus: 'stale',
              nextReviewAt: command.nextReviewAt,
              updatedAt: command.decidedAt,
            })
            .where(eq(acceptanceClaims.id, command.claimId)),
        );
      }
      if (command.claimId !== null && command.toClaimStatus === 'ended') {
        statements.push(
          database
            .update(acceptanceClaims)
            .set({
              claimStatus: 'ended',
              nextReviewAt: null,
              endedAt: command.decidedAt,
              endedReason: command.endedReason,
              updatedAt: command.decidedAt,
            })
            .where(eq(acceptanceClaims.id, command.claimId)),
        );
      }

      if (command.verificationEventId !== null && command.claimId !== null) {
        if (command.operation === 'temporarily_hide_claim') {
          statements.push(
            database.insert(verificationEvents).values({
              id: command.verificationEventId,
              claimId: command.claimId,
              eventType: 'hidden',
              fromStatus: null,
              toStatus: null,
              fromVisibility: command.expectedClaimVisibility,
              toVisibility: 'temporarily_hidden',
              reasonCode: command.eventReasonCode,
              effectiveAt: command.decidedAt,
              publicSummary: command.publicSummary,
              internalNote: null,
              actorType: 'system',
              actorId: null,
            }),
          );
        } else if (command.toClaimStatus !== null) {
          statements.push(
            database.insert(verificationEvents).values({
              id: command.verificationEventId,
              claimId: command.claimId,
              eventType: command.toClaimStatus === 'stale' ? 'marked_stale' : 'ended',
              fromStatus: command.expectedClaimStatus,
              toStatus: command.toClaimStatus,
              fromVisibility: null,
              toVisibility: null,
              reasonCode: command.eventReasonCode,
              effectiveAt: command.decidedAt,
              publicSummary: command.publicSummary,
              internalNote: null,
              actorType: 'system',
              actorId: null,
            }),
          );
          if (command.evidenceId !== null) {
            statements.push(
              database.insert(verificationEventEvidence).values({
                verificationEventId: command.verificationEventId,
                evidenceId: command.evidenceId,
                relationship: 'contradiction',
                createdAt: command.decidedAt,
              }),
            );
          }
        }
      }

      statements.push(
        database.insert(submissionEvents).values({
          id: command.requestId,
          submissionId: command.submissionId,
          fromStatus:
            command.operation === 'apply_negative_claim_action'
              ? null
              : command.expectedSubmissionStatus,
          toStatus: command.toSubmissionStatus,
          action: command.eventAction,
          reasonCode: command.eventReasonCode,
          actorId: command.actorId,
          actorType: command.actorType === 'human' ? 'reviewer' : 'system',
          internalNote: command.eventInternalNote,
          createdAt: command.decidedAt,
        }),
      );

      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new SubmissionPersistenceError(
            'conflict',
            'Problem report decision conflicted with current private state and was rolled back.',
            { cause: error },
          );
        }
        throw error;
      }
    },
  };
}
