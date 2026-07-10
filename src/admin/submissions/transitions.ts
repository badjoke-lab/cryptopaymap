import { z } from 'zod';
import type { SubmissionWorkflowStatus } from '../../submissions/contract';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type { SubmissionTransitionContext } from './authorization';

const timestampSchema = z.iso.datetime({ offset: true });

export const suggestReviewTransitionActionValues = ['begin_triage', 'begin_review'] as const;
export const suggestReviewTransitionActionSchema = z.enum(suggestReviewTransitionActionValues);

export const suggestReviewTransitionRequestSchema = z
  .object({
    schemaVersion: z.literal('suggest-review-transition-v1'),
    requestId: z.uuid(),
    action: suggestReviewTransitionActionSchema,
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

export const suggestReviewTransitionReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed']),
    submissionId: z.uuid(),
    fromStatus: z.enum(['received', 'triage']),
    toStatus: z.enum(['triage', 'in_review']),
    action: suggestReviewTransitionActionSchema,
    changedAt: timestampSchema,
  })
  .strict();

export type SuggestReviewTransitionRequest = z.infer<typeof suggestReviewTransitionRequestSchema>;
export type SuggestReviewTransitionReceipt = z.infer<typeof suggestReviewTransitionReceiptSchema>;

export interface SuggestReviewTransitionState {
  submissionId: string;
  submissionType: string;
  workflowStatus: SubmissionWorkflowStatus;
  updatedAt: string;
}

export interface SuggestReviewTransitionEventRecord {
  eventId: string;
  submissionId: string;
  fromStatus: SubmissionWorkflowStatus | null;
  toStatus: SubmissionWorkflowStatus;
  action: string;
  actorId: string;
  createdAt: string;
}

export interface SuggestReviewTransitionCommitCommand {
  eventId: string;
  submissionId: string;
  expectedStatus: 'received' | 'triage';
  expectedUpdatedAt: Date;
  toStatus: 'triage' | 'in_review';
  eventAction: 'submission_triage_started' | 'submission_review_started';
  actorId: string;
  changedAt: Date;
}

export interface SuggestReviewTransitionBackend {
  readState(submissionId: string): Promise<SuggestReviewTransitionState | null>;
  readEvent(eventId: string): Promise<SuggestReviewTransitionEventRecord | null>;
  commitTransition(command: SuggestReviewTransitionCommitCommand): Promise<void>;
}

export class SuggestReviewTransitionError extends Error {
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
    this.name = 'SuggestReviewTransitionError';
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

function replayReceipt(
  existing: SuggestReviewTransitionEventRecord,
  submissionId: string,
  request: SuggestReviewTransitionRequest,
  actorId: string,
): SuggestReviewTransitionReceipt {
  const specification = actionSpecifications[request.action];
  if (
    existing.submissionId !== submissionId ||
    existing.fromStatus !== specification.fromStatus ||
    existing.toStatus !== specification.toStatus ||
    existing.action !== specification.eventAction ||
    existing.actorId !== actorId
  ) {
    throw new SuggestReviewTransitionError(
      'idempotency_conflict',
      'The transition request ID was already used for a different operation.',
    );
  }
  return suggestReviewTransitionReceiptSchema.parse({
    state: 'replayed',
    submissionId,
    fromStatus: specification.fromStatus,
    toStatus: specification.toStatus,
    action: request.action,
    changedAt: existing.createdAt,
  });
}

export async function applySuggestReviewTransition(
  context: SubmissionTransitionContext,
  backend: SuggestReviewTransitionBackend,
  submissionId: string,
  rawRequest: unknown,
  changedAt = new Date(),
): Promise<SuggestReviewTransitionReceipt> {
  if (!context.capabilities.includes('submission:transition')) {
    throw new SuggestReviewTransitionError(
      'unauthorized',
      'The actor is not authorized to transition Suggest submissions.',
    );
  }

  const idResult = z.uuid().safeParse(submissionId);
  const requestResult = suggestReviewTransitionRequestSchema.safeParse(rawRequest);
  if (!idResult.success || !requestResult.success || Number.isNaN(changedAt.getTime())) {
    throw new SuggestReviewTransitionError(
      'invalid_request',
      'The Suggest review transition request is invalid.',
    );
  }
  const request = requestResult.data;
  const specification = actionSpecifications[request.action];

  let existingEvent: SuggestReviewTransitionEventRecord | null;
  try {
    existingEvent = await backend.readEvent(request.requestId);
  } catch (error) {
    throw new SuggestReviewTransitionError(
      'backend_failure',
      'The Suggest review transition replay check failed.',
      { cause: error },
    );
  }
  if (existingEvent !== null) {
    return replayReceipt(existingEvent, idResult.data, request, context.actorId);
  }

  let currentState: SuggestReviewTransitionState | null;
  try {
    currentState = await backend.readState(idResult.data);
  } catch (error) {
    throw new SuggestReviewTransitionError(
      'backend_failure',
      'The Suggest review transition state could not be loaded.',
      { cause: error },
    );
  }
  if (currentState === null || currentState.submissionType !== 'suggest') {
    throw new SuggestReviewTransitionError('not_found', 'The Suggest submission was not found.');
  }
  if (
    currentState.workflowStatus !== request.expectedStatus ||
    currentState.updatedAt !== request.expectedUpdatedAt
  ) {
    throw new SuggestReviewTransitionError(
      'conflict',
      'The Suggest submission state changed before the transition was applied.',
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
      let racedEvent: SuggestReviewTransitionEventRecord | null;
      try {
        racedEvent = await backend.readEvent(request.requestId);
      } catch (readError) {
        throw new SuggestReviewTransitionError(
          'backend_failure',
          'The Suggest review transition replay recovery failed.',
          { cause: readError },
        );
      }
      if (racedEvent !== null) {
        return replayReceipt(racedEvent, idResult.data, request, context.actorId);
      }
      throw new SuggestReviewTransitionError(
        'conflict',
        'The Suggest submission state changed before the transition was committed.',
        { cause: error },
      );
    }
    throw new SuggestReviewTransitionError(
      'backend_failure',
      'The Suggest review transition could not be committed.',
      { cause: error },
    );
  }

  return suggestReviewTransitionReceiptSchema.parse({
    state: 'committed',
    submissionId: idResult.data,
    fromStatus: specification.fromStatus,
    toStatus: specification.toStatus,
    action: request.action,
    changedAt: changedAt.toISOString(),
  });
}
