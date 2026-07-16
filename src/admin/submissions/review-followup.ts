import { z } from 'zod';
import {
  parseSubmissionHoldEventPayload,
  serializeSubmissionHoldEventPayload,
  calculateSubmissionHoldNextReviewAt,
  submissionHoldDaysSchema,
  submissionHoldPublicMessageSchema,
  submissionHoldReasonSchema,
  submissionHoldRequiredActionSchema,
} from '../../submissions/hold-contract';
import {
  parseSubmissionInformationRequestEventPayload,
  serializeSubmissionInformationRequestEventPayload,
  submissionInformationPublicMessageSchema,
  submissionInformationRequestedActionSchema,
} from '../../submissions/information-request-contract';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type { SubmissionWorkflowStatus } from '../../submissions/contract';
import type { SubmissionReviewFollowupContext } from './review-followup-authorization';

const timestampSchema = z.iso.datetime({ offset: true });

export const reviewFollowupSubmissionTypeValues = [
  'suggest',
  'payment_report',
  'problem_report',
  'photos',
] as const;
export const reviewFollowupSubmissionTypeSchema = z.enum(reviewFollowupSubmissionTypeValues);

const reviewFollowupBaseSchema = z.object({
  schemaVersion: z.literal('submission-review-followup-v1'),
  requestId: z.uuid(),
  submissionType: reviewFollowupSubmissionTypeSchema,
  expectedUpdatedAt: timestampSchema,
});

export const reviewFollowupRequestSchema = z.discriminatedUnion('action', [
  reviewFollowupBaseSchema
    .extend({
      action: z.literal('request_information'),
      expectedStatus: z.literal('in_review'),
      requestedAction: submissionInformationRequestedActionSchema,
      publicMessage: submissionInformationPublicMessageSchema,
    })
    .strict(),
  reviewFollowupBaseSchema
    .extend({
      action: z.literal('resume_after_information'),
      expectedStatus: z.literal('needs_information'),
    })
    .strict(),
  reviewFollowupBaseSchema
    .extend({
      action: z.literal('place_on_hold'),
      expectedStatus: z.literal('in_review'),
      holdDays: submissionHoldDaysSchema,
      holdReason: submissionHoldReasonSchema,
      requiredAction: submissionHoldRequiredActionSchema,
      publicMessage: submissionHoldPublicMessageSchema,
    })
    .strict(),
  reviewFollowupBaseSchema
    .extend({
      action: z.literal('resume_from_hold'),
      expectedStatus: z.literal('on_hold'),
    })
    .strict(),
]);

export const reviewFollowupReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed']),
    submissionId: z.uuid(),
    submissionType: reviewFollowupSubmissionTypeSchema,
    action: z.enum([
      'request_information',
      'resume_after_information',
      'place_on_hold',
      'resume_from_hold',
    ]),
    fromStatus: z.enum(['in_review', 'needs_information', 'on_hold']),
    toStatus: z.enum(['needs_information', 'on_hold', 'in_review']),
    requestedAction: submissionInformationRequestedActionSchema.nullable(),
    publicMessage: z
      .union([submissionInformationPublicMessageSchema, submissionHoldPublicMessageSchema])
      .nullable(),
    holdDays: submissionHoldDaysSchema.nullable(),
    nextReviewAt: timestampSchema.nullable(),
    requiredAction: submissionHoldRequiredActionSchema.nullable(),
    changedAt: timestampSchema,
  })
  .strict();

export type ReviewFollowupRequest = z.infer<typeof reviewFollowupRequestSchema>;
export type ReviewFollowupReceipt = z.infer<typeof reviewFollowupReceiptSchema>;

export interface ReviewFollowupState {
  submissionId: string;
  submissionType: string;
  workflowStatus: SubmissionWorkflowStatus;
  updatedAt: string;
}

export interface ReviewFollowupEventRecord {
  eventId: string;
  submissionId: string;
  fromStatus: SubmissionWorkflowStatus | null;
  toStatus: SubmissionWorkflowStatus;
  action: string;
  actorId: string;
  internalNote: string | null;
  createdAt: string;
}

export interface ReviewFollowupCommitCommand {
  eventId: string;
  submissionId: string;
  expectedStatus: 'in_review' | 'needs_information' | 'on_hold';
  expectedUpdatedAt: Date;
  toStatus: 'needs_information' | 'on_hold' | 'in_review';
  eventAction:
    | 'submission_information_requested'
    | 'submission_information_resumed'
    | 'submission_hold_started'
    | 'submission_hold_resumed';
  actorId: string;
  internalNote: string | null;
  changedAt: Date;
}

export interface ReviewFollowupBackend {
  readState(submissionId: string): Promise<ReviewFollowupState | null>;
  readEvent(eventId: string): Promise<ReviewFollowupEventRecord | null>;
  commitTransition(command: ReviewFollowupCommitCommand): Promise<void>;
}

export class ReviewFollowupError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'invalid_request'
      | 'not_found'
      | 'conflict'
      | 'idempotency_conflict'
      | 'backend_failure',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ReviewFollowupError';
  }
}

const actionSpecifications = {
  request_information: {
    fromStatus: 'in_review',
    toStatus: 'needs_information',
    eventAction: 'submission_information_requested',
  },
  resume_after_information: {
    fromStatus: 'needs_information',
    toStatus: 'in_review',
    eventAction: 'submission_information_resumed',
  },
  place_on_hold: {
    fromStatus: 'in_review',
    toStatus: 'on_hold',
    eventAction: 'submission_hold_started',
  },
  resume_from_hold: {
    fromStatus: 'on_hold',
    toStatus: 'in_review',
    eventAction: 'submission_hold_resumed',
  },
} as const;

function assertSubmissionType(
  state: ReviewFollowupState | null,
  request: ReviewFollowupRequest,
): ReviewFollowupState {
  if (state === null || state.submissionType !== request.submissionType) {
    throw new ReviewFollowupError('not_found', 'The requested review follow-up Submission was not found.');
  }
  return state;
}

function buildInternalNote(request: ReviewFollowupRequest, changedAt: Date): string | null {
  if (request.action === 'request_information') {
    return serializeSubmissionInformationRequestEventPayload({
      schemaVersion: 'suggest-information-request-event-v1',
      requestedAction: request.requestedAction,
      publicMessage: request.publicMessage,
    });
  }
  if (request.action === 'place_on_hold') {
    const nextReviewAt = calculateSubmissionHoldNextReviewAt(changedAt, request.holdDays);
    return serializeSubmissionHoldEventPayload({
      schemaVersion: 'suggest-hold-event-v1',
      holdDays: request.holdDays,
      nextReviewAt: nextReviewAt.toISOString(),
      holdReason: request.holdReason,
      requiredAction: request.requiredAction,
      publicMessage: request.publicMessage,
    });
  }
  return null;
}

function replayReceipt(
  event: ReviewFollowupEventRecord,
  state: ReviewFollowupState,
  request: ReviewFollowupRequest,
  actorId: string,
): ReviewFollowupReceipt {
  const specification = actionSpecifications[request.action];
  if (
    event.submissionId !== state.submissionId ||
    event.fromStatus !== specification.fromStatus ||
    event.toStatus !== specification.toStatus ||
    event.action !== specification.eventAction ||
    event.actorId !== actorId
  ) {
    throw new ReviewFollowupError(
      'idempotency_conflict',
      'The review follow-up request ID was already used for a different operation.',
    );
  }

  let requestedAction: string | null = null;
  let publicMessage: string | null = null;
  let holdDays: 30 | 60 | 90 | null = null;
  let nextReviewAt: string | null = null;
  let requiredAction: string | null = null;

  if (request.action === 'request_information') {
    const payload = parseSubmissionInformationRequestEventPayload(event.internalNote);
    if (
      payload === null ||
      payload.requestedAction !== request.requestedAction ||
      payload.publicMessage !== request.publicMessage
    ) {
      throw new ReviewFollowupError(
        'idempotency_conflict',
        'The review follow-up request ID was already used for different information-request content.',
      );
    }
    requestedAction = payload.requestedAction;
    publicMessage = payload.publicMessage;
  } else if (request.action === 'place_on_hold') {
    const payload = parseSubmissionHoldEventPayload(event.internalNote);
    if (
      payload === null ||
      payload.holdDays !== request.holdDays ||
      payload.holdReason !== request.holdReason ||
      payload.requiredAction !== request.requiredAction ||
      payload.publicMessage !== request.publicMessage
    ) {
      throw new ReviewFollowupError(
        'idempotency_conflict',
        'The review follow-up request ID was already used for different Hold content.',
      );
    }
    holdDays = payload.holdDays;
    nextReviewAt = payload.nextReviewAt;
    requiredAction = payload.requiredAction;
    publicMessage = payload.publicMessage;
  } else if (event.internalNote !== null) {
    throw new ReviewFollowupError(
      'idempotency_conflict',
      'The review follow-up request ID was already used for a different resume operation.',
    );
  }

  return reviewFollowupReceiptSchema.parse({
    state: 'replayed',
    submissionId: state.submissionId,
    submissionType: request.submissionType,
    action: request.action,
    fromStatus: specification.fromStatus,
    toStatus: specification.toStatus,
    requestedAction,
    publicMessage,
    holdDays,
    nextReviewAt,
    requiredAction,
    changedAt: event.createdAt,
  });
}

async function readState(
  backend: ReviewFollowupBackend,
  submissionId: string,
): Promise<ReviewFollowupState | null> {
  try {
    return await backend.readState(submissionId);
  } catch (error) {
    throw new ReviewFollowupError(
      'backend_failure',
      'The review follow-up Submission state could not be loaded.',
      { cause: error },
    );
  }
}

async function readEvent(
  backend: ReviewFollowupBackend,
  requestId: string,
): Promise<ReviewFollowupEventRecord | null> {
  try {
    return await backend.readEvent(requestId);
  } catch (error) {
    throw new ReviewFollowupError('backend_failure', 'The review follow-up replay check failed.', {
      cause: error,
    });
  }
}

export async function applySubmissionReviewFollowup(
  context: SubmissionReviewFollowupContext,
  backend: ReviewFollowupBackend,
  submissionId: string,
  rawRequest: unknown,
  changedAt = new Date(),
): Promise<ReviewFollowupReceipt> {
  if (!context.capabilities.includes('submission:review-followup')) {
    throw new ReviewFollowupError(
      'unauthorized',
      'The actor is not authorized for Submission review follow-up.',
    );
  }

  const idResult = z.uuid().safeParse(submissionId);
  const requestResult = reviewFollowupRequestSchema.safeParse(rawRequest);
  if (!idResult.success || !requestResult.success || Number.isNaN(changedAt.getTime())) {
    throw new ReviewFollowupError('invalid_request', 'The review follow-up request is invalid.');
  }
  const request = requestResult.data;
  const specification = actionSpecifications[request.action];

  const existingEvent = await readEvent(backend, request.requestId);
  if (existingEvent !== null) {
    const replayState = assertSubmissionType(await readState(backend, idResult.data), request);
    return replayReceipt(existingEvent, replayState, request, context.actorId);
  }

  const currentState = assertSubmissionType(await readState(backend, idResult.data), request);
  if (
    currentState.workflowStatus !== request.expectedStatus ||
    currentState.updatedAt !== request.expectedUpdatedAt
  ) {
    throw new ReviewFollowupError(
      'conflict',
      'The Submission state changed before review follow-up was applied.',
    );
  }

  const internalNote = buildInternalNote(request, changedAt);
  try {
    await backend.commitTransition({
      eventId: request.requestId,
      submissionId: idResult.data,
      expectedStatus: specification.fromStatus,
      expectedUpdatedAt: new Date(request.expectedUpdatedAt),
      toStatus: specification.toStatus,
      eventAction: specification.eventAction,
      actorId: context.actorId,
      internalNote,
      changedAt,
    });
  } catch (error) {
    if (error instanceof SubmissionPersistenceError && error.code === 'conflict') {
      const racedEvent = await readEvent(backend, request.requestId);
      if (racedEvent !== null) {
        const replayState = assertSubmissionType(await readState(backend, idResult.data), request);
        return replayReceipt(racedEvent, replayState, request, context.actorId);
      }
      throw new ReviewFollowupError(
        'conflict',
        'The Submission state changed before review follow-up was committed.',
        { cause: error },
      );
    }
    throw new ReviewFollowupError(
      'backend_failure',
      'The Submission review follow-up transition could not be committed.',
      { cause: error },
    );
  }

  const holdPayload =
    request.action === 'place_on_hold' ? parseSubmissionHoldEventPayload(internalNote) : null;
  return reviewFollowupReceiptSchema.parse({
    state: 'committed',
    submissionId: idResult.data,
    submissionType: request.submissionType,
    action: request.action,
    fromStatus: specification.fromStatus,
    toStatus: specification.toStatus,
    requestedAction: request.action === 'request_information' ? request.requestedAction : null,
    publicMessage:
      request.action === 'request_information' || request.action === 'place_on_hold'
        ? request.publicMessage
        : null,
    holdDays: request.action === 'place_on_hold' ? request.holdDays : null,
    nextReviewAt: holdPayload?.nextReviewAt ?? null,
    requiredAction: request.action === 'place_on_hold' ? request.requiredAction : null,
    changedAt: changedAt.toISOString(),
  });
}
