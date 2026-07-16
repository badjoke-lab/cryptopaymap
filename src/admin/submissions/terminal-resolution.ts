import { z } from 'zod';
import type {
  SubmissionResolution,
  SubmissionType,
  SubmissionWorkflowStatus,
} from '../../submissions/contract';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import {
  parseSubmissionTerminalResolutionEventPayload,
  serializeSubmissionTerminalResolutionEventPayload,
  submissionTerminalInternalNoteSchema,
  submissionTerminalPublicMessageSchema,
  submissionTerminalReasonCodeSchema,
  type SubmissionTerminalResolutionEventPayload,
} from '../../submissions/terminal-resolution-contract';
import type { SubmissionTerminalResolutionContext } from './terminal-resolution-authorization';

const timestampSchema = z.iso.datetime({ offset: true });
const activeStatusSchema = z.enum([
  'received',
  'triage',
  'in_review',
  'needs_information',
  'on_hold',
]);
const reviewedOrPausedStatusSchema = z.enum(['in_review', 'needs_information', 'on_hold']);
const duplicateSourceStatusSchema = z.enum(['received', 'triage', 'in_review']);

const baseRequestSchema = z.object({
  schemaVersion: z.literal('submission-terminal-resolution-v1'),
  requestId: z.uuid(),
  submissionType: z.enum(['suggest', 'payment_report', 'problem_report', 'claim', 'photos']),
  expectedUpdatedAt: timestampSchema,
  publicMessage: submissionTerminalPublicMessageSchema,
  internalNote: submissionTerminalInternalNoteSchema.nullable(),
});

export const submissionTerminalResolutionRequestSchema = z.discriminatedUnion('action', [
  baseRequestSchema
    .extend({
      action: z.literal('not_approved'),
      expectedStatus: reviewedOrPausedStatusSchema,
      reasonCode: z.enum([
        'insufficient_evidence',
        'unverifiable',
        'out_of_scope',
        'policy_not_met',
        'hold_expired',
        'other',
      ]),
      duplicateSubmissionId: z.null(),
    })
    .strict(),
  baseRequestSchema
    .extend({
      action: z.literal('duplicate'),
      expectedStatus: duplicateSourceStatusSchema,
      reasonCode: z.literal('duplicate_submission'),
      duplicateSubmissionId: z.uuid(),
    })
    .strict(),
  baseRequestSchema
    .extend({
      action: z.literal('no_change'),
      expectedStatus: z.literal('in_review'),
      reasonCode: z.enum(['already_current', 'no_material_difference', 'other']),
      duplicateSubmissionId: z.null(),
    })
    .strict(),
  baseRequestSchema
    .extend({
      action: z.literal('withdrawn'),
      expectedStatus: activeStatusSchema,
      reasonCode: z.enum(['submitter_requested', 'superseded_by_submitter', 'other']),
      duplicateSubmissionId: z.null(),
    })
    .strict(),
]);

export const submissionTerminalResolutionReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed']),
    submissionId: z.uuid(),
    submissionType: z.enum(['suggest', 'payment_report', 'problem_report', 'claim', 'photos']),
    action: z.enum(['not_approved', 'duplicate', 'no_change', 'withdrawn']),
    fromStatus: activeStatusSchema,
    toStatus: z.enum(['resolved', 'duplicate', 'withdrawn']),
    resolution: z.enum(['not_approved', 'duplicate', 'no_change', 'withdrawn']),
    reasonCode: submissionTerminalReasonCodeSchema,
    publicMessage: submissionTerminalPublicMessageSchema,
    duplicateSubmissionId: z.uuid().nullable(),
    duplicateSubmissionPublicId: z
      .string()
      .regex(/^CPM-S-\d{4}-\d{6}$/)
      .nullable(),
    changedAt: timestampSchema,
  })
  .strict();

export type SubmissionTerminalResolutionRequest = z.infer<
  typeof submissionTerminalResolutionRequestSchema
>;
export type SubmissionTerminalResolutionReceipt = z.infer<
  typeof submissionTerminalResolutionReceiptSchema
>;

export interface SubmissionTerminalResolutionState {
  submissionId: string;
  submissionType: string;
  workflowStatus: SubmissionWorkflowStatus;
  resolution: SubmissionResolution | null;
  updatedAt: string;
}

export interface SubmissionTerminalResolutionDuplicateTarget {
  submissionId: string;
  publicId: string;
  submissionType: string;
  workflowStatus: SubmissionWorkflowStatus;
}

export interface SubmissionTerminalResolutionEventRecord {
  eventId: string;
  submissionId: string;
  fromStatus: SubmissionWorkflowStatus | null;
  toStatus: SubmissionWorkflowStatus;
  action: string;
  reasonCode: string | null;
  actorId: string;
  internalNote: string | null;
  createdAt: string;
}

export interface SubmissionTerminalResolutionCommitCommand {
  eventId: string;
  submissionId: string;
  submissionType: SubmissionType;
  expectedStatus: 'received' | 'triage' | 'in_review' | 'needs_information' | 'on_hold';
  expectedUpdatedAt: Date;
  toStatus: 'resolved' | 'duplicate' | 'withdrawn';
  resolution: 'not_approved' | 'duplicate' | 'no_change' | 'withdrawn';
  eventAction:
    | 'submission_not_approved'
    | 'submission_duplicate_resolved'
    | 'submission_no_change_resolved'
    | 'submission_withdrawn';
  reasonCode: SubmissionTerminalResolutionRequest['reasonCode'];
  actorId: string;
  actorType: 'human' | 'system';
  internalNote: string;
  duplicateSubmissionId: string | null;
  changedAt: Date;
}

export interface SubmissionTerminalResolutionBackend {
  readState(submissionId: string): Promise<SubmissionTerminalResolutionState | null>;
  readEvent(eventId: string): Promise<SubmissionTerminalResolutionEventRecord | null>;
  readDuplicateTarget(
    submissionId: string,
  ): Promise<SubmissionTerminalResolutionDuplicateTarget | null>;
  commitResolution(command: SubmissionTerminalResolutionCommitCommand): Promise<void>;
}

export class SubmissionTerminalResolutionError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'invalid_request'
      | 'not_found'
      | 'conflict'
      | 'idempotency_conflict'
      | 'ineligible'
      | 'backend_failure',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SubmissionTerminalResolutionError';
  }
}

const eligibility: Record<
  SubmissionTerminalResolutionRequest['action'],
  readonly SubmissionType[]
> = {
  not_approved: ['suggest', 'payment_report', 'problem_report'],
  duplicate: ['suggest', 'photos'],
  no_change: ['suggest', 'photos'],
  withdrawn: ['suggest', 'payment_report', 'problem_report', 'claim', 'photos'],
};

const actionSpecifications = {
  not_approved: {
    toStatus: 'resolved',
    resolution: 'not_approved',
    eventAction: 'submission_not_approved',
  },
  duplicate: {
    toStatus: 'duplicate',
    resolution: 'duplicate',
    eventAction: 'submission_duplicate_resolved',
  },
  no_change: {
    toStatus: 'resolved',
    resolution: 'no_change',
    eventAction: 'submission_no_change_resolved',
  },
  withdrawn: {
    toStatus: 'withdrawn',
    resolution: 'withdrawn',
    eventAction: 'submission_withdrawn',
  },
} as const;

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

function assertSubmissionType(
  state: SubmissionTerminalResolutionState | null,
  request: SubmissionTerminalResolutionRequest,
): SubmissionTerminalResolutionState {
  if (state === null || state.submissionType !== request.submissionType) {
    throw new SubmissionTerminalResolutionError(
      'not_found',
      'The requested terminal-resolution Submission was not found.',
    );
  }
  return state;
}

function assertEligible(request: SubmissionTerminalResolutionRequest): void {
  if (!eligibility[request.action].includes(request.submissionType)) {
    throw new SubmissionTerminalResolutionError(
      'ineligible',
      `The ${request.action} outcome is owned by a type-specific boundary or does not apply to this Submission type.`,
    );
  }
}

function assertDuplicateTarget(
  source: SubmissionTerminalResolutionState,
  target: SubmissionTerminalResolutionDuplicateTarget | null,
): SubmissionTerminalResolutionDuplicateTarget {
  if (target === null) {
    throw new SubmissionTerminalResolutionError(
      'ineligible',
      'The referenced duplicate Submission was not found.',
    );
  }
  if (target.submissionId === source.submissionId) {
    throw new SubmissionTerminalResolutionError(
      'ineligible',
      'A Submission cannot be resolved as a duplicate of itself.',
    );
  }
  if (target.submissionType !== source.submissionType) {
    throw new SubmissionTerminalResolutionError(
      'ineligible',
      'The referenced duplicate Submission must use the same Submission type.',
    );
  }
  if (['duplicate', 'rejected_spam', 'withdrawn'].includes(target.workflowStatus)) {
    throw new SubmissionTerminalResolutionError(
      'ineligible',
      'The referenced duplicate Submission cannot itself be duplicate, spam, or withdrawn.',
    );
  }
  return target;
}

function replayReceipt(
  event: SubmissionTerminalResolutionEventRecord,
  submissionId: string,
  request: SubmissionTerminalResolutionRequest,
  actorId: string,
  requestFingerprint: string,
): SubmissionTerminalResolutionReceipt {
  const specification = actionSpecifications[request.action];
  const payload = parseSubmissionTerminalResolutionEventPayload(event.internalNote);
  if (
    event.submissionId !== submissionId ||
    event.fromStatus !== request.expectedStatus ||
    event.toStatus !== specification.toStatus ||
    event.action !== specification.eventAction ||
    event.reasonCode !== request.reasonCode ||
    event.actorId !== actorId ||
    payload === null ||
    payload.requestFingerprint !== requestFingerprint ||
    payload.submissionType !== request.submissionType ||
    payload.action !== request.action ||
    payload.resolution !== specification.resolution ||
    payload.reasonCode !== request.reasonCode ||
    payload.publicMessage !== request.publicMessage ||
    payload.internalNote !== request.internalNote ||
    payload.duplicateSubmissionId !== request.duplicateSubmissionId
  ) {
    throw new SubmissionTerminalResolutionError(
      'idempotency_conflict',
      'The terminal-resolution request ID was already used for a different operation.',
    );
  }

  return submissionTerminalResolutionReceiptSchema.parse({
    state: 'replayed',
    submissionId,
    submissionType: request.submissionType,
    action: request.action,
    fromStatus: request.expectedStatus,
    toStatus: specification.toStatus,
    resolution: specification.resolution,
    reasonCode: request.reasonCode,
    publicMessage: payload.publicMessage,
    duplicateSubmissionId: payload.duplicateSubmissionId,
    duplicateSubmissionPublicId: payload.duplicateSubmissionPublicId,
    changedAt: event.createdAt,
  });
}

async function readEvent(
  backend: SubmissionTerminalResolutionBackend,
  eventId: string,
): Promise<SubmissionTerminalResolutionEventRecord | null> {
  try {
    return await backend.readEvent(eventId);
  } catch (error) {
    throw new SubmissionTerminalResolutionError(
      'backend_failure',
      'The terminal-resolution replay check failed.',
      { cause: error },
    );
  }
}

async function readState(
  backend: SubmissionTerminalResolutionBackend,
  submissionId: string,
): Promise<SubmissionTerminalResolutionState | null> {
  try {
    return await backend.readState(submissionId);
  } catch (error) {
    throw new SubmissionTerminalResolutionError(
      'backend_failure',
      'The terminal-resolution Submission state could not be loaded.',
      { cause: error },
    );
  }
}

async function readDuplicateTarget(
  backend: SubmissionTerminalResolutionBackend,
  submissionId: string,
): Promise<SubmissionTerminalResolutionDuplicateTarget | null> {
  try {
    return await backend.readDuplicateTarget(submissionId);
  } catch (error) {
    throw new SubmissionTerminalResolutionError(
      'backend_failure',
      'The referenced duplicate Submission could not be loaded.',
      { cause: error },
    );
  }
}

export async function applySubmissionTerminalResolution(
  context: SubmissionTerminalResolutionContext,
  backend: SubmissionTerminalResolutionBackend,
  submissionId: string,
  rawRequest: unknown,
  changedAt = new Date(),
): Promise<SubmissionTerminalResolutionReceipt> {
  if (!context.capabilities.includes('submission:terminal-resolution')) {
    throw new SubmissionTerminalResolutionError(
      'unauthorized',
      'The actor is not authorized for Submission terminal resolution.',
    );
  }

  const submissionIdResult = z.uuid().safeParse(submissionId);
  const requestResult = submissionTerminalResolutionRequestSchema.safeParse(rawRequest);
  if (!submissionIdResult.success || !requestResult.success || Number.isNaN(changedAt.getTime())) {
    throw new SubmissionTerminalResolutionError(
      'invalid_request',
      'The terminal-resolution request is invalid.',
    );
  }
  const request = requestResult.data;
  assertEligible(request);
  const requestFingerprint = await sha256(request);

  const existingEvent = await readEvent(backend, request.requestId);
  if (existingEvent !== null) {
    return replayReceipt(
      existingEvent,
      submissionIdResult.data,
      request,
      context.actorId,
      requestFingerprint,
    );
  }

  const source = assertSubmissionType(await readState(backend, submissionIdResult.data), request);
  if (
    source.workflowStatus !== request.expectedStatus ||
    source.resolution !== null ||
    source.updatedAt !== request.expectedUpdatedAt
  ) {
    throw new SubmissionTerminalResolutionError(
      'conflict',
      'The Submission state changed before terminal resolution was applied.',
    );
  }

  const duplicateTarget =
    request.action === 'duplicate'
      ? assertDuplicateTarget(
          source,
          await readDuplicateTarget(backend, request.duplicateSubmissionId),
        )
      : null;
  const specification = actionSpecifications[request.action];
  const eventPayload: SubmissionTerminalResolutionEventPayload = {
    schemaVersion: 'submission-terminal-resolution-event-v1',
    requestFingerprint,
    submissionType: request.submissionType,
    action: request.action,
    resolution: specification.resolution,
    reasonCode: request.reasonCode,
    publicMessage: request.publicMessage,
    internalNote: request.internalNote,
    duplicateSubmissionId: duplicateTarget?.submissionId ?? null,
    duplicateSubmissionPublicId: duplicateTarget?.publicId ?? null,
  };
  const internalNote = serializeSubmissionTerminalResolutionEventPayload(eventPayload);

  try {
    await backend.commitResolution({
      eventId: request.requestId,
      submissionId: submissionIdResult.data,
      submissionType: request.submissionType,
      expectedStatus: request.expectedStatus,
      expectedUpdatedAt: new Date(request.expectedUpdatedAt),
      toStatus: specification.toStatus,
      resolution: specification.resolution,
      eventAction: specification.eventAction,
      reasonCode: request.reasonCode,
      actorId: context.actorId,
      actorType: context.actorType,
      internalNote,
      duplicateSubmissionId: duplicateTarget?.submissionId ?? null,
      changedAt,
    });
  } catch (error) {
    if (error instanceof SubmissionPersistenceError && error.code === 'conflict') {
      const racedEvent = await readEvent(backend, request.requestId);
      if (racedEvent !== null) {
        return replayReceipt(
          racedEvent,
          submissionIdResult.data,
          request,
          context.actorId,
          requestFingerprint,
        );
      }
      throw new SubmissionTerminalResolutionError(
        'conflict',
        'The Submission state changed before terminal resolution was committed.',
        { cause: error },
      );
    }
    throw new SubmissionTerminalResolutionError(
      'backend_failure',
      'The Submission terminal resolution could not be committed.',
      { cause: error },
    );
  }

  return submissionTerminalResolutionReceiptSchema.parse({
    state: 'committed',
    submissionId: submissionIdResult.data,
    submissionType: request.submissionType,
    action: request.action,
    fromStatus: request.expectedStatus,
    toStatus: specification.toStatus,
    resolution: specification.resolution,
    reasonCode: request.reasonCode,
    publicMessage: request.publicMessage,
    duplicateSubmissionId: duplicateTarget?.submissionId ?? null,
    duplicateSubmissionPublicId: duplicateTarget?.publicId ?? null,
    changedAt: changedAt.toISOString(),
  });
}
