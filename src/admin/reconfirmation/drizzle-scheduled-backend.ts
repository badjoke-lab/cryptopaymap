import { and, asc, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { acceptanceClaims } from '../../db/schema';
import { createDrizzleReconfirmationExpirationBackend } from './drizzle-backend';
import {
  scheduledReconfirmationClaimSchema,
  type ScheduledReconfirmationBackend,
} from './scheduled-contract';

export function createDrizzleScheduledReconfirmationBackend(
  database: CryptoPayMapDatabase,
): ScheduledReconfirmationBackend {
  const expirationBackend = createDrizzleReconfirmationExpirationBackend(database);

  return {
    commitExpiration: expirationBackend.commitExpiration,

    async loadExpiredClaims(effectiveAt, limit) {
      const rows = await database
        .select({
          id: acceptanceClaims.id,
          claimStatus: acceptanceClaims.claimStatus,
          visibility: acceptanceClaims.visibility,
          updatedAt: acceptanceClaims.updatedAt,
          nextReviewAt: acceptanceClaims.nextReviewAt,
        })
        .from(acceptanceClaims)
        .where(
          and(
            eq(acceptanceClaims.claimStatus, 'confirmed'),
            isNull(acceptanceClaims.deletedAt),
            isNotNull(acceptanceClaims.nextReviewAt),
            lte(acceptanceClaims.nextReviewAt, effectiveAt),
          ),
        )
        .orderBy(asc(acceptanceClaims.nextReviewAt), asc(acceptanceClaims.id))
        .limit(limit + 1);

      const claims = rows.slice(0, limit).map((row) =>
        scheduledReconfirmationClaimSchema.parse({
          id: row.id,
          claimStatus: row.claimStatus,
          visibility: row.visibility,
          updatedAt: row.updatedAt.toISOString(),
          nextReviewAt: row.nextReviewAt?.toISOString() ?? null,
        }),
      );

      return {
        claims,
        hasMore: rows.length > limit,
      };
    },
  };
}
