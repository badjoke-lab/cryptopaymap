import { and, asc, desc, eq, gt, inArray, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { submissionPayloads, submissions } from '../../db/schema';
import {
  encodeReportSubmissionQueueCursor,
  ReportSubmissionQueueError,
  type ReportSubmissionQueueBackend,
  type ReportSubmissionQueueItem,
  type ReportSubmissionQueuePageData,
  type ReportSubmissionQueueQuery,
} from './report-queue';

function cursorFilter(query: ReportSubmissionQueueQuery): SQL | undefined {
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

export interface ReportSubmissionQueueIdentityRow {
  submissionType: string;
  storedTargetType: string | null;
  storedTargetId: string | null;
  normalizedReportKind: string;
  normalizedTargetType: string;
  normalizedTargetId: string;
}

export function assertReportSubmissionQueueIdentity(
  row: ReportSubmissionQueueIdentityRow,
): void {
  if (
    row.submissionType !== row.normalizedReportKind ||
    row.storedTargetType !== row.normalizedTargetType ||
    row.storedTargetId !== row.normalizedTargetId
  ) {
    throw new ReportSubmissionQueueError(
      'invalid_page',
      'Stored report metadata does not match the normalized report projection.',
    );
  }
}

export function createDrizzleReportSubmissionQueueBackend(
  database: CryptoPayMapDatabase,
): ReportSubmissionQueueBackend {
  return {
    async loadPage(query): Promise<ReportSubmissionQueuePageData> {
      const reportKind = sql<string>`${submissionPayloads.normalizedPayload} #>> '{reportKind}'`;
      const targetType = sql<string>`${submissionPayloads.normalizedPayload} #>> '{targetType}'`;
      const targetId = sql<string>`${submissionPayloads.normalizedPayload} #>> '{targetId}'`;
      const paymentResult = sql<
        string | null
      >`${submissionPayloads.normalizedPayload} #>> '{result}'`;
      const problemType = sql<
        string | null
      >`${submissionPayloads.normalizedPayload} #>> '{reportType}'`;
      const evidenceCount = sql<number>`coalesce(jsonb_array_length(${submissionPayloads.normalizedPayload} -> 'evidenceLinks'), 0)`;

      const rows = await database
        .select({
          id: submissions.id,
          publicId: submissions.publicId,
          submissionType: submissions.submissionType,
          storedTargetType: submissions.targetType,
          storedTargetId: submissions.targetId,
          normalizedReportKind: reportKind,
          normalizedTargetType: targetType,
          normalizedTargetId: targetId,
          paymentResult,
          problemType,
          workflowStatus: submissions.workflowStatus,
          priority: submissions.priority,
          evidenceCount,
          submittedAt: submissions.submittedAt,
          updatedAt: submissions.updatedAt,
        })
        .from(submissions)
        .innerJoin(submissionPayloads, eq(submissionPayloads.submissionId, submissions.id))
        .where(
          and(
            inArray(submissions.submissionType, ['payment_report', 'problem_report']),
            isNotNull(submissionPayloads.normalizedPayload),
            inArray(submissions.workflowStatus, query.statuses),
            cursorFilter(query),
          ),
        )
        .orderBy(desc(submissions.priority), asc(submissions.submittedAt), asc(submissions.id))
        .limit(query.limit + 1);

      const hasNextPage = rows.length > query.limit;
      const pageRows = hasNextPage ? rows.slice(0, query.limit) : rows;
      const items: ReportSubmissionQueueItem[] = pageRows.map((row) => {
        assertReportSubmissionQueueIdentity(row);
        return {
          id: row.id,
          publicId: row.publicId,
          reportKind: row.submissionType as ReportSubmissionQueueItem['reportKind'],
          targetType: row.storedTargetType as ReportSubmissionQueueItem['targetType'],
          targetId: row.storedTargetId as string,
          paymentResult: row.paymentResult as ReportSubmissionQueueItem['paymentResult'],
          problemType: row.problemType as ReportSubmissionQueueItem['problemType'],
          workflowStatus: row.workflowStatus,
          priority: row.priority,
          evidenceCount: row.evidenceCount,
          submittedAt: row.submittedAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      });

      const lastRow = pageRows.at(-1);
      return {
        items,
        hasNextPage,
        nextCursor:
          hasNextPage && lastRow
            ? encodeReportSubmissionQueueCursor({
                priority: lastRow.priority,
                submittedAt: lastRow.submittedAt.toISOString(),
                id: lastRow.id,
              })
            : null,
      };
    },
  };
}
