import { z } from 'zod';
import { parseNegativeReportEvidenceEvent } from '../../submissions/negative-report-evidence-contract';
import {
  evaluateReconfirmationClaim,
  type ReconfirmationClaimSnapshot,
} from '../reconfirmation/queue';
import type { SubmissionApplicationLifecycleRecord } from './application-lifecycle';

const timestampSchema = z.iso.datetime({ offset: true });
const resolutionEventTypeSchema = z.enum([
  'reconfirmed',
  'restored',
  'marked_stale',
  'ended',
  'corrected',
]);

export const negativeRecheckApplicationProjectionSchema = z
  .object({
    schemaVersion: z.literal('negative-recheck-application-projection-v1'),
    generatedAt: timestampSchema,
    application: z
      .object({
        applicationId: z.uuid(),
        submissionId: z.uuid(),
        submissionType: z.enum(['payment_report', 'problem_report']),
        sourceDecisionEventId: z.uuid(),
        applicationStatus: z.literal('committed'),
        publicationStatus: z.enum(['pending', 'committed', 'failed']),
        receiptKind: z.literal('submission_event'),
        receiptEventId: z.uuid(),
      })
      .strict(),
    signal: z
      .object({
        status: z.enum(['active', 'resolved']),
        decisionEventId: z.uuid(),
        evidenceId: z.uuid(),
        claimId: z.uuid(),
        signalAt: timestampSchema,
        claimStatus: z.enum(['candidate', 'confirmed', 'stale', 'ended', 'rejected']),
        claimVisibility: z.enum(['public', 'hidden', 'temporarily_hidden']),
        nextReviewAt: timestampSchema.nullable(),
        queueProjection: z
          .object({
            queueReason: z.enum([
              'overdue',
              'negative_evidence',
              'missing_deadline',
              'stale_review',
              'due_soon',
            ]),
            recommendedAction: z.enum(['mark_stale', 'review']),
            dueAt: timestampSchema.nullable(),
            daysUntilReview: z.number().int().nullable(),
            priority: z.number().int().min(0).max(999),
          })
          .strict()
          .nullable(),
        resolution: z
          .object({
            verificationEventId: z.uuid(),
            eventType: resolutionEventTypeSchema,
            effectiveAt: timestampSchema,
          })
          .strict()
          .nullable(),
      })
      .strict(),
  })
  .strict();

export type NegativeRecheckApplicationProjection = z.infer<
  typeof negativeRecheckApplicationProjectionSchema
>;

export interface NegativeRecheckApplicationReadContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:negative-recheck-application:read'];
}

export interface NegativeRecheckDecisionState {
  submission: {
    submissionId: string;
    submissionType: string;
    workflowStatus: string;
    resolution: string | null;
  };
  event: {
    eventId: string;
    submissionId: string;
    fromStatus: string | null;
    toStatus: string;
    action: string;
    reasonCode: string | null;
    internalNote: string | null;
    createdAt: string;
  } | null;
}

export interface NegativeRecheckEvidenceClaimState {
  evidence: {
    evidenceId: string;
    claimId: string | null;
    submissionId: string | null;
    originRole: string;
    polarity: string;
    visibility: string;
    reviewStatus: string;
    createdAt: string;
    deletedAt: string | null;
  };
  claim: {
    claimId: string;
    claimStatus: 'candidate' | 'confirmed' | 'stale' | 'ended' | 'rejected';
    visibility: 'public' | 'hidden' | 'temporarily_hidden';
    lastConfirmedAt: string | null;
    nextReviewAt: string | null;
    updatedAt: string;
    deletedAt: string | null;
  } | null;
}

export interface NegativeRecheckResolutionEventState {
  verificationEventId: string;
  claimId: string;
  eventType: string;
  effectiveAt: string;
}

export interface NegativeRecheckApplicationBackend {
  readApplication(applicationId: string): Promise<SubmissionApplicationLifecycleRecord | null>;
  readDecisionState(
    submissionId: string,
    decisionEventId: string,
  ): Promise<NegativeRecheckDecisionState | null>;
  readEvidenceClaim(evidenceId: string): Promise<NegativeRecheckEvidenceClaimState | null>;
  readResolutionEvent(
    claimId: string,
    signalAt: Date,
  ): Promise<NegativeRecheckResolutionEventState | null>;
}

export class NegativeRecheckApplicationError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'invalid_request'
      | 'not_found'
      | 'ineligible'
      | 'backend_failure',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NegativeRecheckApplicationError';
  }
}

function assertApplication(application: SubmissionApplicationLifecycleRecord): void {
  if (
    !['payment_report', 'problem_report'].includes(application.submissionType) ||
    application.sourceDecisionKind !== 'negative_report_evidence' ||
    application.applicationKind !== 'report_evidence' ||
    application.applicationStatus !== 'committed' ||
    application.publicationStatus === 'blocked' ||
    application.applicationReceipt?.kind !== 'submission_event' ||
    application.applicationReceipt.ids.length !== 1 ||
    application.applicationReceipt.ids[0] !== application.sourceDecisionEventId
  ) {
    throw new NegativeRecheckApplicationError(
      'ineligible',
      'The application is not an exact committed negative-report Evidence application.',
    );
  }
}

function assertDecision(
  application: SubmissionApplicationLifecycleRecord,
  state: NegativeRecheckDecisionState,
): ReturnType<typeof parseNegativeReportEvidenceEvent> {
  const payload = parseNegativeReportEvidenceEvent(state.event?.internalNote ?? null);
  if (
    state.submission.submissionId !== application.submissionId ||
    state.submission.submissionType !== application.submissionType ||
    state.submission.workflowStatus !== 'resolved' ||
    state.submission.resolution !== 'approved' ||
    state.event === null ||
    state.event.eventId !== application.sourceDecisionEventId ||
    state.event.submissionId !== application.submissionId ||
    state.event.fromStatus !== 'in_review' ||
    state.event.toStatus !== 'resolved' ||
    state.event.action !== 'negative_report_evidence_decided' ||
    state.event.reasonCode !== 'negative_evidence_recheck_priority' ||
    payload === null ||
    payload.decision !== 'accept_and_prioritize_recheck'
  ) {
    throw new NegativeRecheckApplicationError(
      'ineligible',
      'The application does not reference an exact priority-recheck decision event.',
    );
  }
  return payload;
}

function assertEvidenceClaim(
  application: SubmissionApplicationLifecycleRecord,
  evidenceId: string,
  claimId: string,
  state: NegativeRecheckEvidenceClaimState,
): ReconfirmationClaimSnapshot {
  const evidence = state.evidence;
  const claim = state.claim;
  if (
    evidence.evidenceId !== evidenceId ||
    evidence.claimId !== claimId ||
    evidence.submissionId !== application.submissionId ||
    evidence.originRole !== 'usage_side' ||
    evidence.polarity !== 'contradicting' ||
    !['private', 'restricted'].includes(evidence.visibility) ||
    evidence.reviewStatus !== 'accepted' ||
    evidence.deletedAt !== null ||
    claim === null ||
    claim.claimId !== claimId ||
    claim.deletedAt !== null
  ) {
    throw new NegativeRecheckApplicationError(
      'ineligible',
      'The priority-recheck signal does not have its exact retained Evidence and Claim.',
    );
  }
  return {
    id: claim.claimId,
    claimStatus: claim.claimStatus,
    visibility: claim.visibility,
    lastConfirmedAt: claim.lastConfirmedAt,
    nextReviewAt: claim.nextReviewAt,
    updatedAt: claim.updatedAt,
    deletedAt: claim.deletedAt,
  };
}

function resolutionProjection(
  resolution: NegativeRecheckResolutionEventState | null,
  claimId: string,
  signalAt: string,
): NegativeRecheckApplicationProjection['signal']['resolution'] {
  if (resolution === null) return null;
  const eventType = resolutionEventTypeSchema.safeParse(resolution.eventType);
  if (
    resolution.claimId !== claimId ||
    !eventType.success ||
    Date.parse(resolution.effectiveAt) < Date.parse(signalAt)
  ) {
    throw new NegativeRecheckApplicationError(
      'ineligible',
      'The priority-recheck resolution event is inconsistent with the signal.',
    );
  }
  return {
    verificationEventId: resolution.verificationEventId,
    eventType: eventType.data,
    effectiveAt: resolution.effectiveAt,
  };
}

export async function readNegativeRecheckApplication(
  context: NegativeRecheckApplicationReadContext,
  backend: NegativeRecheckApplicationBackend,
  applicationId: string,
  generatedAt = new Date(),
): Promise<NegativeRecheckApplicationProjection> {
  if (!context.capabilities.includes('submission:negative-recheck-application:read')) {
    throw new NegativeRecheckApplicationError(
      'unauthorized',
      'The actor is not authorized to read negative recheck application state.',
    );
  }
  const applicationIdResult = z.uuid().safeParse(applicationId);
  if (!applicationIdResult.success || Number.isNaN(generatedAt.getTime())) {
    throw new NegativeRecheckApplicationError(
      'invalid_request',
      'The negative recheck application request is invalid.',
    );
  }

  let application: SubmissionApplicationLifecycleRecord | null;
  try {
    application = await backend.readApplication(applicationIdResult.data);
  } catch (error) {
    throw new NegativeRecheckApplicationError(
      'backend_failure',
      'The negative recheck application could not be loaded.',
      { cause: error },
    );
  }
  if (application === null) {
    throw new NegativeRecheckApplicationError(
      'not_found',
      'The negative recheck application was not found.',
    );
  }
  assertApplication(application);

  let decisionState: NegativeRecheckDecisionState | null;
  try {
    decisionState = await backend.readDecisionState(
      application.submissionId,
      application.sourceDecisionEventId,
    );
  } catch (error) {
    throw new NegativeRecheckApplicationError(
      'backend_failure',
      'The negative recheck decision chain could not be loaded.',
      { cause: error },
    );
  }
  if (decisionState === null) {
    throw new NegativeRecheckApplicationError(
      'not_found',
      'The negative recheck decision was not found.',
    );
  }
  const decisionPayload = assertDecision(application, decisionState);

  let evidenceClaim: NegativeRecheckEvidenceClaimState | null;
  try {
    evidenceClaim = await backend.readEvidenceClaim(decisionPayload.evidenceId);
  } catch (error) {
    throw new NegativeRecheckApplicationError(
      'backend_failure',
      'The negative recheck Evidence chain could not be loaded.',
      { cause: error },
    );
  }
  if (evidenceClaim === null) {
    throw new NegativeRecheckApplicationError(
      'not_found',
      'The negative recheck Evidence was not found.',
    );
  }
  const claimSnapshot = assertEvidenceClaim(
    application,
    decisionPayload.evidenceId,
    decisionPayload.claimId,
    evidenceClaim,
  );
  const signalAt = evidenceClaim.evidence.createdAt;
  if (signalAt !== decisionState.event?.createdAt) {
    throw new NegativeRecheckApplicationError(
      'ineligible',
      'The Evidence and decision event do not share the exact decision time.',
    );
  }

  let resolutionState: NegativeRecheckResolutionEventState | null;
  try {
    resolutionState = await backend.readResolutionEvent(
      decisionPayload.claimId,
      new Date(signalAt),
    );
  } catch (error) {
    throw new NegativeRecheckApplicationError(
      'backend_failure',
      'The negative recheck resolution state could not be loaded.',
      { cause: error },
    );
  }
  const resolution = resolutionProjection(resolutionState, decisionPayload.claimId, signalAt);
  let queueProjection: NegativeRecheckApplicationProjection['signal']['queueProjection'] = null;
  if (resolution === null) {
    if (!['confirmed', 'stale'].includes(claimSnapshot.claimStatus)) {
      throw new NegativeRecheckApplicationError(
        'ineligible',
        'An unresolved priority-recheck signal requires a confirmed or stale Claim.',
      );
    }
    const queueItem = evaluateReconfirmationClaim(
      claimSnapshot,
      generatedAt,
      { dueSoonDays: 30 },
      signalAt,
    );
    if (queueItem === null) {
      throw new NegativeRecheckApplicationError(
        'ineligible',
        'The unresolved priority-recheck signal is absent from the protected queue projection.',
      );
    }
    queueProjection = {
      queueReason: queueItem.queueReason,
      recommendedAction: queueItem.recommendedAction,
      dueAt: queueItem.dueAt,
      daysUntilReview: queueItem.daysUntilReview,
      priority: queueItem.priority,
    };
  }

  return negativeRecheckApplicationProjectionSchema.parse({
    schemaVersion: 'negative-recheck-application-projection-v1',
    generatedAt: generatedAt.toISOString(),
    application: {
      applicationId: application.applicationId,
      submissionId: application.submissionId,
      submissionType: application.submissionType,
      sourceDecisionEventId: application.sourceDecisionEventId,
      applicationStatus: 'committed',
      publicationStatus: application.publicationStatus,
      receiptKind: 'submission_event',
      receiptEventId: application.sourceDecisionEventId,
    },
    signal: {
      status: resolution === null ? 'active' : 'resolved',
      decisionEventId: application.sourceDecisionEventId,
      evidenceId: decisionPayload.evidenceId,
      claimId: decisionPayload.claimId,
      signalAt,
      claimStatus: claimSnapshot.claimStatus,
      claimVisibility: claimSnapshot.visibility,
      nextReviewAt: claimSnapshot.nextReviewAt,
      queueProjection,
      resolution,
    },
  });
}
