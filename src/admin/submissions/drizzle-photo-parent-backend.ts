import { and, asc, desc, eq, gt, inArray, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { submissionEvents, submissionPayloads, submissions } from '../../db/schema';
import {
  encodePhotoSubmissionQueueCursor,
  PhotoParentReviewError,
  type PhotoSubmissionDetailBackend,
  type PhotoSubmissionDetailData,
  type PhotoSubmissionQueueBackend,
  type PhotoSubmissionQueueItem,
  type PhotoSubmissionQueuePageData,
  type PhotoSubmissionQueueQuery,
} from './photo-parent';

const eventLimit = 100;

function cursorFilter(query: PhotoSubmissionQueueQuery): SQL | undefined {
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

function assertIdentity(row: {
  submissionType: string;
  storedTargetType: string | null;
  storedTargetId: string | null;
  normalizedTargetType: string;
  normalizedTargetId: string;
}): void {
  if (
    row.submissionType !== 'photos' ||
    row.storedTargetType !== row.normalizedTargetType ||
    row.storedTargetId !== row.normalizedTargetId
  ) {
    throw new PhotoParentReviewError(
      'invalid_page',
      'Stored Photos metadata does not match the normalized review projection.',
    );
  }
}

export function createDrizzlePhotoSubmissionQueueBackend(
  database: CryptoPayMapDatabase,
): PhotoSubmissionQueueBackend {
  return {
    async loadPage(query): Promise<PhotoSubmissionQueuePageData> {
      const targetType = sql<string>`${submissionPayloads.normalizedPayload} #>> '{targetType}'`;
      const targetId = sql<string>`${submissionPayloads.normalizedPayload} #>> '{targetId}'`;
      const relationship = sql<string>`${submissionPayloads.normalizedPayload} #>> '{relationship}'`;
      const mediaCount = sql<number>`jsonb_array_length(${submissionPayloads.normalizedPayload} -> 'media')`;

      const rows = await database
        .select({
          id: submissions.id,
          publicId: submissions.publicId,
          submissionType: submissions.submissionType,
          storedTargetType: submissions.targetType,
          storedTargetId: submissions.targetId,
          normalizedTargetType: targetType,
          normalizedTargetId: targetId,
          relationship,
          mediaCount,
          workflowStatus: submissions.workflowStatus,
          priority: submissions.priority,
          submittedAt: submissions.submittedAt,
          updatedAt: submissions.updatedAt,
        })
        .from(submissions)
        .innerJoin(submissionPayloads, eq(submissionPayloads.submissionId, submissions.id))
        .where(
          and(
            eq(submissions.submissionType, 'photos'),
            isNotNull(submissionPayloads.normalizedPayload),
            inArray(submissions.workflowStatus, query.statuses),
            cursorFilter(query),
          ),
        )
        .orderBy(desc(submissions.priority), asc(submissions.submittedAt), asc(submissions.id))
        .limit(query.limit + 1);

      const hasNextPage = rows.length > query.limit;
      const pageRows = hasNextPage ? rows.slice(0, query.limit) : rows;
      const items: PhotoSubmissionQueueItem[] = pageRows.map((row) => {
        assertIdentity(row);
        return {
          id: row.id,
          publicId: row.publicId,
          targetType: row.storedTargetType as PhotoSubmissionQueueItem['targetType'],
          targetId: row.storedTargetId as string,
          workflowStatus: row.workflowStatus,
          priority: row.priority,
          mediaCount: row.mediaCount,
          relationship: row.relationship as PhotoSubmissionQueueItem['relationship'],
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
            ? encodePhotoSubmissionQueueCursor({
                priority: lastRow.priority,
                submittedAt: lastRow.submittedAt.toISOString(),
                id: lastRow.id,
              })
            : null,
      };
    },
  };
}

export function createDrizzlePhotoSubmissionDetailBackend(
  database: CryptoPayMapDatabase,
): PhotoSubmissionDetailBackend {
  return {
    async loadDetail(submissionId): Promise<PhotoSubmissionDetailData | null> {
      const rows = await database
        .select({
          id: submissions.id,
          publicId: submissions.publicId,
          submissionType: submissions.submissionType,
          targetType: submissions.targetType,
          targetId: submissions.targetId,
          workflowStatus: submissions.workflowStatus,
          resolution: submissions.resolution,
          priority: submissions.priority,
          submittedAt: submissions.submittedAt,
          updatedAt: submissions.updatedAt,
          normalizedPayload: submissionPayloads.normalizedPayload,
        })
        .from(submissions)
        .leftJoin(submissionPayloads, eq(submissionPayloads.submissionId, submissions.id))
        .where(and(eq(submissions.id, submissionId), eq(submissions.submissionType, 'photos')))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      if (row.normalizedPayload === null || row.targetType === null || row.targetId === null) {
        throw new PhotoParentReviewError(
          'invalid_detail',
          'The stored Photos Submission detail is incomplete.',
        );
      }

      const eventRows = await database
        .select({
          fromStatus: submissionEvents.fromStatus,
          toStatus: submissionEvents.toStatus,
          action: submissionEvents.action,
          reasonCode: submissionEvents.reasonCode,
          actorType: submissionEvents.actorType,
          createdAt: submissionEvents.createdAt,
        })
        .from(submissionEvents)
        .where(eq(submissionEvents.submissionId, submissionId))
        .orderBy(asc(submissionEvents.createdAt), asc(submissionEvents.id))
        .limit(eventLimit + 1);

      const eventsTruncated = eventRows.length > eventLimit;
      const boundedEvents = eventsTruncated ? eventRows.slice(0, eventLimit) : eventRows;
      return {
        submission: {
          id: row.id,
          publicId: row.publicId,
          submissionType: 'photos',
          targetType: row.targetType as 'entity' | 'location',
          targetId: row.targetId,
          workflowStatus: row.workflowStatus,
          resolution: row.resolution,
          priority: row.priority,
          submittedAt: row.submittedAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        },
        projection: row.normalizedPayload as PhotoSubmissionDetailData['projection'],
        events: boundedEvents.map((event) => ({
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          action: event.action,
          reasonCode: event.reasonCode,
          actorType: event.actorType,
          createdAt: event.createdAt.toISOString(),
        })),
        eventsTruncated,
      };
    },
  };
}
