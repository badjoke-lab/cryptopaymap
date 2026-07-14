import { z } from 'zod';
import type { SubmissionWorkflowStatus } from '../../submissions/contract';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type { SubmissionTransitionContext } from './authorization';

const timestampSchema = z.iso.datetime({ offset: true });

export const businessClaimReviewTransitionActionValues = [
  'begin_triage',
  'begin_review',
  'request_information',
  'place_on_hold',
  'resume_information_review',
  'resume_hold_review',
] as const;
export const businessClaimReviewTransitionActionSchema = z.enum(
  businessClaimReviewTransitionActionValues,
);

export const businessClaimReviewReasonCodeValues = [
  'initial_review',
  'verification_prerequisites',
  'missing_information',
  'conflicting_information',
  'awaiting_official_confirmation',
  'authority_review',
  'information_received',
  'hold_released',
] as const;
export const businessClaimReviewReasonCodeSchema = z.enum(
  businessClaimReviewReasonCodeValues,
);

const expectedStatusSchema = z.enum([
  'received',
  'triage',
  'in_review',
  'needs_information',
  'on_hold',
]);

export const businessClaimReviewTransitionRequestSchema = z
  .object({
    schemaVersion: z.literal('business-claim-review-transition-v1'),
    requestId: z.uuid(),
    action: businessClaimReviewTransitionActionSchema,
    expectedStatus: expectedStatusSchema,
    expectedUpdatedAt: timestampSchema,
    reasonCode: businessClaimReviewReasonCodeSchema,
  })
  .strict()
  .superRefine((request, context) => {
    const specification = actionSpecifications[request.action];
    if (request.expectedStatus !== specification.fromStatus) {
      context.addIssue({
        code: 'custom',
        path: ['expectedStatus'],
        message: `${request.action} requires expectedStatus ${specification.fromStatus}.`,
      });
    }
    if (!specification.allowedReasons.includes(request.reasonCode as never)) {
      context.addIssue({
        code: 'custom',
        path: ['reasonCode'],
        message: `${request.reasonCode} is not allowed for ${request.action}.`,
      });
    }
  });

export const businessClaimReviewTransitionReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed']),
    submissionId: z.uuid(),
    fromStatus: expectedStatusSchema,
    toStatus: z.enum(['triage', 'in_review', 'needs_information', 'on_hold']),
    action: businessClaimReviewTransitionActionSchema,
    reasonCode: businessClaimReviewReasonCodeSchema,
    changedAt: timestampSchema,
  })
  .strict();

export type BusinessClaimReviewTransitionRequest = z.infer<
  typeof businessClaimReviewTransitionRequestSchema
>;
export type BusinessClaimReviewTransitionReceipt = z.infer<
  typeof businessClaimReviewTransitionReceiptSchema
>;

export interface BusinessClaimReviewTransitionState {
  submissionId: string;
  submissionType: string;
  workflowStatus: SubmissionWorkflowStatus;
  updatedAt: string;
}

export interface BusinessClaimReviewTransitionEventRecord {
  eventId: string;
  submissionId: string;
  fromStatus: SubmissionWorkflowStatus | null;
  toStatus: SubmissionWorkflowStatus;
  action: string;
  reasonCode: string | null;
  actorId: string;
  createdAt: string;
}

export interface BusinessClaimReviewTransitionCommitCommand {
  eventId: string;
  submissionId: string;
  expectedStatus: 'received' | 'triage' | 'in_review' | 'needs_information' | 'on_hold';
  expectedUpdatedAt: Date;
  toStatus: 'triage' | 'in_review' | 'needs_information' | 'on_hold';
  eventAction: string;
  reasonCode: BusinessClaimReviewTransitionRequest['reasonCode'];
  actorId: string;
  changedAt: Date;
}

export interface BusinessClaimReviewTransitionBackend {
  readState(submissionId: string): Promise<BusinessClaimReviewTransitionState | null>;
  readEvent(eventId: string): Promise<BusinessClaimReviewTransitionEventRecord | null>;
  commitTransition(command: BusinessClaimReviewTransitionCommitCommand): Promise<void>;
}

export class BusinessClaimReviewTransitionError extends Error {
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
    this.name = 'BusinessClaimReviewTransitionError';
  }
}

const actionSpecifications = {
  begin_triage: {
    fromStatus: 'received',
    toStatus: 'triage',
    eventAction: 'business_claim_triage_started',
    allowedReasons: ['initial_review'],
  },
  begin_review: {
    fromStatus: 'triage',
    toStatus: 'in_review',
    eventAction: 'business_claim_review_started',
    allowedReasons: ['initial_review', 'verification_prerequisites'],
  },
  request_information: {
    fromStatus: 'in_review',
    toStatus: 'needs_information',
    eventAction: 'business_claim_information_requested',
    allowedReasons: ['missing_information', 'conflicting_information'],
  },
  place_on_hold: {
    fromStatus: 'in_review',
    toStatus: 'on_hold',
    eventAction: 'business_claim_hold_started',
    allowedReasons: ['awaiting_official_confirmation', 'authority_review'],
  },
  resume_information_review: {
    fromStatus: 'needs_information',
    toStatus: 'in_review',
    eventAction: 'business_claim_information_review_resumed',
    allowedReasons: ['information_received'],
  },
  resume_hold_review: {
    fromStatus: 'on_hold',
    toStatus: 'in_review',
    eventAction: 'business_claim_hold_review_resumed',
    allowedReasons: ['hold_released'],
  },
} as const;

function replayReceipt(
  existing: BusinessClaimReviewTransitionEventRecord,
  submissionId: string,
  request: BusinessClaimReviewTransitionRequest,
  actorId: string,
): BusinessClaimReviewTransitionReceipt {
  const specification = actionSpecifications[request.action];
  if (
    existing.submissionId !== submissionId ||
    existing.fromStatus !== specification.fromStatus ||
    existing.toStatus !== specification.toStatus ||
    existing.action !== specification.eventAction ||
    existing.reasonCode !== request.reasonCode ||
    existing.actorId !== actorId
  ) {
    throw new BusinessClaimReviewTransitionError(
      'idempotency_conflict',
      'The Claim review transition request ID was already used for a different operation.',
    );
  }
  return businessClaimReviewTransitionReceiptSchema.parse({
    state: 'replayed',
    submissionId,
    fromStatus: specification.fromStatus,
    toStatus: specification.toStatus,
    action: request.action,
    reasonCode: request.reasonCode,
    changedAt: existing.createdAt,
  });
}

export async function applyBusinessClaimReviewTransition(
  context: SubmissionTransitionContext,
  backend: BusinessClaimReviewTransitionBackend,
  submissionId: string,
  rawRequest: unknown,
  changedAt = new Date(),
): Promise<BusinessClaimReviewTransitionReceipt> {
  if (!context.capabilities.includes('submission:transition')) {
    throw new BusinessClaimReviewTransitionError(
      'unauthorized',
      'The actor is not authorized to transition Business Claim submissions.',
    );
  }

  const idResult = z.uuid().safeParse(submissionId);
  const requestResult = businessClaimReviewTransitionRequestSchema.safeParse(rawRequest);
  if (!idResult.success || !requestResult.success || Number.isNaN(changedAt.getTime())) {
    throw new BusinessClaimReviewTransitionError(
      'invalid_request',
      'The Business Claim review transition request is invalid.',
    );
  }
  const request = requestResult.data;
  const specification = actionSpecifications[request.action];

  let existingEvent: BusinessClaimReviewTransitionEventRecord | null;
  try {
    existingEvent = await backend.readEvent(request.requestId);
  } catch (error) {
    throw new BusinessClaimReviewTransitionError(
      'backend_failure',
      'The Business Claim review transition replay check failed.',
      { cause: error },
    );
  }
  if (existingEvent !== null) {
    return replayReceipt(existingEvent, idResult.data, request, context.actorId);
  }

  let currentState: BusinessClaimReviewTransitionState | null;
  try {
    currentState = await backend.readState(idResult.data);
  } catch (error) {
    throw new BusinessClaimReviewTransitionError(
      'backend_failure',
      'The Business Claim review state could not be loaded.',
      { cause: error },
    );
  }
  if (currentState === null || currentState.submissionType !== 'claim') {
    throw new BusinessClaimReviewTransitionError(
      'not_found',
      'The Business Claim submission was not found.',
    );
  }
  if (
    currentState.workflowStatus !== request.expectedStatus ||
    currentState.updatedAt !== request.expectedUpdatedAt
  ) {
    throw new BusinessClaimReviewTransitionError(
      'conflict',
      'The Business Claim submission state changed before the transition was applied.',
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
      reasonCode: request.reasonCode,
      actorId: context.actorId,
      changedAt,
    });
  } catch (error) {
    if (error instanceof SubmissionPersistenceError && error.code === 'conflict') {
      let racedEvent: BusinessClaimReviewTransitionEventRecord | null;
      try {
        racedEvent = await backend.readEvent(request.requestId);
      } catch (readError) {
        throw new BusinessClaimReviewTransitionError(
          'backend_failure',
          'The Business Claim review transition replay recovery failed.',
          { cause: readError },
        );
      }
      if (racedEvent !== null) {
        return replayReceipt(racedEvent, idResult.data, request, context.actorId);
      }
      throw new BusinessClaimReviewTransitionError(
        'conflict',
        'The Business Claim submission state changed before the transition was committed.',
        { cause: error },
      );
    }
    throw new BusinessClaimReviewTransitionError(
      'backend_failure',
      'The Business Claim review transition could not be committed.',
      { cause: error },
    );
  }

  return businessClaimReviewTransitionReceiptSchema.parse({
    state: 'committed',
    submissionId: idResult.data,
    fromStatus: specification.fromStatus,
    toStatus: specification.toStatus,
    action: request.action,
    reasonCode: request.reasonCode,
    changedAt: changedAt.toISOString(),
  });
}
