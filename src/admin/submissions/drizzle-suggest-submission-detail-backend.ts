import { and, asc, eq } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { submissionEvents, submissionPayloads, submissions } from '../../db/schema';
import type {
  SuggestSubmissionReviewDetailBackend,
  SuggestSubmissionReviewDetailData,
} from './detail';

const eventLimit = 100;

export function createDrizzleSuggestSubmissionDetailBackend(
  database: CryptoPayMapDatabase,
): SuggestSubmissionReviewDetailBackend {
  return {
    async loadDetail(submissionId): Promise<SuggestSubmissionReviewDetailData | null> {
      const rows = await database
        .select({
          id: submissions.id,
          publicId: submissions.publicId,
          workflowStatus: submissions.workflowStatus,
          resolution: submissions.resolution,
          priority: submissions.priority,
          relationship: submissions.relationship,
          submittedAt: submissions.submittedAt,
          updatedAt: submissions.updatedAt,
          normalizedPayload: submissionPayloads.normalizedPayload,
        })
        .from(submissions)
        .innerJoin(submissionPayloads, eq(submissionPayloads.submissionId, submissions.id))
        .where(and(eq(submissions.id, submissionId), eq(submissions.submissionType, 'suggest')))
        .limit(1);
      const row = rows[0];
      if (row === undefined || row.normalizedPayload === null || row.relationship === null) return null;

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
          workflowStatus: row.workflowStatus,
          resolution: row.resolution,
          priority: row.priority,
          relationship: row.relationship,
          submittedAt: row.submittedAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        },
        projection:
          row.normalizedPayload as SuggestSubmissionReviewDetailData['projection'],
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
