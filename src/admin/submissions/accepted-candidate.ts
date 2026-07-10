import { z } from 'zod';
import { normalizeCandidateName } from '../../schemas/source-provenance';
import {
  parseSuggestAcceptedCandidateEventPayload,
  serializeSuggestAcceptedCandidateEventPayload,
  suggestCandidateAcceptanceReasonSchema,
} from '../../submissions/accepted-candidate-contract';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type { SubmissionCandidateCreateContext } from './authorization';
import { suggestReviewProjectionSchema, type SuggestReviewProjectionData } from './detail';

const timestampSchema = z.iso.datetime({ offset: true });
const safeNoteSchema = z
  .string()
  .trim()
  .min(1)
  .max(1_000)
  .refine((value) => !/[<>]/.test(value), 'HTML-like text is not accepted.');

export const suggestAcceptedCandidateRequestSchema = z
  .object({
    schemaVersion: z.literal('suggest-accepted-candidate-v1'),
    requestId: z.uuid(),
    expectedStatus: z.literal('in_review'),
    expectedUpdatedAt: timestampSchema,
    reasonCode: suggestCandidateAcceptanceReasonSchema,
    note: safeNoteSchema.nullable().default(null),
  })
  .strict();

export const suggestAcceptedCandidateReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed']),
    submissionId: z.uuid(),
    candidateId: z.uuid(),
    sourceRecordId: z.uuid(),
    fromStatus: z.literal('in_review'),
    toStatus: z.literal('resolved'),
    resolution: z.literal('accepted_as_candidate'),
    reasonCode: suggestCandidateAcceptanceReasonSchema,
    decidedAt: timestampSchema,
  })
  .strict();

export type SuggestAcceptedCandidateRequest = z.infer<typeof suggestAcceptedCandidateRequestSchema>;
export type SuggestAcceptedCandidateReceipt = z.infer<typeof suggestAcceptedCandidateReceiptSchema>;

export interface SuggestAcceptedCandidateState {
  submissionId: string;
  publicId: string;
  submissionType: string;
  workflowStatus: string;
  updatedAt: string;
  priority: number;
  normalizedPayload: unknown;
  payloadUpdatedAt: string;
}

export interface SuggestAcceptedCandidateEventRecord {
  eventId: string;
  submissionId: string;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  reasonCode: string | null;
  actorId: string;
  internalNote: string | null;
  createdAt: string;
}

export interface SuggestAcceptedCandidateCommitCommand {
  eventId: string;
  submissionId: string;
  publicId: string;
  expectedUpdatedAt: Date;
  expectedPayloadUpdatedAt: Date;
  actorId: string;
  actorType: 'human' | 'system';
  sourceId: string;
  sourceRecordId: string;
  candidateId: string;
  candidateType: 'physical_place' | 'online_service';
  normalizedName: string;
  priority: number;
  observedAt: Date;
  normalizedPayload: SuggestReviewProjectionData;
  contentHash: string;
  reasonCode: SuggestAcceptedCandidateRequest['reasonCode'];
  internalNote: string;
  decidedAt: Date;
}

export interface SuggestAcceptedCandidateBackend {
  readState(submissionId: string): Promise<SuggestAcceptedCandidateState | null>;
  readDecisionEvent(eventId: string): Promise<SuggestAcceptedCandidateEventRecord | null>;
  commitAcceptedCandidate(command: SuggestAcceptedCandidateCommitCommand): Promise<void>;
}

export class SuggestAcceptedCandidateError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'invalid_request'
      | 'not_found'
      | 'conflict'
      | 'idempotency_conflict'
      | 'invalid_projection'
      | 'backend_failure',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SuggestAcceptedCandidateError';
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

async function sha256(value: unknown): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(canonicalize(value))),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function deterministicUuid(label: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(label));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function replayReceipt(
  existing: SuggestAcceptedCandidateEventRecord,
  submissionId: string,
  sourceId: string,
  request: SuggestAcceptedCandidateRequest,
  actorId: string,
): SuggestAcceptedCandidateReceipt {
  const payload = parseSuggestAcceptedCandidateEventPayload(existing.internalNote);
  if (
    existing.submissionId !== submissionId ||
    existing.fromStatus !== 'in_review' ||
    existing.toStatus !== 'resolved' ||
    existing.action !== 'submission_accepted_as_candidate' ||
    existing.reasonCode !== request.reasonCode ||
    existing.actorId !== actorId ||
    payload === null ||
    payload.sourceId !== sourceId ||
    payload.reasonCode !== request.reasonCode ||
    payload.note !== request.note
  ) {
    throw new SuggestAcceptedCandidateError(
      'idempotency_conflict',
      'The accepted-as-Candidate request UUID was already used for a different operation.',
    );
  }
  return suggestAcceptedCandidateReceiptSchema.parse({
    state: 'replayed',
    submissionId,
    candidateId: payload.candidateId,
    sourceRecordId: payload.sourceRecordId,
    fromStatus: 'in_review',
    toStatus: 'resolved',
    resolution: 'accepted_as_candidate',
    reasonCode: payload.reasonCode,
    decidedAt: existing.createdAt,
  });
}

export async function acceptSuggestSubmissionAsCandidate(
  context: SubmissionCandidateCreateContext,
  backend: SuggestAcceptedCandidateBackend,
  submissionId: string,
  sourceId: string,
  rawRequest: unknown,
  decidedAt = new Date(),
): Promise<SuggestAcceptedCandidateReceipt> {
  if (!context.capabilities.includes('submission:candidate:create')) {
    throw new SuggestAcceptedCandidateError(
      'unauthorized',
      'The actor is not authorized to create a Candidate from this Submission.',
    );
  }

  const submissionIdResult = z.uuid().safeParse(submissionId);
  const sourceIdResult = z.uuid().safeParse(sourceId);
  const requestResult = suggestAcceptedCandidateRequestSchema.safeParse(rawRequest);
  if (
    !submissionIdResult.success ||
    !sourceIdResult.success ||
    !requestResult.success ||
    Number.isNaN(decidedAt.getTime())
  ) {
    throw new SuggestAcceptedCandidateError(
      'invalid_request',
      'The accepted-as-Candidate request is invalid.',
    );
  }
  const request = requestResult.data;

  let existingEvent: SuggestAcceptedCandidateEventRecord | null;
  try {
    existingEvent = await backend.readDecisionEvent(request.requestId);
  } catch (error) {
    throw new SuggestAcceptedCandidateError('backend_failure', 'Candidate replay check failed.', {
      cause: error,
    });
  }
  if (existingEvent !== null) {
    return replayReceipt(
      existingEvent,
      submissionIdResult.data,
      sourceIdResult.data,
      request,
      context.actorId,
    );
  }

  let currentState: SuggestAcceptedCandidateState | null;
  try {
    currentState = await backend.readState(submissionIdResult.data);
  } catch (error) {
    throw new SuggestAcceptedCandidateError(
      'backend_failure',
      'The Suggest submission state could not be loaded.',
      { cause: error },
    );
  }
  if (currentState === null || currentState.submissionType !== 'suggest') {
    throw new SuggestAcceptedCandidateError('not_found', 'The Suggest submission was not found.');
  }
  if (
    currentState.workflowStatus !== request.expectedStatus ||
    currentState.updatedAt !== request.expectedUpdatedAt
  ) {
    throw new SuggestAcceptedCandidateError(
      'conflict',
      'The Suggest submission state changed before Candidate creation.',
    );
  }

  const projectionResult = suggestReviewProjectionSchema.safeParse(currentState.normalizedPayload);
  if (!projectionResult.success) {
    throw new SuggestAcceptedCandidateError(
      'invalid_projection',
      'The normalized Suggest projection is not valid for Candidate creation.',
    );
  }
  const projection = projectionResult.data;
  const normalizedName = normalizeCandidateName(projection.entity.name);
  const candidateId = await deterministicUuid(`suggest-candidate:${request.requestId}`);
  const sourceRecordId = await deterministicUuid(`suggest-source-record:${request.requestId}`);
  const observedAt = new Date(`${projection.observedAt}T00:00:00.000Z`);
  const contentHash = await sha256(projection);
  const internalNote = serializeSuggestAcceptedCandidateEventPayload({
    schemaVersion: 'suggest-accepted-candidate-event-v1',
    candidateId,
    sourceRecordId,
    sourceId: sourceIdResult.data,
    candidateType: projection.suggestionKind,
    normalizedName,
    reasonCode: request.reasonCode,
    note: request.note,
  });

  try {
    await backend.commitAcceptedCandidate({
      eventId: request.requestId,
      submissionId: submissionIdResult.data,
      publicId: currentState.publicId,
      expectedUpdatedAt: new Date(request.expectedUpdatedAt),
      expectedPayloadUpdatedAt: new Date(currentState.payloadUpdatedAt),
      actorId: context.actorId,
      actorType: context.actorType,
      sourceId: sourceIdResult.data,
      sourceRecordId,
      candidateId,
      candidateType: projection.suggestionKind,
      normalizedName,
      priority: currentState.priority,
      observedAt,
      normalizedPayload: projection,
      contentHash,
      reasonCode: request.reasonCode,
      internalNote,
      decidedAt,
    });
  } catch (error) {
    if (error instanceof SubmissionPersistenceError && error.code === 'conflict') {
      let racedEvent: SuggestAcceptedCandidateEventRecord | null;
      try {
        racedEvent = await backend.readDecisionEvent(request.requestId);
      } catch (readError) {
        throw new SuggestAcceptedCandidateError(
          'backend_failure',
          'Candidate replay recovery failed.',
          { cause: readError },
        );
      }
      if (racedEvent !== null) {
        return replayReceipt(
          racedEvent,
          submissionIdResult.data,
          sourceIdResult.data,
          request,
          context.actorId,
        );
      }
      throw new SuggestAcceptedCandidateError(
        'conflict',
        'The Suggest submission state changed before Candidate creation committed.',
        { cause: error },
      );
    }
    throw new SuggestAcceptedCandidateError(
      'backend_failure',
      'The accepted-as-Candidate transaction could not be committed.',
      { cause: error },
    );
  }

  return suggestAcceptedCandidateReceiptSchema.parse({
    state: 'committed',
    submissionId: submissionIdResult.data,
    candidateId,
    sourceRecordId,
    fromStatus: 'in_review',
    toStatus: 'resolved',
    resolution: 'accepted_as_candidate',
    reasonCode: request.reasonCode,
    decidedAt: decidedAt.toISOString(),
  });
}
