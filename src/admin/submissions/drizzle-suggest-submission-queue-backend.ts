import { and, asc, desc, eq, gt, inArray, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { submissionPayloads, submissions } from '../../db/schema';
import {
  encodeSuggestSubmissionQueueCursor,
  type SuggestSubmissionQueueBackend,
  type SuggestSubmissionQueueItem,
  type SuggestSubmissionQueuePageData,
  type SuggestSubmissionQueueQuery,
} from './queue';

function cursorFilter(query: SuggestSubmissionQueueQuery): SQL | undefined {
  if (query.cursor === null) return undefined;
  const submittedAt = new Date(query.cursor.submittedAt);
  return or(
    sql`${submissions.priority} < ${query.cursor.priority}`,
    and(eq(submissions.priority, query.cursor.priority), gt(submissions.submittedAt, submittedAt)),
    and(
      eq(submissions.priority, query.cursor.priority),
      eq(submissions.submittedAt, submittedAt),
      gt(submissions.id, query.cursor.id),
    ),
  );
}

export function createDrizzleSuggestSubmissionQueueBackend(
  database: CryptoPayMapDatabase,
): SuggestSubmissionQueueBackend {
  return {
    async loadPage(query): Promise<SuggestSubmissionQueuePageData> {
      const suggestionKind = sql<string>`${submissionPayloads.normalizedPayload} #>> '{suggestionKind}'`;
      const name = sql<string>`${submissionPayloads.normalizedPayload} #>> '{entity,name}'`;
      const evidenceCount = sql<number>`coalesce(jsonb_array_length(${submissionPayloads.normalizedPayload} -> 'evidenceLinks'), 0)`;

      const rows = await database
        .select({
          id: submissions.id,
          publicId: submissions.publicId,
          suggestionKind,
          name,
          workflowStatus: submissions.workflowStatus,
          priority: submissions.priority,
          relationship: submissions.relationship,
          evidenceCount,
          submittedAt: submissions.submittedAt,
          updatedAt: submissions.updatedAt,
        })
        .from(submissions)
        .innerJoin(submissionPayloads, eq(submissionPayloads.submissionId, submissions.id))
        .where(
          and(
            eq(submissions.submissionType, 'suggest'),
            isNotNull(submissionPayloads.normalizedPayload),
            query.statuses.length > 0
              ? inArray(submissions.workflowStatus, query.statuses)
              : undefined,
            cursorFilter(query),
          ),
        )
        .orderBy(desc(submissions.priority), asc(submissions.submittedAt), asc(submissions.id))
        .limit(query.limit + 1);

      const hasNextPage = rows.length > query.limit;
      const pageRows = hasNextPage ? rows.slice(0, query.limit) : rows;
      const items: SuggestSubmissionQueueItem[] = pageRows.map((row) => ({
        id: row.id,
        publicId: row.publicId,
        suggestionKind: row.suggestionKind as SuggestSubmissionQueueItem['suggestionKind'],
        name: row.name,
        workflowStatus: row.workflowStatus,
        priority: row.priority,
        relationship: row.relationship as SuggestSubmissionQueueItem['relationship'],
        evidenceCount: row.evidenceCount,
        submittedAt: row.submittedAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }));

      const lastRow = pageRows.at(-1);
      return {
        items,
        hasNextPage,
        nextCursor:
          hasNextPage && lastRow
            ? encodeSuggestSubmissionQueueCursor({
                priority: lastRow.priority,
                submittedAt: lastRow.submittedAt.toISOString(),
                id: lastRow.id,
              })
            : null,
      };
    },
  };
}
