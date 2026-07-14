import { and, asc, eq } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { submissionEvents, submissionPayloads, submissions } from '../../db/schema';
import {
  BusinessClaimSubmissionReviewDetailError,
  type BusinessClaimSubmissionReviewDetailBackend,
  type BusinessClaimSubmissionReviewDetailData,
} from './business-claim-detail';

const eventLimit = 100;

export function createDrizzleBusinessClaimSubmissionDetailBackend(
  database: CryptoPayMapDatabase,
): BusinessClaimSubmissionReviewDetailBackend {
  return {
    async loadDetail(submissionId): Promise<BusinessClaimSubmissionReviewDetailData | null> {
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
        .where(and(eq(submissions.id, submissionId), eq(submissions.submissionType, 'claim')))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      if (row.normalizedPayload === null || row.targetType === null || row.targetId === null) {
        throw new BusinessClaimSubmissionReviewDetailError(
          'invalid_detail',
          'The stored Business Claim Submission detail is incomplete.',
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
          submissionType: 'claim',
          targetType: row.targetType as 'entity' | 'location',
          targetId: row.targetId,
          workflowStatus: row.workflowStatus,
          resolution: row.resolution,
          priority: row.priority,
          submittedAt: row.submittedAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        },
        projection:
          row.normalizedPayload as BusinessClaimSubmissionReviewDetailData['projection'],
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
