import { z } from 'zod';
import { parseSuggestAcceptedCandidateEventPayload } from '../../submissions/accepted-candidate-contract';
import {
  transitionSubmissionApplicationLifecycle,
  type SubmissionApplicationLifecycleBackend,
  type SubmissionApplicationLifecycleRecord,
  type SubmissionApplicationTransitionReplayRecord,
} from './application-lifecycle';

const timestampSchema = z.iso.datetime({ offset: true });

export const suggestApplicationBindingRequestSchema = z
  .object({
    schemaVersion: z.literal('suggest-application-binding-v1'),
    requestId: z.uuid(),
    promotionDecisionId: z.uuid(),
    expectedApplicationUpdatedAt: timestampSchema,
  })
  .strict();

export const suggestApplicationBindingReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed', 'already_bound']),
    applicationId: z.uuid(),
    submissionId: z.uuid(),
    candidateId: z.uuid(),
    promotionDecisionId: z.uuid(),
    applicationStatus: z.literal('committed'),
    publicationStatus: z.enum(['pending', 'committed', 'failed']),
    transitionEventId: z.uuid().nullable(),
    boundAt: timestampSchema,
  })
  .strict();

export type SuggestApplicationBindingRequest = z.infer<
  typeof suggestApplicationBindingRequestSchema
>;
export type SuggestApplicationBindingReceipt = z.infer<
  typeof suggestApplicationBindingReceiptSchema
>;

export interface SuggestApplicationBindingContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:suggest-application:bind'];
}

export interface SuggestApplicationBindingState {
  application: SubmissionApplicationLifecycleRecord;
  submission: {
    submissionId: string;
    submissionType: string;
    workflowStatus: string;
    resolution: string | null;
  };
  sourceDecisionEvent: {
    eventId: string;
    submissionId: string;
    toStatus: string;
    action: string;
    internalNote: string | null;
    createdAt: string;
  } | null;
  promotionDecision: {
    promotionDecisionId: string;
    candidateId: string;
    entityId: string;
    locationId: string | null;
    claimId: string;
    promotedAt: string;
  } | null;
  candidate: {
    candidateId: string;
    candidateStatus: string;
    canonicalEntityId: string | null;
    canonicalLocationId: string | null;
  } | null;
}

export interface SuggestApplicationBindingBackend extends SubmissionApplicationLifecycleBackend {
  readBindingState(
    applicationId: string,
    promotionDecisionId: string,
  ): Promise<SuggestApplicationBindingState | null>;
}

export class SuggestApplicationBindingError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'invalid_request'
      | 'not_found'
      | 'ineligible'
      | 'conflict'
      | 'idempotency_conflict'
      | 'backend_failure',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SuggestApplicationBindingError';
  }
}

function validateBinding(
  state: SuggestApplicationBindingState,
  request: SuggestApplicationBindingRequest,
): string {
  const { application, submission, sourceDecisionEvent, promotionDecision, candidate } = state;
  const payload = parseSuggestAcceptedCandidateEventPayload(
    sourceDecisionEvent?.internalNote ?? null,
  );
  if (
    application.submissionType !== 'suggest' ||
    application.sourceDecisionKind !== 'suggest_candidate_acceptance' ||
    application.applicationKind !== 'candidate_resolution' ||
    application.submissionId !== submission.submissionId ||
    submission.submissionType !== 'suggest' ||
    submission.workflowStatus !== 'resolved' ||
    submission.resolution !== 'accepted_as_candidate' ||
    sourceDecisionEvent === null ||
    sourceDecisionEvent.eventId !== application.sourceDecisionEventId ||
    sourceDecisionEvent.submissionId !== application.submissionId ||
    sourceDecisionEvent.toStatus !== 'resolved' ||
    sourceDecisionEvent.action !== 'submission_accepted_as_candidate' ||
    payload === null ||
    promotionDecision === null ||
    promotionDecision.promotionDecisionId !== request.promotionDecisionId ||
    promotionDecision.candidateId !== payload.candidateId ||
    candidate === null ||
    candidate.candidateId !== payload.candidateId ||
    candidate.candidateStatus !== 'promoted' ||
    candidate.canonicalEntityId !== promotionDecision.entityId ||
    candidate.canonicalLocationId !== promotionDecision.locationId ||
    Date.parse(promotionDecision.promotedAt) < Date.parse(sourceDecisionEvent.createdAt)
  ) {
    throw new SuggestApplicationBindingError(
      'ineligible',
      'The Candidate promotion receipt is not eligible for this Suggest application.',
    );
  }
  return payload.candidateId;
}

function alreadyBoundReceipt(
  state: SuggestApplicationBindingState,
  request: SuggestApplicationBindingRequest,
  candidateId: string,
): SuggestApplicationBindingReceipt {
  const { application } = state;
  if (
    application.applicationStatus !== 'committed' ||
    application.publicationStatus === 'blocked' ||
    application.applicationReceipt?.kind !== 'candidate_promotion_decision' ||
    application.applicationReceipt.ids.length !== 1 ||
    application.applicationReceipt.ids[0] !== request.promotionDecisionId
  ) {
    throw new SuggestApplicationBindingError(
      'conflict',
      'The Suggest application is not pending or bound to the exact promotion receipt.',
    );
  }
  return suggestApplicationBindingReceiptSchema.parse({
    state: 'already_bound',
    applicationId: application.applicationId,
    submissionId: application.submissionId,
    candidateId,
    promotionDecisionId: request.promotionDecisionId,
    applicationStatus: 'committed',
    publicationStatus: application.publicationStatus,
    transitionEventId: null,
    boundAt: application.updatedAt,
  });
}

async function readStateAndReplay(
  backend: SuggestApplicationBindingBackend,
  applicationId: string,
  request: SuggestApplicationBindingRequest,
): Promise<{
  state: SuggestApplicationBindingState;
  replay: SubmissionApplicationTransitionReplayRecord | null;
}> {
  try {
    const [state, replay] = await Promise.all([
      backend.readBindingState(applicationId, request.promotionDecisionId),
      backend.readTransition(request.requestId),
    ]);
    if (state === null) {
      throw new SuggestApplicationBindingError(
        'not_found',
        'The Suggest application or promotion receipt was not found.',
      );
    }
    return { state, replay };
  } catch (error) {
    if (error instanceof SuggestApplicationBindingError) throw error;
    throw new SuggestApplicationBindingError(
      'backend_failure',
      'The Suggest application binding state could not be loaded.',
      { cause: error },
    );
  }
}

export async function bindSuggestApplicationReceipt(
  context: SuggestApplicationBindingContext,
  backend: SuggestApplicationBindingBackend,
  applicationId: string,
  rawRequest: unknown,
  boundAt = new Date(),
): Promise<SuggestApplicationBindingReceipt> {
  if (!context.capabilities.includes('submission:suggest-application:bind')) {
    throw new SuggestApplicationBindingError(
      'unauthorized',
      'The actor is not authorized to bind Suggest application receipts.',
    );
  }
  const applicationIdResult = z.uuid().safeParse(applicationId);
  const requestResult = suggestApplicationBindingRequestSchema.safeParse(rawRequest);
  if (!applicationIdResult.success || !requestResult.success || Number.isNaN(boundAt.getTime())) {
    throw new SuggestApplicationBindingError(
      'invalid_request',
      'The Suggest application binding request is invalid.',
    );
  }
  const request = requestResult.data;
  const { state, replay } = await readStateAndReplay(backend, applicationIdResult.data, request);
  const candidateId = validateBinding(state, request);

  if (replay === null && state.application.applicationStatus === 'committed') {
    if (state.application.updatedAt !== request.expectedApplicationUpdatedAt) {
      throw new SuggestApplicationBindingError(
        'conflict',
        'The Suggest application changed before receipt binding was confirmed.',
      );
    }
    return alreadyBoundReceipt(state, request, candidateId);
  }

  if (
    replay === null &&
    (state.application.applicationStatus !== 'pending' ||
      state.application.publicationStatus !== 'blocked' ||
      state.application.updatedAt !== request.expectedApplicationUpdatedAt)
  ) {
    throw new SuggestApplicationBindingError(
      'conflict',
      'The Suggest application changed before receipt binding.',
    );
  }

  try {
    const transition = await transitionSubmissionApplicationLifecycle(
      {
        actorId: context.actorId,
        actorType: context.actorType,
        capabilities: ['submission:application:transition'],
      },
      backend,
      applicationIdResult.data,
      {
        schemaVersion: 'submission-application-transition-v1',
        requestId: request.requestId,
        operation: 'commit_application',
        expectedApplicationStatus: 'pending',
        expectedPublicationStatus: 'blocked',
        expectedUpdatedAt: request.expectedApplicationUpdatedAt,
        receipt: {
          kind: 'candidate_promotion_decision',
          ids: [request.promotionDecisionId],
        },
      },
      boundAt,
    );
    return suggestApplicationBindingReceiptSchema.parse({
      state: transition.state,
      applicationId: transition.applicationId,
      submissionId: state.application.submissionId,
      candidateId,
      promotionDecisionId: request.promotionDecisionId,
      applicationStatus: 'committed',
      publicationStatus: transition.toPublicationStatus,
      transitionEventId: transition.transitionEventId,
      boundAt: transition.changedAt,
    });
  } catch (error) {
    if (error instanceof SuggestApplicationBindingError) throw error;
    if (error !== null && typeof error === 'object' && 'code' in error) {
      const code = (error as { code?: unknown }).code;
      if (code === 'idempotency_conflict') {
        throw new SuggestApplicationBindingError(
          'idempotency_conflict',
          'The Suggest application binding UUID was already used for different content.',
          { cause: error },
        );
      }
      if (code === 'conflict') {
        throw new SuggestApplicationBindingError(
          'conflict',
          'The Suggest application changed before receipt binding committed.',
          { cause: error },
        );
      }
    }
    throw new SuggestApplicationBindingError(
      'backend_failure',
      'The Suggest application receipt could not be bound.',
      { cause: error },
    );
  }
}
