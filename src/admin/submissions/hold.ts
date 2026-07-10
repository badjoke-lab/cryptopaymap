import { z } from 'zod';
import {
  calculateSubmissionHoldNextReviewAt,
  parseSubmissionHoldEventPayload,
  serializeSubmissionHoldEventPayload,
  submissionHoldDaysSchema,
  submissionHoldPublicMessageSchema,
  submissionHoldReasonSchema,
  submissionHoldRequiredActionSchema,
} from '../../submissions/hold-contract';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type { SubmissionTransitionContext } from './authorization';

const timestampSchema = z.iso.datetime({ offset: true });

export const suggestHoldRequestSchema = z
  .object({
    schemaVersion: z.literal('suggest-hold-v1'),
    requestId: z.uuid(),
    expectedStatus: z.literal('in_review'),
    expectedUpdatedAt: timestampSchema,
    holdDays: submissionHoldDaysSchema,
    holdReason: submissionHoldReasonSchema,
    requiredAction: submissionHoldRequiredActionSchema,
    publicMessage: submissionHoldPublicMessageSchema,
  })
  .strict();

export const suggestHoldReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed']),
    submissionId: z.uuid(),
    fromStatus: z.literal('in_review'),
    toStatus: z.literal('on_hold'),
    holdDays: submissionHoldDaysSchema,
    nextReviewAt: timestampSchema,
    requiredAction: submissionHoldRequiredActionSchema,
    publicMessage: submissionHoldPublicMessageSchema,
    changedAt: timestampSchema,
  })
  .strict();

export type SuggestHoldRequest = z.infer<typeof suggestHoldRequestSchema>;
export type SuggestHoldReceipt = z.infer<typeof suggestHoldReceiptSchema>;

export interface SuggestHoldState {
  submissionId: string;
  submissionType: string;
  workflowStatus: string;
  updatedAt: string;
}

export interface SuggestHoldEventRecord {
  eventId: string;
  submissionId: string;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  actorId: string;
  internalNote: string | null;
  createdAt: string;
}

export interface SuggestHoldCommitCommand {
  eventId: string;
  submissionId: string;
  expectedUpdatedAt: Date;
  actorId: string;
  internalNote: string;
  changedAt: Date;
}

export interface SuggestHoldBackend {
  readState(submissionId: string): Promise<SuggestHoldState | null>;
  readHoldEvent(eventId: string): Promise<SuggestHoldEventRecord | null>;
  commitHold(command: SuggestHoldCommitCommand): Promise<void>;
}

export class SuggestHoldError extends Error {
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
    this.name = 'SuggestHoldError';
  }
}

function replayReceipt(
  existing: SuggestHoldEventRecord,
  submissionId: string,
  request: SuggestHoldRequest,
  actorId: string,
): SuggestHoldReceipt {
  const payload = parseSubmissionHoldEventPayload(existing.internalNote);
  if (
    existing.submissionId !== submissionId ||
    existing.fromStatus !== 'in_review' ||
    existing.toStatus !== 'on_hold' ||
    existing.action !== 'submission_hold_started' ||
    existing.actorId !== actorId ||
    payload === null ||
    payload.holdDays !== request.holdDays ||
    payload.holdReason !== request.holdReason ||
    payload.requiredAction !== request.requiredAction ||
    payload.publicMessage !== request.publicMessage
  ) {
    throw new SuggestHoldError(
      'idempotency_conflict',
      'The Hold request UUID was already used for a different operation.',
    );
  }

  return suggestHoldReceiptSchema.parse({
    state: 'replayed',
    submissionId,
    fromStatus: 'in_review',
    toStatus: 'on_hold',
    holdDays: payload.holdDays,
    nextReviewAt: payload.nextReviewAt,
    requiredAction: payload.requiredAction,
    publicMessage: payload.publicMessage,
    changedAt: existing.createdAt,
  });
}

export async function placeSuggestSubmissionOnHold(
  context: SubmissionTransitionContext,
  backend: SuggestHoldBackend,
  submissionId: string,
  rawRequest: unknown,
  changedAt = new Date(),
): Promise<SuggestHoldReceipt> {
  if (!context.capabilities.includes('submission:transition')) {
    throw new SuggestHoldError('unauthorized', 'The actor is not authorized to place Suggest submissions on Hold.');
  }

  const submissionIdResult = z.uuid().safeParse(submissionId);
  const requestResult = suggestHoldRequestSchema.safeParse(rawRequest);
  if (!submissionIdResult.success || !requestResult.success || Number.isNaN(changedAt.getTime())) {
    throw new SuggestHoldError('invalid_request', 'The Suggest Hold request is invalid.');
  }
  const request = requestResult.data;

  let existingEvent: SuggestHoldEventRecord | null;
  try {
    existingEvent = await backend.readHoldEvent(request.requestId);
  } catch (error) {
    throw new SuggestHoldError('backend_failure', 'The Hold replay check failed.', { cause: error });
  }
  if (existingEvent !== null) {
    return replayReceipt(existingEvent, submissionIdResult.data, request, context.actorId);
  }

  let currentState: SuggestHoldState | null;
  try {
    currentState = await backend.readState(submissionIdResult.data);
  } catch (error) {
    throw new SuggestHoldError('backend_failure', 'The Suggest submission state could not be loaded.', {
      cause: error,
    });
  }
  if (currentState === null || currentState.submissionType !== 'suggest') {
    throw new SuggestHoldError('not_found', 'The Suggest submission was not found.');
  }
  if (
    currentState.workflowStatus !== request.expectedStatus ||
    currentState.updatedAt !== request.expectedUpdatedAt
  ) {
    throw new SuggestHoldError(
      'conflict',
      'The Suggest submission state changed before the Hold was applied.',
    );
  }

  const nextReviewAt = calculateSubmissionHoldNextReviewAt(changedAt, request.holdDays);
  const internalNote = serializeSubmissionHoldEventPayload({
    schemaVersion: 'suggest-hold-event-v1',
    holdDays: request.holdDays,
    nextReviewAt: nextReviewAt.toISOString(),
    holdReason: request.holdReason,
    requiredAction: request.requiredAction,
    publicMessage: request.publicMessage,
  });

  try {
    await backend.commitHold({
      eventId: request.requestId,
      submissionId: submissionIdResult.data,
      expectedUpdatedAt: new Date(request.expectedUpdatedAt),
      actorId: context.actorId,
      internalNote,
      changedAt,
    });
  } catch (error) {
    if (error instanceof SubmissionPersistenceError && error.code === 'conflict') {
      let racedEvent: SuggestHoldEventRecord | null;
      try {
        racedEvent = await backend.readHoldEvent(request.requestId);
      } catch (readError) {
        throw new SuggestHoldError('backend_failure', 'The Hold replay recovery failed.', {
          cause: readError,
        });
      }
      if (racedEvent !== null) {
        return replayReceipt(racedEvent, submissionIdResult.data, request, context.actorId);
      }
      throw new SuggestHoldError(
        'conflict',
        'The Suggest submission state changed before the Hold committed.',
        { cause: error },
      );
    }
    throw new SuggestHoldError('backend_failure', 'The Suggest Hold could not be committed.', {
      cause: error,
    });
  }

  return suggestHoldReceiptSchema.parse({
    state: 'committed',
    submissionId: submissionIdResult.data,
    fromStatus: 'in_review',
    toStatus: 'on_hold',
    holdDays: request.holdDays,
    nextReviewAt: nextReviewAt.toISOString(),
    requiredAction: request.requiredAction,
    publicMessage: request.publicMessage,
    changedAt: changedAt.toISOString(),
  });
}
