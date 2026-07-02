import { eq } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { acceptanceClaims, reconfirmationExpirations, verificationEvents } from '../../db/schema';
import {
  ReconfirmationExpirationError,
  type ReconfirmationExpirationCommand,
  type ReconfirmationExpirationReceipt,
} from './expiration';

export async function readReconfirmationExpiration(
  database: CryptoPayMapDatabase,
  requestId: string,
) {
  const rows = await database
    .select({
      requestId: reconfirmationExpirations.requestId,
      claimId: reconfirmationExpirations.claimId,
      fromClaimStatus: reconfirmationExpirations.fromClaimStatus,
      toClaimStatus: reconfirmationExpirations.toClaimStatus,
      claimVisibility: reconfirmationExpirations.claimVisibility,
      expectedNextReviewAt: reconfirmationExpirations.expectedNextReviewAt,
      effectiveAt: reconfirmationExpirations.effectiveAt,
      requestFingerprint: reconfirmationExpirations.requestFingerprint,
      eventType: verificationEvents.eventType,
    })
    .from(reconfirmationExpirations)
    .innerJoin(
      verificationEvents,
      eq(reconfirmationExpirations.verificationEventId, verificationEvents.id),
    )
    .where(eq(reconfirmationExpirations.requestId, requestId))
    .limit(1);
  return rows[0] ?? null;
}

export function replayReconfirmationExpiration(
  row: NonNullable<Awaited<ReturnType<typeof readReconfirmationExpiration>>>,
): ReconfirmationExpirationReceipt {
  if (
    row.fromClaimStatus !== 'confirmed' ||
    row.toClaimStatus !== 'stale' ||
    row.eventType !== 'marked_stale'
  ) {
    throw new ReconfirmationExpirationError(
      'backend_failure',
      'The durable reconfirmation receipt contains an unsupported transition.',
    );
  }
  return {
    requestId: row.requestId,
    claimId: row.claimId,
    fromStatus: 'confirmed',
    toStatus: 'stale',
    visibility: row.claimVisibility,
    nextReviewAt: row.expectedNextReviewAt.toISOString(),
    eventType: 'marked_stale',
    effectiveAt: row.effectiveAt.toISOString(),
    state: 'replayed',
  };
}

export async function projectReconfirmationExpiration(
  database: CryptoPayMapDatabase,
  command: ReconfirmationExpirationCommand,
) {
  const rows = await database
    .select({
      id: acceptanceClaims.id,
      claimStatus: acceptanceClaims.claimStatus,
      visibility: acceptanceClaims.visibility,
      updatedAt: acceptanceClaims.updatedAt,
      nextReviewAt: acceptanceClaims.nextReviewAt,
      deletedAt: acceptanceClaims.deletedAt,
    })
    .from(acceptanceClaims)
    .where(eq(acceptanceClaims.id, command.claimId))
    .limit(1);
  const claim = rows[0];
  if (claim === undefined || claim.deletedAt !== null) {
    throw new ReconfirmationExpirationError('not_found', 'The Claim record was not found.');
  }
  if (
    claim.claimStatus !== command.expectedClaimStatus ||
    claim.visibility !== command.expectedClaimVisibility ||
    claim.updatedAt.getTime() !== command.expectedClaimUpdatedAt.getTime() ||
    claim.nextReviewAt?.getTime() !== command.expectedNextReviewAt.getTime()
  ) {
    throw new ReconfirmationExpirationError(
      'conflict',
      'The Claim or review deadline changed before expiration.',
    );
  }
  if (command.effectiveAt.getTime() < command.expectedNextReviewAt.getTime()) {
    throw new ReconfirmationExpirationError(
      'invalid_expiration',
      'The Claim review deadline has not expired.',
    );
  }
  return {
    receipt: {
      requestId: command.requestId,
      claimId: command.claimId,
      fromStatus: 'confirmed',
      toStatus: 'stale',
      visibility: command.expectedClaimVisibility,
      nextReviewAt: command.expectedNextReviewAt.toISOString(),
      eventType: 'marked_stale',
      effectiveAt: command.effectiveAt.toISOString(),
      state: 'committed',
    } satisfies ReconfirmationExpirationReceipt,
  };
}
