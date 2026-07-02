import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { acceptanceClaims } from '../../db/schema';
import { buildReconfirmationQueue, type ReconfirmationClaimSnapshot } from './queue';
import type { ReconfirmationQueueBackend } from './workspace';

export function createDrizzleReconfirmationQueueBackend(
  database: CryptoPayMapDatabase,
): ReconfirmationQueueBackend {
  return {
    async loadQueue(query, asOf) {
      const dueSoonCutoff = new Date(asOf.getTime() + query.dueSoonDays * 86_400_000);
      const priority = sql<number>`case
        when ${acceptanceClaims.claimStatus} = 'confirmed'
          and ${acceptanceClaims.nextReviewAt} is not null
          and ${acceptanceClaims.nextReviewAt} <= ${asOf} then 0
        when ${acceptanceClaims.claimStatus} = 'confirmed'
          and ${acceptanceClaims.nextReviewAt} is null then 10
        when ${acceptanceClaims.claimStatus} = 'stale' then 100
        else 200
      end`;

      const rows = await database
        .select({
          id: acceptanceClaims.id,
          claimStatus: acceptanceClaims.claimStatus,
          visibility: acceptanceClaims.visibility,
          lastConfirmedAt: acceptanceClaims.lastConfirmedAt,
          nextReviewAt: acceptanceClaims.nextReviewAt,
          updatedAt: acceptanceClaims.updatedAt,
          deletedAt: acceptanceClaims.deletedAt,
        })
        .from(acceptanceClaims)
        .where(
          and(
            isNull(acceptanceClaims.deletedAt),
            or(
              eq(acceptanceClaims.claimStatus, 'stale'),
              and(
                eq(acceptanceClaims.claimStatus, 'confirmed'),
                or(
                  isNull(acceptanceClaims.nextReviewAt),
                  lte(acceptanceClaims.nextReviewAt, dueSoonCutoff),
                ),
              ),
            ),
          ),
        )
        .orderBy(priority, asc(acceptanceClaims.nextReviewAt), asc(acceptanceClaims.id))
        .limit(query.limit + 1);

      const snapshots: ReconfirmationClaimSnapshot[] = rows.map((row) => ({
        id: row.id,
        claimStatus: row.claimStatus,
        visibility: row.visibility,
        lastConfirmedAt: row.lastConfirmedAt?.toISOString() ?? null,
        nextReviewAt: row.nextReviewAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
        deletedAt: row.deletedAt?.toISOString() ?? null,
      }));
      const items = buildReconfirmationQueue(snapshots, asOf, {
        dueSoonDays: query.dueSoonDays,
      }).slice(0, query.limit);
      return {
        items,
        hasMore: rows.length > query.limit,
      };
    },
  };
}
