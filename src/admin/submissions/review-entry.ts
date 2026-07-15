import { z } from 'zod';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type { SubmissionReviewEntryContext } from './review-entry-authorization';
import type {
  SuggestReviewTransitionBackend,
  SuggestReviewTransitionEventRecord,
  SuggestReviewTransitionState,
} from './transitions';

const timestampSchema = z.iso.datetime({ offset: true });

export const reviewEntrySubmissionTypeValues = [
  'payment_report',
  'problem_report',
  'photos',
] as const;
export const reviewEntrySubmissionTypeSchema = z.enum(reviewEntrySubmissionTypeValues);
export const reviewEntryActionValues = ['begin_triage', 'begin_review'] as const;
export const reviewEntryActionSchema = z.enum(reviewEntryActionValues);

export const reviewEntryRequestSchema = z
  .object({
    schemaVersion: z.literal('submission-review-entry-v1'),
    requestId: z.uuid(),
    submissionType: reviewEntrySubmissionTypeSchema,
    action: reviewEntryActionSchema,
    expectedStatus: z.enum(['received', 'triage']),
    expectedUpdatedAt: timestampSchema,
  })
  .strict()
  .superRefine((request, context) => {
    if (request.action === 'begin_triage' && request.expectedStatus !== 'received') {
      context.addIssue({
        code: 'custom',
        path: ['expectedStatus'],
        message: 'begin_triage requires expectedStatus received.',
      });
    }
    if (request.action === 'begin_review' && request.expectedStatus !== 'triage') {
      context.addIssue({
        code: 'custom',
        path: ['expectedStatus'],
        message: 'begin_review requires expectedStatus triage.',
      });
    }
  });

export const reviewEntryReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed']),
    submissionId: z.uuid(),
    submissionType: reviewEntrySubmissionTypeSchema,
    fromStatus: z.enum(['received', 'triage']),
    toStatus: z.enum(['triage', 'in_review']),
    action: reviewEntryActionSchema,
    changedAt: timestampSchema,
  })
  .strict();

export type ReviewEntryRequest = z.infer<typeof reviewEntryRequestSchema>;
export type ReviewEntryReceipt = z.infer<typeof reviewEntryReceiptSchema>;

export class ReviewEntryError extends Error {
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
    this.name = 'ReviewEntryError';
  }
}

const actionSpecifications = {
  begin_triage: {
    fromStatus: 'received',
    toStatus: 'triage',
    eventAction: 'submission_triage_started',
  },
  begin_review: {
    fromStatus: 'triage',
    toStatus: 'in_review',
    eventAction: 'submission_review_started',
  },
} as const;

function assertSubmissionType(
  state: SuggestReviewTransitionState | null,
  request: ReviewEntryRequest,
): SuggestReviewTransitionState {
  if (state === null || state.submissionType !== request.submissionType) {
    throw new ReviewEntryError('not_found', 'The requested review-entry Submission was not found.');
  }
  return state;
}

function replayReceipt(
  event: SuggestReviewTransitionEventRecord,
  state: SuggestReviewTransitionState,
  request: ReviewEntryRequest,
  actorId: string,
): ReviewEntryReceipt {
  const specification = actionSpecifications[request.action];
  if (
    event.submissionId !== state.submissionId ||
    event.fromStatus !== specification.fromStatus ||
    event.toStatus !== specification.toStatus ||
    event.action !== specification.eventAction ||
    event.actorId !== actorId
  ) {
    throw new ReviewEntryError(
      'idempotency_conflict',
      'The review-entry request ID was already used for a different operation.',
    );
  }
  return reviewEntryReceiptSchema.parse({
    state: 'replayed',
    submissionId: state.submissionId,
    submissionType: request.submissionType,
    fromStatus: specification.fromStatus,
    toStatus: specification.toStatus,
    action: request.action,
    changedAt: event.createdAt,
  });
}

async function readState(
  backend: SuggestReviewTransitionBackend,
  submissionId: string,
): Promise<SuggestReviewTransitionState | null> {
  try {
    return await backend.readState(submissionId);
  } catch (error) {
    throw new ReviewEntryError(
      'backend_failure',
      'The review-entry Submission state could not be loaded.',
      { cause: error },
    );
  }
}

async function readEvent(
  backend: SuggestReviewTransitionBackend,
  requestId: string,
): Promise<SuggestReviewTransitionEventRecord | null> {
  try {
    return await backend.readEvent(requestId);
  } catch (error) {
    throw new ReviewEntryError('backend_failure', 'The review-entry replay check failed.', {
      cause: error,
    });
  }
}

export async function applySubmissionReviewEntry(
  context: SubmissionReviewEntryContext,
  backend: SuggestReviewTransitionBackend,
  submissionId: string,
  rawRequest: unknown,
  changedAt = new Date(),
): Promise<ReviewEntryReceipt> {
  if (!context.capabilities.includes('submission:review-entry')) {
    throw new ReviewEntryError(
      'unauthorized',
      'The actor is not authorized for Submission review entry.',
    );
  }

  const idResult = z.uuid().safeParse(submissionId);
  const requestResult = reviewEntryRequestSchema.safeParse(rawRequest);
  if (!idResult.success || !requestResult.success || Number.isNaN(changedAt.getTime())) {
    throw new ReviewEntryError('invalid_request', 'The review-entry request is invalid.');
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
    throw new ReviewEntryError(
      'conflict',
      'The Submission state changed before review entry was applied.',
    );
  }

  try {
    await backend.commitTransition({
      eventId: request.requestId,
      submissionId: idResult.data,
      expectedStatus: specification.fromStatus,
      expectedUpdatedAt: new Date(request.expectedUpdatedAt),
      toStatus: specification.toStatus,
      eventAction: specification.eventAction,
      actorId: context.actorId,
      changedAt,
    });
  } catch (error) {
    if (error instanceof SubmissionPersistenceError && error.code === 'conflict') {
      const racedEvent = await readEvent(backend, request.requestId);
      if (racedEvent !== null) {
        const replayState = assertSubmissionType(await readState(backend, idResult.data), request);
        return replayReceipt(racedEvent, replayState, request, context.actorId);
      }
      throw new ReviewEntryError(
        'conflict',
        'The Submission state changed before review entry was committed.',
        { cause: error },
      );
    }
    throw new ReviewEntryError(
      'backend_failure',
      'The Submission review-entry transition could not be committed.',
      { cause: error },
    );
  }

  return reviewEntryReceiptSchema.parse({
    state: 'committed',
    submissionId: idResult.data,
    submissionType: request.submissionType,
    fromStatus: specification.fromStatus,
    toStatus: specification.toStatus,
    action: request.action,
    changedAt: changedAt.toISOString(),
  });
}
