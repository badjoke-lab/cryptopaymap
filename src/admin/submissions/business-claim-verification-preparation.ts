import { z } from 'zod';
import {
  ownershipVerificationMethodSchema,
  type BusinessClaimReviewProjection,
} from '../../submissions/business-claim-contract';
import { businessClaimReviewProjectionSchema } from '../../submissions/business-claim-target-context';
import {
  businessClaimVerificationExpiryHoursSchema,
  parseBusinessClaimVerificationRequestEventPayload,
  serializeBusinessClaimVerificationRequestEventPayload,
} from '../../submissions/business-claim-verification-request-contract';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type { BusinessClaimVerificationPreparationContext } from './business-claim-authorization';

const timestampSchema = z.iso.datetime({ offset: true });

export const businessClaimVerificationPreparationRequestSchema = z
  .object({
    schemaVersion: z.literal('business-claim-verification-preparation-v1'),
    requestId: z.uuid(),
    expectedStatus: z.literal('in_review'),
    expectedUpdatedAt: timestampSchema,
    expectedMethod: ownershipVerificationMethodSchema,
    expiresInHours: businessClaimVerificationExpiryHoursSchema,
  })
  .strict();

export const businessClaimVerificationPreparationReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed']),
    submissionId: z.uuid(),
    preparationId: z.uuid(),
    targetType: z.enum(['entity', 'location']),
    targetId: z.uuid(),
    method: ownershipVerificationMethodSchema,
    protectedMaterial: z
      .object({
        protectedContactPresent: z.boolean(),
        privateProofPresent: z.boolean(),
        assistedVerifierReferencePresent: z.boolean(),
      })
      .strict(),
    expiresAt: timestampSchema,
    preparedAt: timestampSchema,
  })
  .strict();

export type BusinessClaimVerificationPreparationRequest = z.infer<
  typeof businessClaimVerificationPreparationRequestSchema
>;
export type BusinessClaimVerificationPreparationReceipt = z.infer<
  typeof businessClaimVerificationPreparationReceiptSchema
>;

export interface BusinessClaimVerificationPreparationState {
  submissionId: string;
  submissionType: string;
  workflowStatus: string;
  updatedAt: string;
  normalizedProjection: unknown;
}

export interface BusinessClaimVerificationPreparationEventRecord {
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

export interface BusinessClaimVerificationPreparationCommitCommand {
  eventId: string;
  submissionId: string;
  expectedUpdatedAt: Date;
  method: BusinessClaimReviewProjection['verification']['method'];
  actorId: string;
  internalNote: string;
  preparedAt: Date;
}

export interface BusinessClaimVerificationPreparationBackend {
  readState(submissionId: string): Promise<BusinessClaimVerificationPreparationState | null>;
  readPreparationEvent(
    eventId: string,
  ): Promise<BusinessClaimVerificationPreparationEventRecord | null>;
  commitPreparation(command: BusinessClaimVerificationPreparationCommitCommand): Promise<void>;
}

export class BusinessClaimVerificationPreparationError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'invalid_request'
      | 'not_found'
      | 'conflict'
      | 'method_mismatch'
      | 'prerequisite_missing'
      | 'idempotency_conflict'
      | 'backend_failure',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BusinessClaimVerificationPreparationError';
  }
}

function receiptFromEvent(
  state: 'committed' | 'replayed',
  submissionId: string,
  eventId: string,
  actorId: string,
  existing: BusinessClaimVerificationPreparationEventRecord,
  request: BusinessClaimVerificationPreparationRequest,
): BusinessClaimVerificationPreparationReceipt {
  const payload = parseBusinessClaimVerificationRequestEventPayload(existing.internalNote);
  if (
    existing.eventId !== eventId ||
    existing.submissionId !== submissionId ||
    existing.fromStatus !== null ||
    existing.toStatus !== 'in_review' ||
    existing.action !== 'claim_verification_request_prepared' ||
    existing.reasonCode !== request.expectedMethod ||
    existing.actorId !== actorId ||
    payload === null ||
    payload.preparationId !== request.requestId ||
    payload.expectedUpdatedAt !== request.expectedUpdatedAt ||
    payload.method !== request.expectedMethod ||
    payload.expiresInHours !== request.expiresInHours
  ) {
    throw new BusinessClaimVerificationPreparationError(
      'idempotency_conflict',
      'The verification preparation request ID was already used for a different operation.',
    );
  }

  return businessClaimVerificationPreparationReceiptSchema.parse({
    state,
    submissionId,
    preparationId: payload.preparationId,
    targetType: payload.targetType,
    targetId: payload.targetId,
    method: payload.method,
    protectedMaterial: {
      protectedContactPresent: payload.protectedContactPresent,
      privateProofPresent: payload.privateProofPresent,
      assistedVerifierReferencePresent: payload.assistedVerifierReferencePresent,
    },
    expiresAt: payload.expiresAt,
    preparedAt: existing.createdAt,
  });
}

function assertMethodPrerequisites(projection: BusinessClaimReviewProjection): void {
  const verification = projection.verification;
  const valid =
    (verification.method === 'official_domain_email' &&
      verification.officialDomain !== null &&
      verification.protectedContactPresent) ||
    (verification.method === 'website_code' && verification.officialWebsiteUrl !== null) ||
    (verification.method === 'dns_txt' && verification.officialDomain !== null) ||
    (verification.method === 'official_social' && verification.officialSocialUrl !== null) ||
    (verification.method === 'assisted_verification' &&
      verification.assistedVerifierReferencePresent);
  if (!valid) {
    throw new BusinessClaimVerificationPreparationError(
      'prerequisite_missing',
      'The Business Claim does not contain the protected prerequisites required by the selected verification method.',
    );
  }
}

export async function prepareBusinessClaimVerificationRequest(
  context: BusinessClaimVerificationPreparationContext,
  backend: BusinessClaimVerificationPreparationBackend,
  submissionId: string,
  rawRequest: unknown,
  preparedAt = new Date(),
): Promise<BusinessClaimVerificationPreparationReceipt> {
  if (!context.capabilities.includes('submission:claim-verification:prepare')) {
    throw new BusinessClaimVerificationPreparationError(
      'unauthorized',
      'The actor is not authorized to prepare Business Claim verification requests.',
    );
  }

  const submissionIdResult = z.uuid().safeParse(submissionId);
  const requestResult = businessClaimVerificationPreparationRequestSchema.safeParse(rawRequest);
  if (!submissionIdResult.success || !requestResult.success || Number.isNaN(preparedAt.getTime())) {
    throw new BusinessClaimVerificationPreparationError(
      'invalid_request',
      'The Business Claim verification preparation request is invalid.',
    );
  }
  const request = requestResult.data;

  let existingEvent: BusinessClaimVerificationPreparationEventRecord | null;
  try {
    existingEvent = await backend.readPreparationEvent(request.requestId);
  } catch (error) {
    throw new BusinessClaimVerificationPreparationError(
      'backend_failure',
      'The verification preparation replay check failed.',
      { cause: error },
    );
  }
  if (existingEvent !== null) {
    return receiptFromEvent(
      'replayed',
      submissionIdResult.data,
      request.requestId,
      context.actorId,
      existingEvent,
      request,
    );
  }

  let currentState: BusinessClaimVerificationPreparationState | null;
  try {
    currentState = await backend.readState(submissionIdResult.data);
  } catch (error) {
    throw new BusinessClaimVerificationPreparationError(
      'backend_failure',
      'The Business Claim verification preparation state could not be loaded.',
      { cause: error },
    );
  }
  if (currentState === null || currentState.submissionType !== 'claim') {
    throw new BusinessClaimVerificationPreparationError(
      'not_found',
      'The Business Claim submission was not found.',
    );
  }
  if (
    currentState.workflowStatus !== request.expectedStatus ||
    currentState.updatedAt !== request.expectedUpdatedAt
  ) {
    throw new BusinessClaimVerificationPreparationError(
      'conflict',
      'The Business Claim submission state changed before verification preparation.',
    );
  }

  const projectionResult = businessClaimReviewProjectionSchema.safeParse(
    currentState.normalizedProjection,
  );
  if (!projectionResult.success) {
    throw new BusinessClaimVerificationPreparationError(
      'prerequisite_missing',
      'The stored Business Claim review projection is invalid.',
    );
  }
  const projection = projectionResult.data;
  if (projection.verification.method !== request.expectedMethod) {
    throw new BusinessClaimVerificationPreparationError(
      'method_mismatch',
      'The Business Claim verification method changed before preparation.',
    );
  }
  assertMethodPrerequisites(projection);

  const expiresAt = new Date(preparedAt.getTime() + request.expiresInHours * 60 * 60 * 1_000);
  const verification = projection.verification;
  const internalNote = serializeBusinessClaimVerificationRequestEventPayload({
    schemaVersion: 'business-claim-verification-request-event-v1',
    preparationId: request.requestId,
    expectedUpdatedAt: request.expectedUpdatedAt,
    targetType: projection.targetType,
    targetId: projection.targetId,
    method: verification.method,
    officialDomain: verification.officialDomain,
    officialWebsiteUrl: verification.officialWebsiteUrl,
    officialSocialUrl: verification.officialSocialUrl,
    protectedContactPresent: verification.protectedContactPresent,
    privateProofPresent: verification.privateProofPresent,
    assistedVerifierReferencePresent: verification.assistedVerifierReferencePresent,
    expiresInHours: request.expiresInHours,
    expiresAt: expiresAt.toISOString(),
  });

  try {
    await backend.commitPreparation({
      eventId: request.requestId,
      submissionId: submissionIdResult.data,
      expectedUpdatedAt: new Date(request.expectedUpdatedAt),
      method: verification.method,
      actorId: context.actorId,
      internalNote,
      preparedAt,
    });
  } catch (error) {
    if (error instanceof SubmissionPersistenceError && error.code === 'conflict') {
      let racedEvent: BusinessClaimVerificationPreparationEventRecord | null;
      try {
        racedEvent = await backend.readPreparationEvent(request.requestId);
      } catch (readError) {
        throw new BusinessClaimVerificationPreparationError(
          'backend_failure',
          'The verification preparation replay recovery failed.',
          { cause: readError },
        );
      }
      if (racedEvent !== null) {
        return receiptFromEvent(
          'replayed',
          submissionIdResult.data,
          request.requestId,
          context.actorId,
          racedEvent,
          request,
        );
      }
      throw new BusinessClaimVerificationPreparationError(
        'conflict',
        'The Business Claim submission changed before verification preparation committed.',
        { cause: error },
      );
    }
    throw new BusinessClaimVerificationPreparationError(
      'backend_failure',
      'The Business Claim verification request could not be prepared.',
      { cause: error },
    );
  }

  const committedEvent: BusinessClaimVerificationPreparationEventRecord = {
    eventId: request.requestId,
    submissionId: submissionIdResult.data,
    fromStatus: null,
    toStatus: 'in_review',
    action: 'claim_verification_request_prepared',
    reasonCode: verification.method,
    actorId: context.actorId,
    internalNote,
    createdAt: preparedAt.toISOString(),
  };
  return receiptFromEvent(
    'committed',
    submissionIdResult.data,
    request.requestId,
    context.actorId,
    committedEvent,
    request,
  );
}
