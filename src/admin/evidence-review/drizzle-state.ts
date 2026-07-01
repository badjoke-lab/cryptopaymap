import { and, eq, isNull, or } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  evidence,
  evidenceReviewDecisions,
  verificationEvents,
} from '../../db/schema';
import {
  EvidenceReviewDecisionError,
  type EvidenceReviewDecisionCommand,
  type EvidenceReviewDecisionReceipt,
} from './decision';
import { InMemoryEvidenceReviewBackend } from './in-memory-backend';

function durableEvidenceReviewStatus(
  value: string,
): EvidenceReviewDecisionReceipt['evidenceReviewStatus'] {
  if (value === 'pending' || value === 'accepted' || value === 'rejected') return value;
  throw new EvidenceReviewDecisionError(
    'backend_failure',
    'The durable Evidence review receipt contains an unsupported Evidence status.',
  );
}

function durableVerificationEventType(
  value: string | null,
): EvidenceReviewDecisionReceipt['verificationEventType'] {
  if (
    value === null ||
    value === 'confirmed' ||
    value === 'reconfirmed' ||
    value === 'restored' ||
    value === 'marked_stale' ||
    value === 'ended' ||
    value === 'rejected'
  ) {
    return value;
  }
  throw new EvidenceReviewDecisionError(
    'backend_failure',
    'The durable Evidence review receipt contains an unsupported verification event.',
  );
}

export async function readEvidenceReviewDecision(
  database: CryptoPayMapDatabase,
  requestId: string,
) {
  const rows = await database
    .select({
      requestId: evidenceReviewDecisions.requestId,
      evidenceId: evidenceReviewDecisions.evidenceId,
      claimId: evidenceReviewDecisions.claimId,
      disposition: evidenceReviewDecisions.disposition,
      finding: evidenceReviewDecisions.finding,
      claimAction: evidenceReviewDecisions.claimAction,
      evidenceReviewStatus: evidenceReviewDecisions.evidenceReviewStatus,
      claimStatus: evidenceReviewDecisions.toClaimStatus,
      claimVisibility: evidenceReviewDecisions.claimVisibility,
      decidedAt: evidenceReviewDecisions.decidedAt,
      requestFingerprint: evidenceReviewDecisions.requestFingerprint,
      verificationEventType: verificationEvents.eventType,
    })
    .from(evidenceReviewDecisions)
    .leftJoin(
      verificationEvents,
      eq(evidenceReviewDecisions.verificationEventId, verificationEvents.id),
    )
    .where(eq(evidenceReviewDecisions.requestId, requestId))
    .limit(1);
  return rows[0] ?? null;
}

export function replayEvidenceReviewDecision(
  row: NonNullable<Awaited<ReturnType<typeof readEvidenceReviewDecision>>>,
): EvidenceReviewDecisionReceipt {
  return {
    requestId: row.requestId,
    evidenceId: row.evidenceId,
    claimId: row.claimId,
    disposition: row.disposition,
    finding: row.finding,
    claimAction: row.claimAction,
    evidenceReviewStatus: durableEvidenceReviewStatus(row.evidenceReviewStatus),
    claimStatus: row.claimStatus,
    claimVisibility: row.claimVisibility,
    verificationEventType: durableVerificationEventType(row.verificationEventType),
    decidedAt: row.decidedAt.toISOString(),
    state: 'replayed',
  };
}

export async function projectEvidenceReviewDecision(
  database: CryptoPayMapDatabase,
  command: EvidenceReviewDecisionCommand,
) {
  const claimRows = await database
    .select({
      id: acceptanceClaims.id,
      claimStatus: acceptanceClaims.claimStatus,
      visibility: acceptanceClaims.visibility,
      updatedAt: acceptanceClaims.updatedAt,
      howToPay: acceptanceClaims.howToPay,
      customerPaysCrypto: acceptanceClaims.customerPaysCrypto,
      merchantExplicitlyAcceptsCrypto: acceptanceClaims.merchantExplicitlyAcceptsCrypto,
      firstConfirmedAt: acceptanceClaims.firstConfirmedAt,
      lastConfirmedAt: acceptanceClaims.lastConfirmedAt,
      nextReviewAt: acceptanceClaims.nextReviewAt,
      endedAt: acceptanceClaims.endedAt,
      endedReason: acceptanceClaims.endedReason,
      deletedAt: acceptanceClaims.deletedAt,
    })
    .from(acceptanceClaims)
    .where(eq(acceptanceClaims.id, command.claimId))
    .limit(1);
  const claim = claimRows[0];
  if (claim === undefined) {
    throw new EvidenceReviewDecisionError('not_found', 'The Claim record was not found.');
  }

  const evidenceRows = await database
    .select({
      id: evidence.id,
      claimId: evidence.claimId,
      evidenceClass: evidence.evidenceClass,
      originRole: evidence.originRole,
      polarity: evidence.polarity,
      reviewStatus: evidence.reviewStatus,
      observedAt: evidence.observedAt,
      independenceKey: evidence.independenceKey,
      updatedAt: evidence.updatedAt,
      deletedAt: evidence.deletedAt,
    })
    .from(evidence)
    .where(
      and(
        eq(evidence.claimId, command.claimId),
        isNull(evidence.deletedAt),
        or(eq(evidence.id, command.evidenceId), eq(evidence.reviewStatus, 'accepted')),
      ),
    );
  if (!evidenceRows.some((row) => row.id === command.evidenceId)) {
    throw new EvidenceReviewDecisionError('not_found', 'The Evidence record was not found.');
  }

  const projection = new InMemoryEvidenceReviewBackend({
    claims: [
      {
        id: claim.id,
        claimStatus: claim.claimStatus,
        visibility: claim.visibility,
        updatedAt: claim.updatedAt.toISOString(),
        howToPay: claim.howToPay,
        customerPaysCrypto: claim.customerPaysCrypto,
        merchantExplicitlyAcceptsCrypto: claim.merchantExplicitlyAcceptsCrypto,
        firstConfirmedAt: claim.firstConfirmedAt?.toISOString() ?? null,
        lastConfirmedAt: claim.lastConfirmedAt?.toISOString() ?? null,
        nextReviewAt: claim.nextReviewAt?.toISOString() ?? null,
        endedAt: claim.endedAt?.toISOString() ?? null,
        endedReason: claim.endedReason,
        deletedAt: claim.deletedAt?.toISOString() ?? null,
      },
    ],
    evidence: evidenceRows.map((row) => ({
      id: row.id,
      claimId: row.claimId ?? command.claimId,
      evidenceClass: row.evidenceClass,
      originRole: row.originRole,
      polarity: row.polarity,
      reviewStatus: row.reviewStatus,
      observedAt: row.observedAt?.toISOString() ?? null,
      independenceKey: row.independenceKey,
      updatedAt: row.updatedAt.toISOString(),
      deletedAt: row.deletedAt?.toISOString() ?? null,
    })),
  });
  const receipt = await projection.commitDecision(command);
  const snapshot = projection.snapshot();
  return {
    receipt,
    claim: snapshot.claims.find((row) => row.id === command.claimId),
    evidence: snapshot.evidence.find((row) => row.id === command.evidenceId),
    event: snapshot.verificationEvents[0] ?? null,
  };
}
