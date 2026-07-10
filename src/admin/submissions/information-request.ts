import { z } from 'zod';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type { SubmissionTransitionContext } from './authorization';

const timestampSchema = z.iso.datetime({ offset: true });
const safePlainTextSchema = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value.trim().length > 0, 'Text must contain non-whitespace content.')
    .refine((value) => !/[<>]/.test(value), 'HTML-like text is not accepted.');

export const submissionInformationRequestEventPayloadSchema = z
  .object({
    schemaVersion: z.literal('suggest-information-request-event-v1'),
    requestedAction: safePlainTextSchema(500),
    publicMessage: safePlainTextSchema(1_000),
  })
  .strict();

export const suggestInformationRequestSchema = z
  .object({
    schemaVersion: z.literal('suggest-information-request-v1'),
    requestId: z.uuid(),
    expectedStatus: z.literal('in_review'),
    expectedUpdatedAt: timestampSchema,
    requestedAction: safePlainTextSchema(500),
    publicMessage: safePlainTextSchema(1_000),
  })
  .strict();

export const suggestInformationRequestReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed']),
    submissionId: z.uuid(),
    fromStatus: z.literal('in_review'),
    toStatus: z.literal('needs_information'),
    requestedAction: safePlainTextSchema(500),
    publicMessage: safePlainTextSchema(1_000),
    changedAt: timestampSchema,
  })
  .strict();

export type SubmissionInformationRequestEventPayload = z.infer<
  typeof submissionInformationRequestEventPayloadSchema
>;
export type SuggestInformationRequest = z.infer<typeof suggestInformationRequestSchema>;
export type SuggestInformationRequestReceipt = z.infer<
  typeof suggestInformationRequestReceiptSchema
>;

export interface SuggestInformationRequestState {
  submissionId: string;
  submissionType: string;
  workflowStatus: string;
  updatedAt: string;
}

export interface SuggestInformationRequestEventRecord {
  eventId: string;
  submissionId: string;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  actorId: string;
  internalNote: string | null;
  createdAt: string;
}

export interface SuggestInformationRequestCommitCommand {
  eventId: string;
  submissionId: string;
  expectedUpdatedAt: Date;
  actorId: string;
  internalNote: string;
  changedAt: Date;
}

export interface SuggestInformationRequestBackend {
  readState(submissionId: string): Promise<SuggestInformationRequestState | null>;
  readRequestEvent(eventId: string): Promise<SuggestInformationRequestEventRecord | null>;
  commitRequest(command: SuggestInformationRequestCommitCommand): Promise<void>;
}

export class SuggestInformationRequestError extends Error {
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
    this.name = 'SuggestInformationRequestError';
  }
}

export function serializeSubmissionInformationRequestEventPayload(
  payload: SubmissionInformationRequestEventPayload,
): string {
  return JSON.stringify(submissionInformationRequestEventPayloadSchema.parse(payload));
}

export function parseSubmissionInformationRequestEventPayload(
  value: string | null,
): SubmissionInformationRequestEventPayload | null {
  if (value === null) return null;
  try {
    return submissionInformationRequestEventPayloadSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

function replayReceipt(
  existing: SuggestInformationRequestEventRecord,
  submissionId: string,
  request: SuggestInformationRequest,
  actorId: string,
): SuggestInformationRequestReceipt {
  const payload = parseSubmissionInformationRequestEventPayload(existing.internalNote);
  if (
    existing.submissionId !== submissionId ||
    existing.fromStatus !== 'in_review' ||
    existing.toStatus !== 'needs_information' ||
    existing.action !== 'submission_information_requested' ||
    existing.actorId !== actorId ||
    payload === null ||
    payload.requestedAction !== request.requestedAction ||
    payload.publicMessage !== request.publicMessage
  ) {
    throw new SuggestInformationRequestError(
      'idempotency_conflict',
      'The information-request UUID was already used for a different operation.',
    );
  }

  return suggestInformationRequestReceiptSchema.parse({
    state: 'replayed',
    submissionId,
    fromStatus: 'in_review',
    toStatus: 'needs_information',
    requestedAction: payload.requestedAction,
    publicMessage: payload.publicMessage,
    changedAt: existing.createdAt,
  });
}

export async function requestSuggestSubmissionInformation(
  context: SubmissionTransitionContext,
  backend: SuggestInformationRequestBackend,
  submissionId: string,
  rawRequest: unknown,
  changedAt = new Date(),
): Promise<SuggestInformationRequestReceipt> {
  if (!context.capabilities.includes('submission:transition')) {
    throw new SuggestInformationRequestError(
      'unauthorized',
      'The actor is not authorized to request Suggest submission information.',
    );
  }

  const submissionIdResult = z.uuid().safeParse(submissionId);
  const requestResult = suggestInformationRequestSchema.safeParse(rawRequest);
  if (
    !submissionIdResult.success ||
    !requestResult.success ||
    Number.isNaN(changedAt.getTime())
  ) {
    throw new SuggestInformationRequestError(
      'invalid_request',
      'The Suggest information request is invalid.',
    );
  }
  const request = requestResult.data;

  let existingEvent: SuggestInformationRequestEventRecord | null;
  try {
    existingEvent = await backend.readRequestEvent(request.requestId);
  } catch (error) {
    throw new SuggestInformationRequestError(
      'backend_failure',
      'The information-request replay check failed.',
      { cause: error },
    );
  }
  if (existingEvent !== null) {
    return replayReceipt(existingEvent, submissionIdResult.data, request, context.actorId);
  }

  let currentState: SuggestInformationRequestState | null;
  try {
    currentState = await backend.readState(submissionIdResult.data);
  } catch (error) {
    throw new SuggestInformationRequestError(
      'backend_failure',
      'The Suggest submission state could not be loaded.',
      { cause: error },
    );
  }
  if (currentState === null || currentState.submissionType !== 'suggest') {
    throw new SuggestInformationRequestError('not_found', 'The Suggest submission was not found.');
  }
  if (
    currentState.workflowStatus !== request.expectedStatus ||
    currentState.updatedAt !== request.expectedUpdatedAt
  ) {
    throw new SuggestInformationRequestError(
      'conflict',
      'The Suggest submission state changed before information was requested.',
    );
  }

  const internalNote = serializeSubmissionInformationRequestEventPayload({
    schemaVersion: 'suggest-information-request-event-v1',
    requestedAction: request.requestedAction,
    publicMessage: request.publicMessage,
  });

  try {
    await backend.commitRequest({
      eventId: request.requestId,
      submissionId: submissionIdResult.data,
      expectedUpdatedAt: new Date(request.expectedUpdatedAt),
      actorId: context.actorId,
      internalNote,
      changedAt,
    });
  } catch (error) {
    if (error instanceof SubmissionPersistenceError && error.code === 'conflict') {
      let racedEvent: SuggestInformationRequestEventRecord | null;
      try {
        racedEvent = await backend.readRequestEvent(request.requestId);
      } catch (readError) {
        throw new SuggestInformationRequestError(
          'backend_failure',
          'The information-request replay recovery failed.',
          { cause: readError },
        );
      }
      if (racedEvent !== null) {
        return replayReceipt(racedEvent, submissionIdResult.data, request, context.actorId);
      }
      throw new SuggestInformationRequestError(
        'conflict',
        'The Suggest submission state changed before the information request committed.',
        { cause: error },
      );
    }
    throw new SuggestInformationRequestError(
      'backend_failure',
      'The Suggest information request could not be committed.',
      { cause: error },
    );
  }

  return suggestInformationRequestReceiptSchema.parse({
    state: 'committed',
    submissionId: submissionIdResult.data,
    fromStatus: 'in_review',
    toStatus: 'needs_information',
    requestedAction: request.requestedAction,
    publicMessage: request.publicMessage,
    changedAt: changedAt.toISOString(),
  });
}
