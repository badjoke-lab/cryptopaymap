import { z } from 'zod';
import {
  businessClaimFieldApplicationRequestSchema,
  projectBusinessClaimFieldApplication,
  type BusinessClaimFieldApplicationBackend,
  type BusinessClaimFieldApplicationProjection,
  type BusinessClaimFieldApplicationRequest,
} from './business-claim-field-application';
import type { BusinessClaimFieldApplicationContext } from './business-claim-field-application-authorization';
import {
  businessClaimFieldApplicationReceiptSchema,
  parseBusinessClaimFieldApplicationEventPayload,
  serializeBusinessClaimFieldApplicationEventPayload,
  type BusinessClaimFieldApplicationEventPayload,
  type BusinessClaimFieldApplicationReceipt,
} from '../../submissions/business-claim-field-application-persistence-contract';
import { SubmissionPersistenceError } from '../../submissions/persistence';

export interface BusinessClaimFieldApplicationPersistenceEventRecord {
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

export interface BusinessClaimFieldApplicationCommitCommand {
  requestId: string;
  submissionId: string;
  expectedSubmissionUpdatedAt: Date;
  actorId: string;
  actorType: 'human' | 'system';
  projection: BusinessClaimFieldApplicationProjection;
  internalNote: string;
  appliedAt: Date;
}

export interface BusinessClaimFieldApplicationPersistenceBackend
  extends BusinessClaimFieldApplicationBackend {
  readApplicationEvent(
    requestId: string,
  ): Promise<BusinessClaimFieldApplicationPersistenceEventRecord | null>;
  readSubmissionApplicationEvent?(
    submissionId: string,
  ): Promise<BusinessClaimFieldApplicationPersistenceEventRecord | null>;
  commitApplication(command: BusinessClaimFieldApplicationCommitCommand): Promise<void>;
}

export class BusinessClaimFieldApplicationPersistenceError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'invalid_request'
      | 'idempotency_conflict'
      | 'conflict'
      | 'backend_failure',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BusinessClaimFieldApplicationPersistenceError';
  }
}

function sameRequest(
  left: BusinessClaimFieldApplicationRequest,
  right: BusinessClaimFieldApplicationRequest,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function receiptFromPayload(
  state: 'committed' | 'replayed',
  payload: BusinessClaimFieldApplicationEventPayload,
): BusinessClaimFieldApplicationReceipt {
  const entityApplication = payload.projection.entityApplication;
  const locationApplication = payload.projection.locationApplication;
  const paymentApplication = payload.projection.paymentApplication;
  return businessClaimFieldApplicationReceiptSchema.parse({
    state,
    submissionId: payload.projection.submissionId,
    requestId: payload.projection.requestId,
    requestFingerprint: payload.projection.requestFingerprint,
    relationshipDecisionId: payload.projection.relationshipDecisionId,
    targetType: payload.projection.targetType,
    targetId: payload.projection.targetId,
    appliedEntityFields: entityApplication?.acceptedFields ?? [],
    rejectedEntityFields: entityApplication?.rejectedFields ?? [],
    appliedLocationFields: locationApplication?.acceptedFields ?? [],
    rejectedLocationFields: locationApplication?.rejectedFields ?? [],
    acceptedPaymentDraftCount: paymentApplication?.acceptedIndexes.length ?? 0,
    rejectedPaymentDraftCount: paymentApplication?.rejectedIndexes.length ?? 0,
    canonicalMutationCommitted:
      (entityApplication?.acceptedFields.length ?? 0) > 0 ||
      (locationApplication?.acceptedFields.length ?? 0) > 0,
    appliedAt: payload.appliedAt,
  });
}

function replayReceipt(
  event: BusinessClaimFieldApplicationPersistenceEventRecord,
  submissionId: string,
  request: BusinessClaimFieldApplicationRequest,
  actorId: string,
): BusinessClaimFieldApplicationReceipt {
  const payload = parseBusinessClaimFieldApplicationEventPayload(event.internalNote);
  if (
    event.eventId !== request.requestId ||
    event.submissionId !== submissionId ||
    event.fromStatus !== null ||
    event.toStatus !== 'resolved' ||
    event.action !== 'business_claim_fields_applied' ||
    event.actorId !== actorId ||
    payload === null ||
    payload.projection.submissionId !== submissionId ||
    !sameRequest(payload.request, request)
  ) {
    throw new BusinessClaimFieldApplicationPersistenceError(
      'idempotency_conflict',
      'The field application request ID was already used for different content.',
    );
  }
  const expectedReason = payload.projection.hasAcceptedChanges
    ? 'field_decisions_committed'
    : 'field_decisions_reviewed_no_changes';
  if (event.reasonCode !== expectedReason) {
    throw new BusinessClaimFieldApplicationPersistenceError(
      'idempotency_conflict',
      'The stored field application event does not match the request.',
    );
  }
  return receiptFromPayload('replayed', payload);
}

export async function applyBusinessClaimFieldApplication(
  context: BusinessClaimFieldApplicationContext,
  backend: BusinessClaimFieldApplicationPersistenceBackend,
  submissionId: string,
  rawRequest: unknown,
  appliedAt = new Date(),
): Promise<BusinessClaimFieldApplicationReceipt> {
  if (!context.capabilities.includes('submission:claim-fields:apply')) {
    throw new BusinessClaimFieldApplicationPersistenceError(
      'unauthorized',
      'The actor is not authorized to persist Business Claim fields.',
    );
  }
  const submissionIdResult = z.uuid().safeParse(submissionId);
  const requestResult = businessClaimFieldApplicationRequestSchema.safeParse(rawRequest);
  if (!submissionIdResult.success || !requestResult.success || Number.isNaN(appliedAt.getTime())) {
    throw new BusinessClaimFieldApplicationPersistenceError(
      'invalid_request',
      'The durable Business Claim field application request is invalid.',
    );
  }
  const request = requestResult.data;

  let existingEvent: BusinessClaimFieldApplicationPersistenceEventRecord | null;
  try {
    existingEvent = await backend.readApplicationEvent(request.requestId);
  } catch (error) {
    throw new BusinessClaimFieldApplicationPersistenceError(
      'backend_failure',
      'The field application replay check failed.',
      { cause: error },
    );
  }
  if (existingEvent !== null) {
    return replayReceipt(existingEvent, submissionIdResult.data, request, context.actorId);
  }

  let priorSubmissionApplication: BusinessClaimFieldApplicationPersistenceEventRecord | null = null;
  if (backend.readSubmissionApplicationEvent !== undefined) {
    try {
      priorSubmissionApplication = await backend.readSubmissionApplicationEvent(
        submissionIdResult.data,
      );
    } catch (error) {
      throw new BusinessClaimFieldApplicationPersistenceError(
        'backend_failure',
        'The Submission application-state check failed.',
        { cause: error },
      );
    }
  }
  if (priorSubmissionApplication !== null) {
    throw new BusinessClaimFieldApplicationPersistenceError(
      'conflict',
      'The Business Claim Submission already has a durable field application.',
    );
  }

  const projection = await projectBusinessClaimFieldApplication(
    context,
    backend,
    submissionIdResult.data,
    request,
    appliedAt,
  );

  const eventPayload: BusinessClaimFieldApplicationEventPayload = {
    schemaVersion: 'business-claim-field-application-event-v1',
    request,
    projection,
    appliedAt: appliedAt.toISOString(),
  };
  const internalNote = serializeBusinessClaimFieldApplicationEventPayload(eventPayload);

  try {
    await backend.commitApplication({
      requestId: request.requestId,
      submissionId: submissionIdResult.data,
      expectedSubmissionUpdatedAt: new Date(request.expectedSubmissionUpdatedAt),
      actorId: context.actorId,
      actorType: context.actorType,
      projection,
      internalNote,
      appliedAt,
    });
  } catch (error) {
    if (error instanceof SubmissionPersistenceError && error.code === 'conflict') {
      let racedEvent: BusinessClaimFieldApplicationPersistenceEventRecord | null;
      try {
        racedEvent = await backend.readApplicationEvent(request.requestId);
      } catch (readError) {
        throw new BusinessClaimFieldApplicationPersistenceError(
          'backend_failure',
          'The field application replay recovery failed.',
          { cause: readError },
        );
      }
      if (racedEvent !== null) {
        return replayReceipt(racedEvent, submissionIdResult.data, request, context.actorId);
      }
      throw new BusinessClaimFieldApplicationPersistenceError(
        'conflict',
        'The Business Claim or canonical target changed before application committed.',
        { cause: error },
      );
    }
    throw new BusinessClaimFieldApplicationPersistenceError(
      'backend_failure',
      'The Business Claim field application could not be committed.',
      { cause: error },
    );
  }

  return receiptFromPayload('committed', eventPayload);
}
