import { z } from 'zod';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import {
  submissionApplicationKindSchema,
  submissionApplicationReceiptReferenceSchema,
  submissionApplicationSourceDecisionKindSchema,
  submissionApplicationStatusSchema,
  submissionPublicationStatusSchema,
  type SubmissionApplicationKind,
  type SubmissionApplicationReceiptReference,
  type SubmissionApplicationSourceDecisionKind,
  type SubmissionApplicationStatus,
  type SubmissionPublicationStatus,
} from './application-registration';

const timestampSchema = z.iso.datetime({ offset: true });

export const submissionApplicationTransitionOperationValues = [
  'commit_application',
  'fail_application',
  'retry_application',
  'commit_publication',
  'fail_publication',
  'retry_publication',
] as const;
export const submissionApplicationTransitionOperationSchema = z.enum(
  submissionApplicationTransitionOperationValues,
);

export const submissionApplicationLifecycleEventActionSchema = z.enum([
  'registered',
  'application_committed',
  'application_failed',
  'application_retried',
  'publication_committed',
  'publication_failed',
  'publication_retried',
]);

export const submissionApplicationLifecycleEventSchema = z
  .object({
    eventId: z.uuid(),
    action: submissionApplicationLifecycleEventActionSchema,
    fromApplicationStatus: submissionApplicationStatusSchema.nullable(),
    toApplicationStatus: submissionApplicationStatusSchema,
    fromPublicationStatus: submissionPublicationStatusSchema.nullable(),
    toPublicationStatus: submissionPublicationStatusSchema,
    createdAt: timestampSchema,
  })
  .strict();

export const submissionApplicationLifecycleProjectionSchema = z
  .object({
    applicationId: z.uuid(),
    submissionId: z.uuid(),
    submissionType: z.enum(['suggest', 'payment_report', 'problem_report', 'claim', 'photos']),
    sourceDecisionKind: submissionApplicationSourceDecisionKindSchema,
    sourceDecisionEventId: z.uuid(),
    applicationKind: submissionApplicationKindSchema,
    applicationStatus: submissionApplicationStatusSchema,
    publicationStatus: submissionPublicationStatusSchema,
    applicationReceipt: submissionApplicationReceiptReferenceSchema.nullable(),
    publicationReceipt: submissionApplicationReceiptReferenceSchema.nullable(),
    registeredAt: timestampSchema,
    updatedAt: timestampSchema,
    events: z.array(submissionApplicationLifecycleEventSchema).min(1).max(50),
  })
  .strict();

export const submissionApplicationTransitionRequestSchema = z
  .object({
    schemaVersion: z.literal('submission-application-transition-v1'),
    requestId: z.uuid(),
    operation: submissionApplicationTransitionOperationSchema,
    expectedApplicationStatus: submissionApplicationStatusSchema,
    expectedPublicationStatus: submissionPublicationStatusSchema,
    expectedUpdatedAt: timestampSchema,
    receipt: submissionApplicationReceiptReferenceSchema.nullable(),
  })
  .strict()
  .superRefine((request, context) => {
    const expected: Record<
      z.infer<typeof submissionApplicationTransitionOperationSchema>,
      {
        applicationStatus: SubmissionApplicationStatus;
        publicationStatus: SubmissionPublicationStatus;
      }
    > = {
      commit_application: { applicationStatus: 'pending', publicationStatus: 'blocked' },
      fail_application: { applicationStatus: 'pending', publicationStatus: 'blocked' },
      retry_application: { applicationStatus: 'failed', publicationStatus: 'blocked' },
      commit_publication: { applicationStatus: 'committed', publicationStatus: 'pending' },
      fail_publication: { applicationStatus: 'committed', publicationStatus: 'pending' },
      retry_publication: { applicationStatus: 'committed', publicationStatus: 'failed' },
    };
    const state = expected[request.operation];
    if (
      request.expectedApplicationStatus !== state.applicationStatus ||
      request.expectedPublicationStatus !== state.publicationStatus
    ) {
      context.addIssue({
        code: 'custom',
        path: ['expectedApplicationStatus'],
        message: 'The expected lifecycle state does not match the requested operation.',
      });
    }

    if (request.operation === 'commit_application') {
      if (request.receipt === null || request.receipt.kind === 'export_release_decision') {
        context.addIssue({
          code: 'custom',
          path: ['receipt'],
          message: 'Application commit requires a non-publication application receipt.',
        });
      }
      return;
    }
    if (request.operation === 'commit_publication') {
      if (request.receipt?.kind !== 'export_release_decision') {
        context.addIssue({
          code: 'custom',
          path: ['receipt'],
          message: 'Publication commit requires an export release decision receipt.',
        });
      }
      return;
    }
    if (request.receipt !== null) {
      context.addIssue({
        code: 'custom',
        path: ['receipt'],
        message: 'This lifecycle transition does not accept a receipt.',
      });
    }
  });

export const submissionApplicationTransitionReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed']),
    transitionEventId: z.uuid(),
    applicationId: z.uuid(),
    action: submissionApplicationLifecycleEventActionSchema.exclude(['registered']),
    fromApplicationStatus: submissionApplicationStatusSchema,
    toApplicationStatus: submissionApplicationStatusSchema,
    fromPublicationStatus: submissionPublicationStatusSchema,
    toPublicationStatus: submissionPublicationStatusSchema,
    receipt: submissionApplicationReceiptReferenceSchema.nullable(),
    changedAt: timestampSchema,
  })
  .strict();

export type SubmissionApplicationTransitionOperation = z.infer<
  typeof submissionApplicationTransitionOperationSchema
>;
export type SubmissionApplicationTransitionRequest = z.infer<
  typeof submissionApplicationTransitionRequestSchema
>;
export type SubmissionApplicationTransitionReceipt = z.infer<
  typeof submissionApplicationTransitionReceiptSchema
>;
export type SubmissionApplicationLifecycleProjection = z.infer<
  typeof submissionApplicationLifecycleProjectionSchema
>;
export type SubmissionApplicationLifecycleEvent = z.infer<
  typeof submissionApplicationLifecycleEventSchema
>;
export type SubmissionApplicationLifecycleEventAction = z.infer<
  typeof submissionApplicationLifecycleEventActionSchema
>;

export interface SubmissionApplicationLifecycleReadContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:application:read'];
}

export interface SubmissionApplicationLifecycleTransitionContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:application:transition'];
}

export interface SubmissionApplicationLifecycleRecord {
  applicationId: string;
  submissionId: string;
  submissionType: 'suggest' | 'payment_report' | 'problem_report' | 'claim' | 'photos';
  sourceDecisionKind: SubmissionApplicationSourceDecisionKind;
  sourceDecisionEventId: string;
  applicationKind: SubmissionApplicationKind;
  applicationStatus: SubmissionApplicationStatus;
  publicationStatus: SubmissionPublicationStatus;
  applicationReceipt: SubmissionApplicationReceiptReference | null;
  publicationReceipt: SubmissionApplicationReceiptReference | null;
  registeredAt: string;
  updatedAt: string;
  events: SubmissionApplicationLifecycleEvent[];
}

export interface SubmissionApplicationTransitionReplayRecord {
  transitionEventId: string;
  applicationId: string;
  action: Exclude<SubmissionApplicationLifecycleEventAction, 'registered'> | 'registered';
  fromApplicationStatus: SubmissionApplicationStatus | null;
  toApplicationStatus: SubmissionApplicationStatus;
  fromPublicationStatus: SubmissionPublicationStatus | null;
  toPublicationStatus: SubmissionPublicationStatus;
  actorId: string;
  requestFingerprint: string;
  changedAt: string;
}

export interface SubmissionApplicationTransitionCommand {
  transitionEventId: string;
  applicationId: string;
  sourceDecisionEventId: string;
  action: Exclude<SubmissionApplicationLifecycleEventAction, 'registered'>;
  fromApplicationStatus: SubmissionApplicationStatus;
  toApplicationStatus: SubmissionApplicationStatus;
  fromPublicationStatus: SubmissionPublicationStatus;
  toPublicationStatus: SubmissionPublicationStatus;
  expectedUpdatedAt: Date;
  nextApplicationReceipt: SubmissionApplicationReceiptReference | null;
  nextPublicationReceipt: SubmissionApplicationReceiptReference | null;
  actorId: string;
  actorType: 'human' | 'system';
  requestFingerprint: string;
  changedAt: Date;
}

export interface SubmissionApplicationLifecycleBackend {
  readApplication(applicationId: string): Promise<SubmissionApplicationLifecycleRecord | null>;
  readTransition(requestId: string): Promise<SubmissionApplicationTransitionReplayRecord | null>;
  commitTransition(command: SubmissionApplicationTransitionCommand): Promise<void>;
}

export class SubmissionApplicationLifecycleError extends Error {
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
    this.name = 'SubmissionApplicationLifecycleError';
  }
}

interface TransitionPlan {
  action: Exclude<SubmissionApplicationLifecycleEventAction, 'registered'>;
  toApplicationStatus: SubmissionApplicationStatus;
  toPublicationStatus: SubmissionPublicationStatus;
  nextApplicationReceipt: SubmissionApplicationReceiptReference | null;
  nextPublicationReceipt: SubmissionApplicationReceiptReference | null;
}

const operationActions: Record<
  SubmissionApplicationTransitionOperation,
  Exclude<SubmissionApplicationLifecycleEventAction, 'registered'>
> = {
  commit_application: 'application_committed',
  fail_application: 'application_failed',
  retry_application: 'application_retried',
  commit_publication: 'publication_committed',
  fail_publication: 'publication_failed',
  retry_publication: 'publication_retried',
};

function planTransition(
  current: SubmissionApplicationLifecycleRecord,
  request: SubmissionApplicationTransitionRequest,
): TransitionPlan {
  switch (request.operation) {
    case 'commit_application':
      return {
        action: 'application_committed',
        toApplicationStatus: 'committed',
        toPublicationStatus: 'pending',
        nextApplicationReceipt: request.receipt,
        nextPublicationReceipt: null,
      };
    case 'fail_application':
      return {
        action: 'application_failed',
        toApplicationStatus: 'failed',
        toPublicationStatus: 'blocked',
        nextApplicationReceipt: null,
        nextPublicationReceipt: null,
      };
    case 'retry_application':
      return {
        action: 'application_retried',
        toApplicationStatus: 'pending',
        toPublicationStatus: 'blocked',
        nextApplicationReceipt: null,
        nextPublicationReceipt: null,
      };
    case 'commit_publication':
      return {
        action: 'publication_committed',
        toApplicationStatus: 'committed',
        toPublicationStatus: 'committed',
        nextApplicationReceipt: current.applicationReceipt,
        nextPublicationReceipt: request.receipt,
      };
    case 'fail_publication':
      return {
        action: 'publication_failed',
        toApplicationStatus: 'committed',
        toPublicationStatus: 'failed',
        nextApplicationReceipt: current.applicationReceipt,
        nextPublicationReceipt: null,
      };
    case 'retry_publication':
      return {
        action: 'publication_retried',
        toApplicationStatus: 'committed',
        toPublicationStatus: 'pending',
        nextApplicationReceipt: current.applicationReceipt,
        nextPublicationReceipt: null,
      };
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

function projectLifecycle(record: SubmissionApplicationLifecycleRecord) {
  return submissionApplicationLifecycleProjectionSchema.parse(record);
}

function transitionReceipt(
  state: 'committed' | 'replayed',
  applicationId: string,
  request: SubmissionApplicationTransitionRequest,
  replay: SubmissionApplicationTransitionReplayRecord | null,
  plan: TransitionPlan,
  changedAt: Date,
): SubmissionApplicationTransitionReceipt {
  return submissionApplicationTransitionReceiptSchema.parse({
    state,
    transitionEventId: request.requestId,
    applicationId,
    action: replay?.action ?? plan.action,
    fromApplicationStatus: replay?.fromApplicationStatus ?? request.expectedApplicationStatus,
    toApplicationStatus: replay?.toApplicationStatus ?? plan.toApplicationStatus,
    fromPublicationStatus: replay?.fromPublicationStatus ?? request.expectedPublicationStatus,
    toPublicationStatus: replay?.toPublicationStatus ?? plan.toPublicationStatus,
    receipt: request.receipt,
    changedAt: replay?.changedAt ?? changedAt.toISOString(),
  });
}

async function verifyReplay(
  backend: SubmissionApplicationLifecycleBackend,
  replay: SubmissionApplicationTransitionReplayRecord,
  applicationId: string,
  context: SubmissionApplicationLifecycleTransitionContext,
  request: SubmissionApplicationTransitionRequest,
  requestFingerprint: string,
): Promise<SubmissionApplicationTransitionReceipt> {
  const current = await backend.readApplication(applicationId);
  if (current === null) {
    throw new SubmissionApplicationLifecycleError(
      'backend_failure',
      'The replayed application lifecycle record is unavailable.',
    );
  }
  const plan = planTransition(current, request);
  if (
    replay.applicationId !== applicationId ||
    replay.action !== operationActions[request.operation] ||
    replay.actorId !== context.actorId ||
    replay.requestFingerprint !== requestFingerprint ||
    replay.fromApplicationStatus === null ||
    replay.fromPublicationStatus === null
  ) {
    throw new SubmissionApplicationLifecycleError(
      'idempotency_conflict',
      'The lifecycle transition UUID was already used for different content.',
    );
  }
  return transitionReceipt(
    'replayed',
    applicationId,
    request,
    replay,
    plan,
    new Date(replay.changedAt),
  );
}

export async function readSubmissionApplicationLifecycle(
  context: SubmissionApplicationLifecycleReadContext,
  backend: SubmissionApplicationLifecycleBackend,
  applicationId: string,
): Promise<SubmissionApplicationLifecycleProjection> {
  if (!context.capabilities.includes('submission:application:read')) {
    throw new SubmissionApplicationLifecycleError(
      'unauthorized',
      'The actor is not authorized to read Submission application state.',
    );
  }
  const id = z.uuid().safeParse(applicationId);
  if (!id.success) {
    throw new SubmissionApplicationLifecycleError(
      'invalid_request',
      'The application lifecycle identifier is invalid.',
    );
  }
  let record: SubmissionApplicationLifecycleRecord | null;
  try {
    record = await backend.readApplication(id.data);
  } catch (error) {
    throw new SubmissionApplicationLifecycleError(
      'backend_failure',
      'The application lifecycle could not be loaded.',
      { cause: error },
    );
  }
  if (record === null) {
    throw new SubmissionApplicationLifecycleError(
      'not_found',
      'The application lifecycle was not found.',
    );
  }
  return projectLifecycle(record);
}

export async function transitionSubmissionApplicationLifecycle(
  context: SubmissionApplicationLifecycleTransitionContext,
  backend: SubmissionApplicationLifecycleBackend,
  applicationId: string,
  rawRequest: unknown,
  changedAt = new Date(),
): Promise<SubmissionApplicationTransitionReceipt> {
  if (!context.capabilities.includes('submission:application:transition')) {
    throw new SubmissionApplicationLifecycleError(
      'unauthorized',
      'The actor is not authorized to transition Submission application state.',
    );
  }
  const id = z.uuid().safeParse(applicationId);
  const parsed = submissionApplicationTransitionRequestSchema.safeParse(rawRequest);
  if (!id.success || !parsed.success || Number.isNaN(changedAt.getTime())) {
    throw new SubmissionApplicationLifecycleError(
      'invalid_request',
      'The application lifecycle transition request is invalid.',
    );
  }
  const request = parsed.data;
  const requestFingerprint = await sha256({ applicationId: id.data, request });

  let replay: SubmissionApplicationTransitionReplayRecord | null;
  try {
    replay = await backend.readTransition(request.requestId);
  } catch (error) {
    throw new SubmissionApplicationLifecycleError(
      'backend_failure',
      'The lifecycle transition replay check failed.',
      { cause: error },
    );
  }
  if (replay !== null) {
    try {
      return await verifyReplay(backend, replay, id.data, context, request, requestFingerprint);
    } catch (error) {
      if (error instanceof SubmissionApplicationLifecycleError) throw error;
      throw new SubmissionApplicationLifecycleError(
        'backend_failure',
        'The lifecycle transition replay could not be reconstructed.',
        { cause: error },
      );
    }
  }

  let current: SubmissionApplicationLifecycleRecord | null;
  try {
    current = await backend.readApplication(id.data);
  } catch (error) {
    throw new SubmissionApplicationLifecycleError(
      'backend_failure',
      'The application lifecycle could not be loaded for transition.',
      { cause: error },
    );
  }
  if (current === null) {
    throw new SubmissionApplicationLifecycleError(
      'not_found',
      'The application lifecycle was not found.',
    );
  }
  if (
    current.applicationStatus !== request.expectedApplicationStatus ||
    current.publicationStatus !== request.expectedPublicationStatus ||
    current.updatedAt !== request.expectedUpdatedAt
  ) {
    throw new SubmissionApplicationLifecycleError(
      'conflict',
      'The application lifecycle changed before the transition.',
    );
  }
  const plan = planTransition(current, request);
  if (plan.toApplicationStatus === 'committed' && plan.nextApplicationReceipt === null) {
    throw new SubmissionApplicationLifecycleError(
      'conflict',
      'A committed application must retain an application receipt.',
    );
  }

  const command: SubmissionApplicationTransitionCommand = {
    transitionEventId: request.requestId,
    applicationId: id.data,
    sourceDecisionEventId: current.sourceDecisionEventId,
    action: plan.action,
    fromApplicationStatus: current.applicationStatus,
    toApplicationStatus: plan.toApplicationStatus,
    fromPublicationStatus: current.publicationStatus,
    toPublicationStatus: plan.toPublicationStatus,
    expectedUpdatedAt: new Date(request.expectedUpdatedAt),
    nextApplicationReceipt: plan.nextApplicationReceipt,
    nextPublicationReceipt: plan.nextPublicationReceipt,
    actorId: context.actorId,
    actorType: context.actorType,
    requestFingerprint,
    changedAt,
  };

  try {
    await backend.commitTransition(command);
  } catch (error) {
    if (error instanceof SubmissionPersistenceError && error.code === 'conflict') {
      let raced: SubmissionApplicationTransitionReplayRecord | null;
      try {
        raced = await backend.readTransition(request.requestId);
      } catch (readError) {
        throw new SubmissionApplicationLifecycleError(
          'backend_failure',
          'Lifecycle transition replay recovery failed.',
          { cause: readError },
        );
      }
      if (raced !== null) {
        return verifyReplay(backend, raced, id.data, context, request, requestFingerprint);
      }
      throw new SubmissionApplicationLifecycleError(
        'conflict',
        'The application lifecycle changed before the transition committed.',
        { cause: error },
      );
    }
    throw new SubmissionApplicationLifecycleError(
      'backend_failure',
      'The application lifecycle transition could not be committed.',
      { cause: error },
    );
  }

  return transitionReceipt('committed', id.data, request, null, plan, changedAt);
}
