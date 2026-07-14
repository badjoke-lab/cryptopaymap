import { z } from 'zod';
import {
  businessClaimantRoleSchema,
  businessClaimTargetTypeSchema,
  ownershipVerificationMethodSchema,
  type BusinessClaimReviewProjection,
} from '../../submissions/business-claim-contract';
import { businessClaimReviewProjectionSchema } from '../../submissions/business-claim-target-context';
import { parseBusinessClaimVerificationRequestEventPayload } from '../../submissions/business-claim-verification-request-contract';
import {
  businessClaimVerificationOutcomeSchema,
  parseBusinessClaimVerificationResultEventPayload,
} from '../../submissions/business-claim-verification-result-contract';
import {
  businessClaimRelationshipDecisionReasonSchema,
  businessClaimRelationshipDecisionSchema,
  businessClaimRepresentativeRelationshipSchema,
  parseBusinessClaimRelationshipDecisionEventPayload,
  serializeBusinessClaimRelationshipDecisionEventPayload,
  type BusinessClaimRelationshipDecisionEventPayload,
} from '../../submissions/business-claim-relationship-decision-contract';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type { BusinessClaimRelationshipDecisionContext } from './business-claim-relationship-decision-authorization';

const timestampSchema = z.iso.datetime({ offset: true });

const nonApprovalReasonsByOutcome = {
  passed: ['authority_not_established', 'relationship_conflict', 'superseded_verification'],
  failed: ['verification_failed', 'authority_not_established'],
  inconclusive: ['verification_inconclusive', 'authority_not_established'],
  provider_error: ['provider_error', 'superseded_verification'],
} as const;

export const businessClaimRelationshipDecisionRequestSchema = z
  .object({
    schemaVersion: z.literal('business-claim-relationship-decision-v1'),
    decisionId: z.uuid(),
    executionId: z.uuid(),
    preparationId: z.uuid(),
    expectedSubmissionUpdatedAt: timestampSchema,
    expectedTargetType: businessClaimTargetTypeSchema,
    expectedTargetId: z.uuid(),
    expectedClaimantRole: businessClaimantRoleSchema,
    expectedMethod: ownershipVerificationMethodSchema,
    expectedOutcome: businessClaimVerificationOutcomeSchema,
    expectedResultCode: z.string().trim().min(1).max(96),
    expectedVerificationObservedAt: timestampSchema,
    expectedPreparationExpiresAt: timestampSchema,
    decision: businessClaimRelationshipDecisionSchema,
    reasonCode: businessClaimRelationshipDecisionReasonSchema,
  })
  .strict()
  .superRefine((request, context) => {
    if (request.decision === 'approve_relationship') {
      if (request.expectedOutcome !== 'passed') {
        context.addIssue({
          code: 'custom',
          path: ['expectedOutcome'],
          message: 'Relationship approval requires a passed verification result.',
        });
      }
      if (request.reasonCode !== 'verified_authority_confirmed') {
        context.addIssue({
          code: 'custom',
          path: ['reasonCode'],
          message: 'Relationship approval requires verified_authority_confirmed.',
        });
      }
    }

    if (request.decision === 'not_approved') {
      const allowedReasons = nonApprovalReasonsByOutcome[
        request.expectedOutcome
      ] as readonly string[];
      if (!allowedReasons.includes(request.reasonCode)) {
        context.addIssue({
          code: 'custom',
          path: ['reasonCode'],
          message: `${request.reasonCode} is not allowed for ${request.expectedOutcome}.`,
        });
      }
    }
  });

export const businessClaimRelationshipDecisionReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed']),
    submissionId: z.uuid(),
    decisionId: z.uuid(),
    decision: businessClaimRelationshipDecisionSchema,
    resolution: z.enum(['approved', 'not_approved']),
    reasonCode: businessClaimRelationshipDecisionReasonSchema,
    targetType: businessClaimTargetTypeSchema,
    targetId: z.uuid(),
    claimantRole: businessClaimantRoleSchema,
    verificationMethod: ownershipVerificationMethodSchema,
    preparationId: z.uuid(),
    executionId: z.uuid(),
    executionOutcome: businessClaimVerificationOutcomeSchema,
    relationship: businessClaimRepresentativeRelationshipSchema.nullable(),
    decidedAt: timestampSchema,
  })
  .strict();

export type BusinessClaimRelationshipDecisionRequest = z.infer<
  typeof businessClaimRelationshipDecisionRequestSchema
>;
export type BusinessClaimRelationshipDecisionReceipt = z.infer<
  typeof businessClaimRelationshipDecisionReceiptSchema
>;

export interface BusinessClaimRelationshipDecisionEventRecord {
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

export interface BusinessClaimRelationshipDecisionState {
  submissionId: string;
  submissionType: string;
  workflowStatus: string;
  updatedAt: string;
  normalizedProjection: unknown;
  executionEvent: BusinessClaimRelationshipDecisionEventRecord | null;
  preparationEvent: BusinessClaimRelationshipDecisionEventRecord | null;
}

export interface BusinessClaimRelationshipDecisionCommitCommand {
  eventId: string;
  submissionId: string;
  expectedUpdatedAt: Date;
  resolution: 'approved' | 'not_approved';
  eventAction: 'business_claim_relationship_approved' | 'business_claim_relationship_not_approved';
  reasonCode: BusinessClaimRelationshipDecisionRequest['reasonCode'];
  actorId: string;
  internalNote: string;
  decidedAt: Date;
}

export interface BusinessClaimRelationshipDecisionBackend {
  readState(
    submissionId: string,
    executionId: string,
    preparationId: string,
  ): Promise<BusinessClaimRelationshipDecisionState | null>;
  readDecisionEvent(
    decisionId: string,
  ): Promise<BusinessClaimRelationshipDecisionEventRecord | null>;
  commitDecision(command: BusinessClaimRelationshipDecisionCommitCommand): Promise<void>;
}

export class BusinessClaimRelationshipDecisionError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'invalid_request'
      | 'not_found'
      | 'conflict'
      | 'invalid_projection'
      | 'scope_missing'
      | 'invalid_verification_chain'
      | 'verification_not_passed'
      | 'preparation_expired'
      | 'idempotency_conflict'
      | 'backend_failure',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BusinessClaimRelationshipDecisionError';
  }
}

function eventActionForDecision(
  decision: BusinessClaimRelationshipDecisionRequest['decision'],
): BusinessClaimRelationshipDecisionCommitCommand['eventAction'] {
  return decision === 'approve_relationship'
    ? 'business_claim_relationship_approved'
    : 'business_claim_relationship_not_approved';
}

function resolutionForDecision(
  decision: BusinessClaimRelationshipDecisionRequest['decision'],
): BusinessClaimRelationshipDecisionCommitCommand['resolution'] {
  return decision === 'approve_relationship' ? 'approved' : 'not_approved';
}

function receiptFromEvent(
  state: 'committed' | 'replayed',
  submissionId: string,
  request: BusinessClaimRelationshipDecisionRequest,
  actorId: string,
  event: BusinessClaimRelationshipDecisionEventRecord,
): BusinessClaimRelationshipDecisionReceipt {
  const payload = parseBusinessClaimRelationshipDecisionEventPayload(event.internalNote);
  if (
    event.eventId !== request.decisionId ||
    event.submissionId !== submissionId ||
    event.fromStatus !== 'in_review' ||
    event.toStatus !== 'resolved' ||
    event.action !== eventActionForDecision(request.decision) ||
    event.reasonCode !== request.reasonCode ||
    event.actorId !== actorId ||
    payload === null ||
    payload.decisionId !== request.decisionId ||
    payload.expectedSubmissionUpdatedAt !== request.expectedSubmissionUpdatedAt ||
    payload.decision !== request.decision ||
    payload.reasonCode !== request.reasonCode ||
    payload.targetType !== request.expectedTargetType ||
    payload.targetId !== request.expectedTargetId ||
    payload.claimantRole !== request.expectedClaimantRole ||
    payload.verificationMethod !== request.expectedMethod ||
    payload.preparationId !== request.preparationId ||
    payload.executionId !== request.executionId ||
    payload.executionOutcome !== request.expectedOutcome ||
    payload.executionResultCode !== request.expectedResultCode ||
    payload.verificationObservedAt !== request.expectedVerificationObservedAt ||
    payload.preparationExpiresAt !== request.expectedPreparationExpiresAt
  ) {
    throw new BusinessClaimRelationshipDecisionError(
      'idempotency_conflict',
      'The relationship decision ID was already used for a different operation.',
    );
  }

  return businessClaimRelationshipDecisionReceiptSchema.parse({
    state,
    submissionId,
    decisionId: payload.decisionId,
    decision: payload.decision,
    resolution: resolutionForDecision(payload.decision),
    reasonCode: payload.reasonCode,
    targetType: payload.targetType,
    targetId: payload.targetId,
    claimantRole: payload.claimantRole,
    verificationMethod: payload.verificationMethod,
    preparationId: payload.preparationId,
    executionId: payload.executionId,
    executionOutcome: payload.executionOutcome,
    relationship: payload.relationship,
    decidedAt: event.createdAt,
  });
}

function validateVerificationChain(
  state: BusinessClaimRelationshipDecisionState,
  submissionId: string,
  request: BusinessClaimRelationshipDecisionRequest,
): {
  projection: BusinessClaimReviewProjection;
  verificationObservedAt: string;
} {
  const projectionResult = businessClaimReviewProjectionSchema.safeParse(
    state.normalizedProjection,
  );
  if (!projectionResult.success) {
    throw new BusinessClaimRelationshipDecisionError(
      'invalid_projection',
      'The stored Business Claim review projection is invalid.',
    );
  }
  const projection = projectionResult.data;
  if (!projection.requestedScopes.includes('representative_relationship')) {
    throw new BusinessClaimRelationshipDecisionError(
      'scope_missing',
      'The Business Claim did not request a representative relationship.',
    );
  }
  if (
    projection.targetType !== request.expectedTargetType ||
    projection.targetId !== request.expectedTargetId ||
    projection.claimantRole !== request.expectedClaimantRole ||
    projection.verification.method !== request.expectedMethod
  ) {
    throw new BusinessClaimRelationshipDecisionError(
      'conflict',
      'The Business Claim projection changed before the relationship decision.',
    );
  }

  const executionEvent = state.executionEvent;
  const execution = parseBusinessClaimVerificationResultEventPayload(
    executionEvent?.internalNote ?? null,
  );
  if (
    executionEvent === null ||
    executionEvent.eventId !== request.executionId ||
    executionEvent.submissionId !== submissionId ||
    executionEvent.fromStatus !== null ||
    executionEvent.toStatus !== 'in_review' ||
    executionEvent.action !== 'claim_verification_execution_recorded' ||
    executionEvent.reasonCode !== execution?.outcome ||
    execution === null ||
    execution.executionId !== request.executionId ||
    execution.preparationId !== request.preparationId ||
    execution.targetType !== request.expectedTargetType ||
    execution.targetId !== request.expectedTargetId ||
    execution.method !== request.expectedMethod ||
    execution.outcome !== request.expectedOutcome ||
    execution.resultCode !== request.expectedResultCode ||
    execution.observedAt !== request.expectedVerificationObservedAt ||
    execution.expectedPreparationExpiresAt !== request.expectedPreparationExpiresAt
  ) {
    throw new BusinessClaimRelationshipDecisionError(
      'invalid_verification_chain',
      'The Business Claim verification result does not match the requested decision chain.',
    );
  }

  const preparationEvent = state.preparationEvent;
  const preparation = parseBusinessClaimVerificationRequestEventPayload(
    preparationEvent?.internalNote ?? null,
  );
  if (
    preparationEvent === null ||
    preparationEvent.eventId !== request.preparationId ||
    preparationEvent.submissionId !== submissionId ||
    preparationEvent.fromStatus !== null ||
    preparationEvent.toStatus !== 'in_review' ||
    preparationEvent.action !== 'claim_verification_request_prepared' ||
    preparationEvent.reasonCode !== preparation?.method ||
    preparation === null ||
    preparation.preparationId !== request.preparationId ||
    preparation.targetType !== request.expectedTargetType ||
    preparation.targetId !== request.expectedTargetId ||
    preparation.method !== request.expectedMethod ||
    preparation.expiresAt !== request.expectedPreparationExpiresAt
  ) {
    throw new BusinessClaimRelationshipDecisionError(
      'invalid_verification_chain',
      'The Business Claim verification preparation does not match the execution result.',
    );
  }

  return { projection, verificationObservedAt: execution.observedAt };
}

export async function decideBusinessClaimRepresentativeRelationship(
  context: BusinessClaimRelationshipDecisionContext,
  backend: BusinessClaimRelationshipDecisionBackend,
  submissionId: string,
  rawRequest: unknown,
  decidedAt = new Date(),
): Promise<BusinessClaimRelationshipDecisionReceipt> {
  if (!context.capabilities.includes('submission:claim-relationship:decide')) {
    throw new BusinessClaimRelationshipDecisionError(
      'unauthorized',
      'The actor is not authorized to decide Business Claim representative relationships.',
    );
  }

  const submissionIdResult = z.uuid().safeParse(submissionId);
  const requestResult = businessClaimRelationshipDecisionRequestSchema.safeParse(rawRequest);
  if (!submissionIdResult.success || !requestResult.success || Number.isNaN(decidedAt.getTime())) {
    throw new BusinessClaimRelationshipDecisionError(
      'invalid_request',
      'The Business Claim relationship decision request is invalid.',
    );
  }
  const request = requestResult.data;

  let existingEvent: BusinessClaimRelationshipDecisionEventRecord | null;
  try {
    existingEvent = await backend.readDecisionEvent(request.decisionId);
  } catch (error) {
    throw new BusinessClaimRelationshipDecisionError(
      'backend_failure',
      'The relationship decision replay check failed.',
      { cause: error },
    );
  }
  if (existingEvent !== null) {
    return receiptFromEvent(
      'replayed',
      submissionIdResult.data,
      request,
      context.actorId,
      existingEvent,
    );
  }

  let currentState: BusinessClaimRelationshipDecisionState | null;
  try {
    currentState = await backend.readState(
      submissionIdResult.data,
      request.executionId,
      request.preparationId,
    );
  } catch (error) {
    throw new BusinessClaimRelationshipDecisionError(
      'backend_failure',
      'The Business Claim relationship decision state could not be loaded.',
      { cause: error },
    );
  }
  if (currentState === null || currentState.submissionType !== 'claim') {
    throw new BusinessClaimRelationshipDecisionError(
      'not_found',
      'The Business Claim submission or verification chain was not found.',
    );
  }
  if (
    currentState.workflowStatus !== 'in_review' ||
    currentState.updatedAt !== request.expectedSubmissionUpdatedAt
  ) {
    throw new BusinessClaimRelationshipDecisionError(
      'conflict',
      'The Business Claim submission changed before the relationship decision.',
    );
  }

  const chain = validateVerificationChain(currentState, submissionIdResult.data, request);
  if (request.decision === 'approve_relationship') {
    if (request.expectedOutcome !== 'passed') {
      throw new BusinessClaimRelationshipDecisionError(
        'verification_not_passed',
        'A representative relationship requires a passed verification result.',
      );
    }
    if (new Date(request.expectedPreparationExpiresAt).getTime() <= decidedAt.getTime()) {
      throw new BusinessClaimRelationshipDecisionError(
        'preparation_expired',
        'The verification preparation expired before the relationship decision.',
      );
    }
  }

  const relationship =
    request.decision === 'approve_relationship'
      ? {
          relationshipId: request.decisionId,
          status: 'active' as const,
          targetType: request.expectedTargetType,
          targetId: request.expectedTargetId,
          claimantRole: chain.projection.claimantRole,
          approvedScope: 'representative_relationship' as const,
          verificationMethod: request.expectedMethod,
          preparationId: request.preparationId,
          executionId: request.executionId,
          verifiedAt: chain.verificationObservedAt,
          createdAt: decidedAt.toISOString(),
        }
      : null;

  const eventPayload: BusinessClaimRelationshipDecisionEventPayload = {
    schemaVersion: 'business-claim-relationship-decision-event-v1',
    decisionId: request.decisionId,
    expectedSubmissionUpdatedAt: request.expectedSubmissionUpdatedAt,
    decision: request.decision,
    reasonCode: request.reasonCode,
    targetType: request.expectedTargetType,
    targetId: request.expectedTargetId,
    claimantRole: chain.projection.claimantRole,
    approvedScope:
      request.decision === 'approve_relationship' ? 'representative_relationship' : null,
    verificationMethod: request.expectedMethod,
    preparationId: request.preparationId,
    executionId: request.executionId,
    executionOutcome: request.expectedOutcome,
    executionResultCode: request.expectedResultCode,
    verificationObservedAt: chain.verificationObservedAt,
    preparationExpiresAt: request.expectedPreparationExpiresAt,
    relationship,
  };
  const internalNote = serializeBusinessClaimRelationshipDecisionEventPayload(eventPayload);

  try {
    await backend.commitDecision({
      eventId: request.decisionId,
      submissionId: submissionIdResult.data,
      expectedUpdatedAt: new Date(request.expectedSubmissionUpdatedAt),
      resolution: resolutionForDecision(request.decision),
      eventAction: eventActionForDecision(request.decision),
      reasonCode: request.reasonCode,
      actorId: context.actorId,
      internalNote,
      decidedAt,
    });
  } catch (error) {
    if (error instanceof SubmissionPersistenceError && error.code === 'conflict') {
      let racedEvent: BusinessClaimRelationshipDecisionEventRecord | null;
      try {
        racedEvent = await backend.readDecisionEvent(request.decisionId);
      } catch (readError) {
        throw new BusinessClaimRelationshipDecisionError(
          'backend_failure',
          'The relationship decision replay recovery failed.',
          { cause: readError },
        );
      }
      if (racedEvent !== null) {
        return receiptFromEvent(
          'replayed',
          submissionIdResult.data,
          request,
          context.actorId,
          racedEvent,
        );
      }
      throw new BusinessClaimRelationshipDecisionError(
        'conflict',
        'The Business Claim submission changed before the relationship decision committed.',
        { cause: error },
      );
    }
    throw new BusinessClaimRelationshipDecisionError(
      'backend_failure',
      'The Business Claim relationship decision could not be recorded.',
      { cause: error },
    );
  }

  const committedEvent: BusinessClaimRelationshipDecisionEventRecord = {
    eventId: request.decisionId,
    submissionId: submissionIdResult.data,
    fromStatus: 'in_review',
    toStatus: 'resolved',
    action: eventActionForDecision(request.decision),
    reasonCode: request.reasonCode,
    actorId: context.actorId,
    internalNote,
    createdAt: decidedAt.toISOString(),
  };
  return receiptFromEvent(
    'committed',
    submissionIdResult.data,
    request,
    context.actorId,
    committedEvent,
  );
}
