import { and, desc, eq, gte, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { locationProfileCorrectionDecisions } from '../../db/schema';
import type { AuditHistorySource } from './aggregation';
import { locationProfileCorrectionAuditItem } from './normalizers';

function whereOrUndefined(conditions: SQL[]): SQL | undefined {
  return conditions.length === 0 ? undefined : and(...conditions);
}

export function createDrizzleLocationCorrectionAuditSource(
  database: CryptoPayMapDatabase,
): AuditHistorySource {
  return {
    domain: 'canonical',
    async loadAuditHistorySource(query, sourceLimit) {
      const conditions: SQL[] = [];
      if (query.actorId !== undefined) {
        conditions.push(eq(locationProfileCorrectionDecisions.actorId, query.actorId));
      }
      if (query.from !== undefined) {
        conditions.push(gte(locationProfileCorrectionDecisions.decidedAt, new Date(query.from)));
      }
      if (query.to !== undefined) {
        conditions.push(lte(locationProfileCorrectionDecisions.decidedAt, new Date(query.to)));
      }
      if (query.before !== undefined && query.beforeId !== undefined) {
        const before = new Date(query.before);
        conditions.push(
          or(
            lt(locationProfileCorrectionDecisions.decidedAt, before),
            and(
              eq(locationProfileCorrectionDecisions.decidedAt, before),
              sql`'location_profile_correction:' || ${locationProfileCorrectionDecisions.id}::text < ${query.beforeId}`,
            ),
          ) as SQL,
        );
      }

      if (query.targetType === 'location') {
        if (query.targetId !== undefined) {
          conditions.push(eq(locationProfileCorrectionDecisions.locationId, query.targetId));
        }
      } else if (query.targetType !== undefined) {
        return { items: [], hasMore: false };
      }

      const rows = await database
        .select()
        .from(locationProfileCorrectionDecisions)
        .where(whereOrUndefined(conditions))
        .orderBy(
          desc(locationProfileCorrectionDecisions.decidedAt),
          desc(locationProfileCorrectionDecisions.id),
        )
        .limit(sourceLimit + 1);

      return {
        items: rows.slice(0, sourceLimit).map(locationProfileCorrectionAuditItem),
        hasMore: rows.length > sourceLimit,
      };
    },
  };
}
