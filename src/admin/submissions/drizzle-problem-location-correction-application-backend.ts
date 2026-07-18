import { and, eq, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  locationProfileCorrectionDecisions,
  locations,
  sourceRecords,
  sources,
  submissionEvents,
  submissionPayloads,
  submissions,
} from '../../db/schema';
import { createDrizzleLocationCorrectionBackend } from '../location-correction/drizzle-backend';
import { createLocationCorrectionDecisionService } from '../location-correction/decision';
import { createDrizzleSubmissionApplicationLifecycleBackend } from './drizzle-application-lifecycle-backend';
import type {
  ProblemLocationCorrectionApplicationBackend,
  ProblemLocationCorrectionApplicationState,
} from './problem-location-correction-application';

export function createDrizzleProblemLocationCorrectionApplicationBackend(
  database: CryptoPayMapDatabase,
): ProblemLocationCorrectionApplicationBackend {
  const lifecycle = createDrizzleSubmissionApplicationLifecycleBackend(database);
  return {
    ...lifecycle,

    async readApplicationState(applicationId, correctionRequestId) {
      const application = await lifecycle.readApplication(applicationId);
      if (application === null) return null;

      const submissionRows = await database
        .select({
          submissionId: submissions.id,
          publicId: submissions.publicId,
          submissionType: submissions.submissionType,
          targetType: submissions.targetType,
          targetId: submissions.targetId,
          workflowStatus: submissions.workflowStatus,
          resolution: submissions.resolution,
          normalizedPayload: submissionPayloads.normalizedPayload,
          eventId: submissionEvents.id,
          eventSubmissionId: submissionEvents.submissionId,
          eventToStatus: submissionEvents.toStatus,
          eventAction: submissionEvents.action,
          eventInternalNote: submissionEvents.internalNote,
          eventCreatedAt: submissionEvents.createdAt,
        })
        .from(submissions)
        .innerJoin(submissionPayloads, eq(submissionPayloads.submissionId, submissions.id))
        .leftJoin(
          submissionEvents,
          and(
            eq(submissionEvents.id, application.sourceDecisionEventId),
            eq(submissionEvents.submissionId, submissions.id),
          ),
        )
        .where(eq(submissions.id, application.submissionId))
        .limit(1);
      const submission = submissionRows[0];
      if (submission === undefined) return null;

      const locationRows =
        submission.targetId === null
          ? []
          : await database
              .select({
                locationId: locations.id,
                updatedAt: locations.updatedAt,
                deletedAt: locations.deletedAt,
              })
              .from(locations)
              .where(eq(locations.id, submission.targetId))
              .limit(1);
      const location = locationRows[0];

      const correctionRows = await database
        .select({
          requestId: locationProfileCorrectionDecisions.requestId,
          locationId: locationProfileCorrectionDecisions.locationId,
          changedFieldPaths: locationProfileCorrectionDecisions.changedFieldPaths,
          decidedAt: locationProfileCorrectionDecisions.decidedAt,
        })
        .from(locationProfileCorrectionDecisions)
        .where(eq(locationProfileCorrectionDecisions.requestId, correctionRequestId))
        .limit(1);
      const correction = correctionRows[0];

      return {
        application,
        submission: {
          submissionId: submission.submissionId,
          publicId: submission.publicId,
          submissionType: submission.submissionType,
          targetType: submission.targetType,
          targetId: submission.targetId,
          workflowStatus: submission.workflowStatus,
          resolution: submission.resolution,
          normalizedPayload: submission.normalizedPayload,
        },
        sourceDecisionEvent:
          submission.eventId === null ||
          submission.eventSubmissionId === null ||
          submission.eventToStatus === null ||
          submission.eventAction === null ||
          submission.eventCreatedAt === null
            ? null
            : {
                eventId: submission.eventId,
                submissionId: submission.eventSubmissionId,
                toStatus: submission.eventToStatus,
                action: submission.eventAction,
                internalNote: submission.eventInternalNote,
                createdAt: submission.eventCreatedAt.toISOString(),
              },
        location:
          location === undefined
            ? null
            : {
                locationId: location.locationId,
                updatedAt: location.updatedAt.toISOString(),
                deletedAt: location.deletedAt?.toISOString() ?? null,
              },
        correctionDecision:
          correction === undefined
            ? null
            : {
                requestId: correction.requestId,
                locationId: correction.locationId,
                changedFieldPaths: correction.changedFieldPaths,
                decidedAt: correction.decidedAt.toISOString(),
              },
      } satisfies ProblemLocationCorrectionApplicationState;
    },

    async applyLocationCorrection(context, input, sourceRecord) {
      const correctionBackend = createDrizzleLocationCorrectionBackend(database, {
        prefixStatements: (command) => [
          database.select({
            guard: sql<number>`1 / case when exists (
              select 1
              from ${sources}
              where ${sources.id} = ${sourceRecord.sourceId}
                and ${sources.sourceType} = 'user_submission'
                and ${sources.isActive} = true
            ) then 1 else 0 end`,
          }),
          database.insert(sourceRecords).values({
            id: sourceRecord.id,
            sourceId: sourceRecord.sourceId,
            externalId: sourceRecord.externalId,
            sourceUrl: null,
            rawPayload: sourceRecord.rawPayload,
            observedAt: sourceRecord.observedAt,
            publishedAt: null,
            fetchedAt: sourceRecord.fetchedAt,
            contentHash: sourceRecord.contentHash,
            archiveUrl: null,
            licenseId: null,
          }),
        ],
      });
      return createLocationCorrectionDecisionService(correctionBackend).correct(context, input);
    },
  };
}
