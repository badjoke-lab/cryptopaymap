import { eq } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  evidence,
  evidenceReviewDecisions,
  verificationEventEvidence,
  verificationEvents,
} from '../../db/schema';
import {
  EvidenceReviewDecisionError,
  type EvidenceReviewDecisionBackend,
  type EvidenceReviewDecisionCommand,
} from './decision';
import {
  evidenceReviewAcceptedSetGuard,
  evidenceReviewClaimGuard,
  evidenceReviewPaymentSetGuard,
  evidenceReviewRowGuard,
} from './drizzle-guards';
import {
  projectEvidenceReviewDecision,
  readEvidenceReviewDecision,
  replayEvidenceReviewDecision,
} from './drizzle-state';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function toDate(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

export function createDrizzleEvidenceReviewBackend(
  database: CryptoPayMapDatabase,
): EvidenceReviewDecisionBackend {
  return {
    async commitDecision(command: EvidenceReviewDecisionCommand) {
      const existing = await readEvidenceReviewDecision(database, command.requestId);
      if (existing !== null) {
        if (existing.requestFingerprint !== command.requestFingerprint) {
          throw new EvidenceReviewDecisionError(
            'conflict',
            'The Evidence review request ID was reused with different content.',
          );
        }
        return replayEvidenceReviewDecision(existing);
      }

      const projected = await projectEvidenceReviewDecision(database, command);
      if (projected.claim === undefined || projected.evidence === undefined) {
        throw new EvidenceReviewDecisionError(
          'backend_failure',
          'The projected Evidence review state is incomplete.',
        );
      }

      const verificationEventId = projected.event === null ? null : crypto.randomUUID();
      const statements: unknown[] = [
        evidenceReviewRowGuard(database, command),
        evidenceReviewClaimGuard(database, command),
        evidenceReviewAcceptedSetGuard(database, command),
      ];
      if (command.claimAction === 'confirm') {
        statements.push(evidenceReviewPaymentSetGuard(database, command));
      }
      statements.push(
        database
          .update(evidence)
          .set({
            reviewStatus: projected.evidence.reviewStatus,
            updatedAt: command.decidedAt,
          })
          .where(eq(evidence.id, command.evidenceId)),
      );

      if (command.claimAction !== 'no_change') {
        statements.push(
          database
            .update(acceptanceClaims)
            .set({
              claimStatus: projected.claim.claimStatus,
              firstConfirmedAt: toDate(projected.claim.firstConfirmedAt),
              lastConfirmedAt: toDate(projected.claim.lastConfirmedAt),
              nextReviewAt: toDate(projected.claim.nextReviewAt),
              endedAt: toDate(projected.claim.endedAt),
              endedReason: projected.claim.endedReason,
              updatedAt: command.decidedAt,
            })
            .where(eq(acceptanceClaims.id, command.claimId)),
        );
      }

      if (projected.event !== null && verificationEventId !== null) {
        statements.push(
          database.insert(verificationEvents).values({
            id: verificationEventId,
            claimId: command.claimId,
            eventType: projected.event.eventType,
            fromStatus: projected.event.fromStatus,
            toStatus: projected.event.toStatus,
            fromVisibility: null,
            toVisibility: null,
            reasonCode: command.reasonCode,
            effectiveAt: command.decidedAt,
            publicSummary: command.publicSummary,
            internalNote: command.internalNote,
            actorType: 'system',
            actorId: null,
          }),
          database.insert(verificationEventEvidence).values({
            verificationEventId,
            evidenceId: command.evidenceId,
            relationship:
              command.finding === 'supports_claim'
                ? 'basis'
                : command.finding === 'contradicts_claim'
                  ? 'contradiction'
                  : 'context',
          }),
        );
      }

      statements.push(
        database.insert(evidenceReviewDecisions).values({
          id: crypto.randomUUID(),
          requestId: command.requestId,
          evidenceId: command.evidenceId,
          claimId: command.claimId,
          disposition: command.disposition,
          finding: command.finding,
          claimAction: command.claimAction,
          evidenceReviewStatus: projected.evidence.reviewStatus,
          fromClaimStatus: command.expectedClaimStatus,
          toClaimStatus: projected.claim.claimStatus,
          claimVisibility: projected.claim.visibility,
          verificationEventId,
          expectedEvidenceUpdatedAt: command.expectedEvidenceUpdatedAt,
          expectedClaimUpdatedAt: command.expectedClaimUpdatedAt,
          expectedAcceptedEvidenceIds: command.expectedAcceptedEvidenceIds,
          actorId: command.actorId,
          actorType: command.actorType,
          reasonCode: command.reasonCode,
          publicSummary: command.publicSummary,
          internalNote: command.internalNote,
          nextReviewAt: command.nextReviewAt,
          endedReason: command.endedReason,
          decidedAt: command.decidedAt,
          requestFingerprint: command.requestFingerprint,
        }),
      );

      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code === '23505') {
          const replay = await readEvidenceReviewDecision(database, command.requestId);
          if (replay?.requestFingerprint === command.requestFingerprint) {
            return replayEvidenceReviewDecision(replay);
          }
        }
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new EvidenceReviewDecisionError(
            'conflict',
            'The Evidence review conflicted with current private state and was rolled back.',
            [`PostgreSQL rejected the atomic batch with code ${code}.`],
            { cause: error },
          );
        }
        throw error;
      }

      return projected.receipt;
    },
  };
}
