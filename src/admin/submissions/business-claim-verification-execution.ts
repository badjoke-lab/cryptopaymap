import { z } from 'zod';
import { ownershipVerificationMethodSchema } from '../../submissions/business-claim-contract';
import { parseBusinessClaimVerificationRequestEventPayload } from '../../submissions/business-claim-verification-request-contract';
import {
  businessClaimVerificationAdapterResultSchema,
  businessClaimVerificationOutcomeSchema,
  parseBusinessClaimVerificationResultEventPayload,
  serializeBusinessClaimVerificationResultEventPayload,
  type BusinessClaimVerificationAdapterResult,
} from '../../submissions/business-claim-verification-result-contract';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type { BusinessClaimVerificationExecutionContext } from './business-claim-verification-execution-authorization';

const timestampSchema = z.iso.datetime({ offset: true });

export const businessClaimVerificationExecutionRequestSchema = z
  .object({
    schemaVersion: z.literal('business-claim-verification-execution-v1'),
    executionId: z.uuid(),
    preparationId: z.uuid(),
    expectedSubmissionUpdatedAt: timestampSchema,
    expectedMethod: ownershipVerificationMethodSchema,
    expectedPreparationExpiresAt: timestampSchema,
  })
  .strict();

export const businessClaimVerificationExecutionReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed']),
    submissionId: z.uuid(),
    executionId: z.uuid(),
    preparationId: z.uuid(),
    targetType: z.enum(['entity', 'location']),
    targetId: z.uuid(),
    method: ownershipVerificationMethodSchema,
    outcome: businessClaimVerificationOutcomeSchema,
    resultCode: z.string().trim().min(1).max(96),
    observedAt: timestampSchema,
    retryable: z.boolean(),
    summary: z.string().trim().min(1).max(500),
    adapterId: z.string().trim().min(1).max(96),
    adapterVersion: z.string().trim().min(1).max(64),
    executedAt: timestampSchema,
  })
  .strict();

export type BusinessClaimVerificationExecutionRequest = z.infer<
  typeof businessClaimVerificationExecutionRequestSchema
>;
export type BusinessClaimVerificationExecutionReceipt = z.infer<
  typeof businessClaimVerificationExecutionReceiptSchema
>;

export interface BusinessClaimVerificationPreparationEventRecord {
  eventId: string;
  submissionId: string;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  reasonCode: string | null;
  internalNote: string | null;
  createdAt: string;
}

export interface BusinessClaimVerificationExecutionEventRecord {
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

export interface BusinessClaimVerificationExecutionState {
  submissionId: string;
  submissionType: string;
  workflowStatus: string;
  updatedAt: string;
  preparationEvent: BusinessClaimVerificationPreparationEventRecord | null;
}

export interface BusinessClaimVerificationAdapterCommand {
  executionId: string;
  submissionId: string;
  preparationId: string;
  targetType: 'entity' | 'location';
  targetId: string;
  method: BusinessClaimVerificationExecutionRequest['expectedMethod'];
  officialDomain: string | null;
  officialWebsiteUrl: string | null;
  officialSocialUrl: string | null;
  protectedContactPresent: boolean;
  privateProofPresent: boolean;
  assistedVerifierReferencePresent: boolean;
  executedAt: Date;
}

export interface BusinessClaimVerificationMethodAdapter {
  method: BusinessClaimVerificationExecutionRequest['expectedMethod'];
  adapterId: string;
  adapterVersion: string;
  execute(command: BusinessClaimVerificationAdapterCommand): Promise<unknown>;
}

export interface BusinessClaimVerificationAdapterRegistry {
  getAdapter(
    method: BusinessClaimVerificationExecutionRequest['expectedMethod'],
  ): BusinessClaimVerificationMethodAdapter | null;
}

export interface BusinessClaimVerificationResultCommitCommand {
  eventId: string;
  submissionId: string;
  expectedUpdatedAt: Date;
  outcome: BusinessClaimVerificationAdapterResult['outcome'];
  actorId: string;
  internalNote: string;
  executedAt: Date;
}

export interface BusinessClaimVerificationExecutionBackend {
  readState(
    submissionId: string,
    preparationId: string,
  ): Promise<BusinessClaimVerificationExecutionState | null>;
  readExecutionEvent(
    executionId: string,
  ): Promise<BusinessClaimVerificationExecutionEventRecord | null>;
  commitResult(command: BusinessClaimVerificationResultCommitCommand): Promise<void>;
}

export class BusinessClaimVerificationExecutionError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'invalid_request'
      | 'not_found'
      | 'conflict'
      | 'preparation_invalid'
      | 'preparation_expired'
      | 'method_mismatch'
      | 'adapter_unavailable'
      | 'adapter_failure'
      | 'invalid_adapter_result'
      | 'idempotency_conflict'
      | 'backend_failure',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BusinessClaimVerificationExecutionError';
  }
}

export function createBusinessClaimVerificationAdapterRegistry(
  adapters: readonly BusinessClaimVerificationMethodAdapter[],
): BusinessClaimVerificationAdapterRegistry {
  const byMethod = new Map<
    BusinessClaimVerificationExecutionRequest['expectedMethod'],
    BusinessClaimVerificationMethodAdapter
  >();
  for (const adapter of adapters) {
    if (byMethod.has(adapter.method)) {
      throw new BusinessClaimVerificationExecutionError(
        'invalid_request',
        `Duplicate Business Claim verification adapter for ${adapter.method}.`,
      );
    }
    if (
      adapter.adapterId.trim().length === 0 ||
      adapter.adapterId.length > 96 ||
      adapter.adapterVersion.trim().length === 0 ||
      adapter.adapterVersion.length > 64
    ) {
      throw new BusinessClaimVerificationExecutionError(
        'invalid_request',
        'Business Claim verification adapter metadata is invalid.',
      );
    }
    byMethod.set(adapter.method, adapter);
  }
  return {
    getAdapter(method) {
      return byMethod.get(method) ?? null;
    },
  };
}

function receiptFromEvent(
  state: 'committed' | 'replayed',
  submissionId: string,
  request: BusinessClaimVerificationExecutionRequest,
  actorId: string,
  event: BusinessClaimVerificationExecutionEventRecord,
): BusinessClaimVerificationExecutionReceipt {
  const payload = parseBusinessClaimVerificationResultEventPayload(event.internalNote);
  if (
    event.eventId !== request.executionId ||
    event.submissionId !== submissionId ||
    event.fromStatus !== null ||
    event.toStatus !== 'in_review' ||
    event.action !== 'claim_verification_execution_recorded' ||
    event.reasonCode !== payload?.outcome ||
    event.actorId !== actorId ||
    payload === null ||
    payload.executionId !== request.executionId ||
    payload.preparationId !== request.preparationId ||
    payload.expectedSubmissionUpdatedAt !== request.expectedSubmissionUpdatedAt ||
    payload.expectedPreparationExpiresAt !== request.expectedPreparationExpiresAt ||
    payload.method !== request.expectedMethod
  ) {
    throw new BusinessClaimVerificationExecutionError(
      'idempotency_conflict',
      'The verification execution ID was already used for a different operation.',
    );
  }

  return businessClaimVerificationExecutionReceiptSchema.parse({
    state,
    submissionId,
    executionId: payload.executionId,
    preparationId: payload.preparationId,
    targetType: payload.targetType,
    targetId: payload.targetId,
    method: payload.method,
    outcome: payload.outcome,
    resultCode: payload.resultCode,
    observedAt: payload.observedAt,
    retryable: payload.retryable,
    summary: payload.summary,
    adapterId: payload.adapterId,
    adapterVersion: payload.adapterVersion,
    executedAt: event.createdAt,
  });
}

export async function executeBusinessClaimVerification(
  context: BusinessClaimVerificationExecutionContext,
  backend: BusinessClaimVerificationExecutionBackend,
  adapters: BusinessClaimVerificationAdapterRegistry,
  submissionId: string,
  rawRequest: unknown,
  executedAt = new Date(),
): Promise<BusinessClaimVerificationExecutionReceipt> {
  if (!context.capabilities.includes('submission:claim-verification:execute')) {
    throw new BusinessClaimVerificationExecutionError(
      'unauthorized',
      'The actor is not authorized to execute Business Claim verification.',
    );
  }

  const submissionIdResult = z.uuid().safeParse(submissionId);
  const requestResult = businessClaimVerificationExecutionRequestSchema.safeParse(rawRequest);
  if (!submissionIdResult.success || !requestResult.success || Number.isNaN(executedAt.getTime())) {
    throw new BusinessClaimVerificationExecutionError(
      'invalid_request',
      'The Business Claim verification execution request is invalid.',
    );
  }
  const request = requestResult.data;

  let existingEvent: BusinessClaimVerificationExecutionEventRecord | null;
  try {
    existingEvent = await backend.readExecutionEvent(request.executionId);
  } catch (error) {
    throw new BusinessClaimVerificationExecutionError(
      'backend_failure',
      'The verification execution replay check failed.',
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

  let state: BusinessClaimVerificationExecutionState | null;
  try {
    state = await backend.readState(submissionIdResult.data, request.preparationId);
  } catch (error) {
    throw new BusinessClaimVerificationExecutionError(
      'backend_failure',
      'The prepared verification state could not be loaded.',
      { cause: error },
    );
  }
  if (state === null || state.submissionType !== 'claim') {
    throw new BusinessClaimVerificationExecutionError(
      'not_found',
      'The Business Claim submission or preparation was not found.',
    );
  }
  if (
    state.workflowStatus !== 'in_review' ||
    state.updatedAt !== request.expectedSubmissionUpdatedAt
  ) {
    throw new BusinessClaimVerificationExecutionError(
      'conflict',
      'The Business Claim submission changed before verification execution.',
    );
  }

  const preparationEvent = state.preparationEvent;
  const preparation = parseBusinessClaimVerificationRequestEventPayload(
    preparationEvent?.internalNote ?? null,
  );
  if (
    preparationEvent === null ||
    preparationEvent.eventId !== request.preparationId ||
    preparationEvent.submissionId !== submissionIdResult.data ||
    preparationEvent.fromStatus !== null ||
    preparationEvent.toStatus !== 'in_review' ||
    preparationEvent.action !== 'claim_verification_request_prepared' ||
    preparationEvent.reasonCode !== preparation?.method ||
    preparation === null ||
    preparation.preparationId !== request.preparationId
  ) {
    throw new BusinessClaimVerificationExecutionError(
      'preparation_invalid',
      'The Business Claim verification preparation is invalid.',
    );
  }
  if (
    preparation.method !== request.expectedMethod ||
    preparation.expiresAt !== request.expectedPreparationExpiresAt
  ) {
    throw new BusinessClaimVerificationExecutionError(
      'method_mismatch',
      'The Business Claim verification preparation changed before execution.',
    );
  }
  if (new Date(preparation.expiresAt).getTime() <= executedAt.getTime()) {
    throw new BusinessClaimVerificationExecutionError(
      'preparation_expired',
      'The Business Claim verification preparation has expired.',
    );
  }

  const adapter = adapters.getAdapter(preparation.method);
  if (adapter === null || adapter.method !== preparation.method) {
    throw new BusinessClaimVerificationExecutionError(
      'adapter_unavailable',
      'No compatible Business Claim verification adapter is configured.',
    );
  }

  let rawAdapterResult: unknown;
  try {
    rawAdapterResult = await adapter.execute({
      executionId: request.executionId,
      submissionId: submissionIdResult.data,
      preparationId: request.preparationId,
      targetType: preparation.targetType,
      targetId: preparation.targetId,
      method: preparation.method,
      officialDomain: preparation.officialDomain,
      officialWebsiteUrl: preparation.officialWebsiteUrl,
      officialSocialUrl: preparation.officialSocialUrl,
      protectedContactPresent: preparation.protectedContactPresent,
      privateProofPresent: preparation.privateProofPresent,
      assistedVerifierReferencePresent: preparation.assistedVerifierReferencePresent,
      executedAt,
    });
  } catch (error) {
    throw new BusinessClaimVerificationExecutionError(
      'adapter_failure',
      'The Business Claim verification adapter failed without a safe result.',
      { cause: error },
    );
  }
  const adapterResult = businessClaimVerificationAdapterResultSchema.safeParse(rawAdapterResult);
  if (!adapterResult.success) {
    throw new BusinessClaimVerificationExecutionError(
      'invalid_adapter_result',
      'The Business Claim verification adapter returned an invalid result.',
    );
  }

  const internalNote = serializeBusinessClaimVerificationResultEventPayload({
    schemaVersion: 'business-claim-verification-result-event-v1',
    executionId: request.executionId,
    preparationId: request.preparationId,
    expectedSubmissionUpdatedAt: request.expectedSubmissionUpdatedAt,
    expectedPreparationExpiresAt: request.expectedPreparationExpiresAt,
    targetType: preparation.targetType,
    targetId: preparation.targetId,
    method: preparation.method,
    adapterId: adapter.adapterId,
    adapterVersion: adapter.adapterVersion,
    outcome: adapterResult.data.outcome,
    resultCode: adapterResult.data.resultCode,
    observedAt: adapterResult.data.observedAt,
    retryable: adapterResult.data.retryable,
    summary: adapterResult.data.summary,
    providerReferenceHash: adapterResult.data.providerReferenceHash,
  });

  try {
    await backend.commitResult({
      eventId: request.executionId,
      submissionId: submissionIdResult.data,
      expectedUpdatedAt: new Date(request.expectedSubmissionUpdatedAt),
      outcome: adapterResult.data.outcome,
      actorId: context.actorId,
      internalNote,
      executedAt,
    });
  } catch (error) {
    if (error instanceof SubmissionPersistenceError && error.code === 'conflict') {
      let racedEvent: BusinessClaimVerificationExecutionEventRecord | null;
      try {
        racedEvent = await backend.readExecutionEvent(request.executionId);
      } catch (readError) {
        throw new BusinessClaimVerificationExecutionError(
          'backend_failure',
          'The verification execution replay recovery failed.',
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
      throw new BusinessClaimVerificationExecutionError(
        'conflict',
        'The Business Claim submission changed before verification execution committed.',
        { cause: error },
      );
    }
    throw new BusinessClaimVerificationExecutionError(
      'backend_failure',
      'The Business Claim verification result could not be recorded.',
      { cause: error },
    );
  }

  const committedEvent: BusinessClaimVerificationExecutionEventRecord = {
    eventId: request.executionId,
    submissionId: submissionIdResult.data,
    fromStatus: null,
    toStatus: 'in_review',
    action: 'claim_verification_execution_recorded',
    reasonCode: adapterResult.data.outcome,
    actorId: context.actorId,
    internalNote,
    createdAt: executedAt.toISOString(),
  };
  return receiptFromEvent(
    'committed',
    submissionIdResult.data,
    request,
    context.actorId,
    committedEvent,
  );
}
