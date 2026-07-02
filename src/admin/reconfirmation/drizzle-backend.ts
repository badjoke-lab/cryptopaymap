import { eq } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  acceptanceClaims,
  reconfirmationExpirations,
  verificationEvents,
} from '../../db/schema';
import {
  ReconfirmationExpirationError,
  type ReconfirmationExpirationBackend,
  type ReconfirmationExpirationCommand,
} from './expiration';
import { reconfirmationExpirationClaimGuard } from './drizzle-guards';
import {
  projectReconfirmationExpiration,
  readReconfirmationExpiration,
  replayReconfirmationExpiration,
} from './drizzle-state';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function postgresErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function createDrizzleReconfirmationExpirationBackend(
  database: CryptoPayMapDatabase,
): ReconfirmationExpirationBackend {
  return {
    async commitExpiration(command: ReconfirmationExpirationCommand) {
      const existing = await readReconfirmationExpiration(database, command.requestId);
      if (existing !== null) {
        if (existing.requestFingerprint !== command.requestFingerprint) {
          throw new ReconfirmationExpirationError(
            'conflict',
            'The expiration request ID was reused with different content.',
          );
        }
        return replayReconfirmationExpiration(existing);
      }

      const projected = await projectReconfirmationExpiration(database, command);
      const verificationEventId = crypto.randomUUID();
      const statements: unknown[] = [
        reconfirmationExpirationClaimGuard(database, command),
        database
          .update(acceptanceClaims)
          .set({
            claimStatus: 'stale',
            updatedAt: command.effectiveAt,
          })
          .where(eq(acceptanceClaims.id, command.claimId)),
        database.insert(verificationEvents).values({
          id: verificationEventId,
          claimId: command.claimId,
          eventType: 'marked_stale',
          fromStatus: 'confirmed',
          toStatus: 'stale',
          fromVisibility: null,
          toVisibility: null,
          reasonCode: command.reasonCode,
          effectiveAt: command.effectiveAt,
          publicSummary: command.publicSummary,
          internalNote: command.internalNote,
          actorType: 'system',
          actorId: null,
        }),
        database.insert(reconfirmationExpirations).values({
          id: crypto.randomUUID(),
          requestId: command.requestId,
          claimId: command.claimId,
          fromClaimStatus: 'confirmed',
          toClaimStatus: 'stale',
          claimVisibility: command.expectedClaimVisibility,
          verificationEventId,
          expectedClaimUpdatedAt: command.expectedClaimUpdatedAt,
          expectedNextReviewAt: command.expectedNextReviewAt,
          actorId: command.actorId,
          actorType: command.actorType,
          reasonCode: command.reasonCode,
          publicSummary: command.publicSummary,
          internalNote: command.internalNote,
          effectiveAt: command.effectiveAt,
          requestFingerprint: command.requestFingerprint,
        }),
      ];

      try {
        await database.batch(statements as unknown as DatabaseBatchInput);
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code === '23505') {
          const replay = await readReconfirmationExpiration(database, command.requestId);
          if (replay?.requestFingerprint === command.requestFingerprint) {
            return replayReconfirmationExpiration(replay);
          }
        }
        if (code !== null && ['22012', '23503', '23505', '23514'].includes(code)) {
          throw new ReconfirmationExpirationError(
            'conflict',
            'The Claim expiration conflicted with current private state and was rolled back.',
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
