import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  candidateDuplicateGroups,
  candidateSourceRecords,
  sourceCandidates,
  sourceRecords,
  sources,
} from '../../db/schema';
import {
  encodeCandidateQueueCursor,
  type CandidateQueueBackend,
  type CandidateQueueItem,
  type CandidateQueuePageData,
  type CandidateQueueQuery,
} from './queue';

const highPriorityThreshold = 800;
const nullPrioritySortValue = -1;

function priorityFilter(query: CandidateQueueQuery): SQL | undefined {
  switch (query.priority) {
    case 'high':
      return gte(sourceCandidates.priority, highPriorityThreshold);
    case 'standard':
      return and(
        isNotNull(sourceCandidates.priority),
        lt(sourceCandidates.priority, highPriorityThreshold),
      );
    case 'unscored':
      return isNull(sourceCandidates.priority);
    case 'all':
      return undefined;
  }
}

function duplicateFilter(query: CandidateQueueQuery): SQL | undefined {
  switch (query.duplicate) {
    case 'flagged':
      return isNotNull(sourceCandidates.duplicateGroupId);
    case 'unflagged':
      return isNull(sourceCandidates.duplicateGroupId);
    case 'all':
      return undefined;
  }
}

function cursorFilter(query: CandidateQueueQuery, priorityKey: SQL<number>): SQL | undefined {
  if (query.cursor === null) return undefined;
  const cursorTime = new Date(query.cursor.lastSeenAt);
  return or(
    lt(priorityKey, query.cursor.priority),
    and(eq(priorityKey, query.cursor.priority), lt(sourceCandidates.lastSeenAt, cursorTime)),
    and(
      eq(priorityKey, query.cursor.priority),
      eq(sourceCandidates.lastSeenAt, cursorTime),
      lt(sourceCandidates.id, query.cursor.id),
    ),
  );
}

export function createDrizzleCandidateQueueBackend(
  database: CryptoPayMapDatabase,
): CandidateQueueBackend {
  return {
    async loadPage(query: CandidateQueueQuery): Promise<CandidateQueuePageData> {
      const priorityKey = sql<number>`coalesce(${sourceCandidates.priority}, ${nullPrioritySortValue})`;
      const conditions: Array<SQL | undefined> = [
        query.statuses.length > 0
          ? inArray(sourceCandidates.candidateStatus, query.statuses)
          : undefined,
        query.candidateTypes.length > 0
          ? inArray(sourceCandidates.candidateType, query.candidateTypes)
          : undefined,
        priorityFilter(query),
        duplicateFilter(query),
        cursorFilter(query, priorityKey),
      ];

      if (query.sourceTypes.length > 0) {
        const matchingCandidates = database
          .select({ candidateId: candidateSourceRecords.candidateId })
          .from(candidateSourceRecords)
          .innerJoin(sourceRecords, eq(candidateSourceRecords.sourceRecordId, sourceRecords.id))
          .innerJoin(sources, eq(sourceRecords.sourceId, sources.id))
          .where(inArray(sources.sourceType, query.sourceTypes));
        conditions.push(inArray(sourceCandidates.id, matchingCandidates));
      }

      const rows = await database
        .select({
          id: sourceCandidates.id,
          name: sourceCandidates.normalizedName,
          candidateType: sourceCandidates.candidateType,
          status: sourceCandidates.candidateStatus,
          priority: sourceCandidates.priority,
          duplicateGroupId: sourceCandidates.duplicateGroupId,
          duplicateGroupStatus: candidateDuplicateGroups.status,
          linkedEntityId: sourceCandidates.canonicalEntityId,
          linkedLocationId: sourceCandidates.canonicalLocationId,
          firstSeenAt: sourceCandidates.firstSeenAt,
          lastSeenAt: sourceCandidates.lastSeenAt,
          updatedAt: sourceCandidates.updatedAt,
          priorityKey,
        })
        .from(sourceCandidates)
        .leftJoin(
          candidateDuplicateGroups,
          eq(sourceCandidates.duplicateGroupId, candidateDuplicateGroups.id),
        )
        .where(and(...conditions))
        .orderBy(desc(priorityKey), desc(sourceCandidates.lastSeenAt), desc(sourceCandidates.id))
        .limit(query.limit + 1);

      const hasNextPage = rows.length > query.limit;
      const pageRows = hasNextPage ? rows.slice(0, query.limit) : rows;
      const candidateIds = pageRows.map((row) => row.id);
      const sourceRows =
        candidateIds.length === 0
          ? []
          : await database
              .select({
                candidateId: candidateSourceRecords.candidateId,
                sourceType: sources.sourceType,
              })
              .from(candidateSourceRecords)
              .innerJoin(sourceRecords, eq(candidateSourceRecords.sourceRecordId, sourceRecords.id))
              .innerJoin(sources, eq(sourceRecords.sourceId, sources.id))
              .where(inArray(candidateSourceRecords.candidateId, candidateIds));

      const summaries = new Map<
        string,
        { sourceTypes: Set<(typeof sourceRows)[number]['sourceType']>; sourceCount: number }
      >();
      for (const sourceRow of sourceRows) {
        const summary = summaries.get(sourceRow.candidateId) ?? {
          sourceTypes: new Set(),
          sourceCount: 0,
        };
        summary.sourceTypes.add(sourceRow.sourceType);
        summary.sourceCount += 1;
        summaries.set(sourceRow.candidateId, summary);
      }

      const items: CandidateQueueItem[] = pageRows.map((row) => {
        const summary = summaries.get(row.id);
        return {
          id: row.id,
          name: row.name,
          candidateType: row.candidateType,
          status: row.status,
          priority: row.priority,
          firstSeenAt: row.firstSeenAt.toISOString(),
          lastSeenAt: row.lastSeenAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          sourceTypes: summary ? [...summary.sourceTypes].sort() : [],
          sourceCount: summary?.sourceCount ?? 0,
          duplicateSignal: row.duplicateGroupId !== null,
          duplicateGroupStatus: row.duplicateGroupStatus,
          linkedToCanonical: row.linkedEntityId !== null || row.linkedLocationId !== null,
        };
      });

      const lastRow = pageRows.at(-1);
      return {
        items,
        hasNextPage,
        nextCursor:
          hasNextPage && lastRow
            ? encodeCandidateQueueCursor({
                priority: lastRow.priorityKey,
                lastSeenAt: lastRow.lastSeenAt.toISOString(),
                id: lastRow.id,
              })
            : null,
      };
    },
  };
}
