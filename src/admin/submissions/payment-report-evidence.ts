import { z } from 'zod';
import {
  parsePositivePaymentEvidenceEvent,
  positivePaymentEvidenceDecisionSchema,
  serializePositivePaymentEvidenceEvent,
} from '../../submissions/payment-report-evidence-contract';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type { PaymentReportEvidenceDecisionContext } from './authorization';
import { paymentReportOriginalPayloadSchema } from '../../submissions/report-contract';
import { paymentReportReviewProjectionSchema } from './report-detail';

const timestampSchema = z.iso.datetime({ offset: true });
const safeTextSchema = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !/[<>]/.test(value), 'HTML-like text is not accepted.');
const independenceKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:[a-z0-9:_-]*[a-z0-9])?$/);

export const positivePaymentEvidenceRequestSchema = z
  .object({
    schemaVersion: z.literal('positive-payment-evidence-decision-v1'),
    requestId: z.uuid(),
    expectedStatus: z.literal('in_review'),
    expectedUpdatedAt: timestampSchema,
    expectedPayloadUpdatedAt: timestampSchema,
    claimId: z.uuid(),
    expectedClaimUpdatedAt: timestampSchema,
    expectedClaimStatus: z.enum(['confirmed', 'stale']),
    expectedClaimVisibility: z.enum(['public', 'hidden', 'temporarily_hidden']),
    expectedClaimAssetIds: z.array(z.uuid()).min(1).max(100),
    decision: positivePaymentEvidenceDecisionSchema,
    evidenceClass: z.enum(['a', 'b']),
    evidenceVisibility: z.enum(['private', 'restricted']),
    independenceKey: independenceKeySchema.nullable(),
    evidenceSummary: safeTextSchema(1_000),
    publicSummary: safeTextSchema(1_000).nullable(),
    reviewerNote: safeTextSchema(1_000).nullable(),
    nextReviewAt: timestampSchema.nullable(),
  })
  .strict()
  .superRefine((request, context) => {
    if (new Set(request.expectedClaimAssetIds).size !== request.expectedClaimAssetIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['expectedClaimAssetIds'],
        message: 'Expected Claim Asset IDs must be unique.',
      });
    }
    if (request.evidenceClass === 'b' && request.independenceKey === null) {
      context.addIssue({
        code: 'custom',
        path: ['independenceKey'],
        message: 'Class B Evidence requires an independence key.',
      });
    }
    if (request.evidenceClass === 'a' && request.independenceKey !== null) {
      context.addIssue({
        code: 'custom',
        path: ['independenceKey'],
        message: 'Class A payment proof does not use a Class B independence key.',
      });
    }
    if (request.decision === 'accept_and_reconfirm') {
      if (request.evidenceClass !== 'a') {
        context.addIssue({
          code: 'custom',
          path: ['evidenceClass'],
          message: 'A single Class B user report cannot reconfirm a Claim.',
        });
      }
      if (request.nextReviewAt === null) {
        context.addIssue({
          code: 'custom',
          path: ['nextReviewAt'],
          message: 'Reconfirmation requires a future next-review time.',
        });
      }
      if (request.publicSummary === null) {
        context.addIssue({
          code: 'custom',
          path: ['publicSummary'],
          message: 'Reconfirmation requires a separate publication-safe summary.',
        });
      }
    }
    if (request.decision === 'accept_evidence') {
      if (request.nextReviewAt !== null) {
        context.addIssue({
          code: 'custom',
          path: ['nextReviewAt'],
          message: 'Evidence-only acceptance cannot assign a next-review time.',
        });
      }
      if (request.publicSummary !== null) {
        context.addIssue({
          code: 'custom',
          path: ['publicSummary'],
          message: 'Evidence-only acceptance cannot write a public Verification summary.',
        });
      }
    }
  });

export const positivePaymentEvidenceReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed']),
    submissionId: z.uuid(),
    evidenceId: z.uuid(),
    claimId: z.uuid(),
    decision: positivePaymentEvidenceDecisionSchema,
    fromStatus: z.literal('in_review'),
    toStatus: z.literal('resolved'),
    resolution: z.literal('approved'),
    claimStatus: z.enum(['confirmed', 'stale']),
    verificationEventType: z.enum(['reconfirmed', 'restored']).nullable(),
    decidedAt: timestampSchema,
  })
  .strict();

export type PositivePaymentEvidenceRequest = z.infer<typeof positivePaymentEvidenceRequestSchema>;
export type PositivePaymentEvidenceReceipt = z.infer<typeof positivePaymentEvidenceReceiptSchema>;

export interface PositivePaymentClaimOption {
  id: string;
  assetSlug: string;
  networkSlug: string;
  paymentMethod: string;
}

export interface PositivePaymentEvidenceState {
  submissionId: string;
  submissionType: string;
  targetType: string | null;
  targetId: string | null;
  workflowStatus: string;
  updatedAt: string;
  originalPayload: unknown;
  normalizedPayload: unknown;
  payloadUpdatedAt: string;
  claim: {
    id: string;
    entityId: string;
    locationId: string | null;
    routeType: 'direct_wallet' | 'processor_checkout';
    processorName: string | null;
    claimStatus: 'candidate' | 'confirmed' | 'stale' | 'ended' | 'rejected';
    visibility: 'public' | 'hidden' | 'temporarily_hidden';
    updatedAt: string;
    options: PositivePaymentClaimOption[];
  } | null;
}

export interface PositivePaymentEvidenceEventRecord {
  eventId: string;
  submissionId: string;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  actorId: string;
  internalNote: string | null;
  createdAt: string;
}

export interface PositivePaymentEvidenceCommitCommand {
  eventId: string;
  evidenceId: string;
  verificationEventId: string | null;
  submissionId: string;
  claimId: string;
  expectedSubmissionUpdatedAt: Date;
  expectedPayloadUpdatedAt: Date;
  expectedClaimUpdatedAt: Date;
  expectedClaimStatus: 'confirmed' | 'stale';
  expectedClaimVisibility: 'public' | 'hidden' | 'temporarily_hidden';
  expectedClaimAssetIds: string[];
  actorId: string;
  actorType: 'human' | 'system';
  decision: PositivePaymentEvidenceRequest['decision'];
  evidenceKind: 'payment_proof' | 'independent_user_report';
  evidenceClass: 'a' | 'b';
  evidenceVisibility: 'private' | 'restricted';
  sourceType: 'payment_proof' | 'user_submission';
  independenceKey: string | null;
  sourceUrl: string | null;
  observedAt: Date;
  evidenceSummary: string;
  publicSummary: string | null;
  eventInternalNote: string;
  reviewerNote: string | null;
  decidedAt: Date;
  nextReviewAt: Date | null;
}

export interface PositivePaymentEvidenceBackend {
  readState(submissionId: string, claimId: string): Promise<PositivePaymentEvidenceState | null>;
  readDecisionEvent(eventId: string): Promise<PositivePaymentEvidenceEventRecord | null>;
  commitDecision(command: PositivePaymentEvidenceCommitCommand): Promise<void>;
}

export class PositivePaymentEvidenceError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'invalid_request'
      | 'not_found'
      | 'conflict'
      | 'idempotency_conflict'
      | 'invalid_projection'
      | 'ineligible'
      | 'backend_failure',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PositivePaymentEvidenceError';
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

function targetMatchesClaim(state: PositivePaymentEvidenceState): boolean {
  if (state.claim === null || state.targetType === null || state.targetId === null) return false;
  if (state.targetType === 'claim') return state.targetId === state.claim.id;
  if (state.targetType === 'entity') return state.targetId === state.claim.entityId;
  if (state.targetType === 'location') return state.targetId === state.claim.locationId;
  return false;
}

function exactPaymentMatch(
  state: PositivePaymentEvidenceState,
  projection: z.infer<typeof paymentReportReviewProjectionSchema>,
): boolean {
  if (state.claim === null) return false;
  const payment = projection.payment;
  if (
    payment.routeType === null ||
    payment.assetSlug === null ||
    payment.networkSlug === null ||
    payment.paymentMethod === null ||
    payment.routeType !== state.claim.routeType
  ) {
    return false;
  }
  if (state.claim.routeType === 'processor_checkout') {
    if (payment.processor === null || state.claim.processorName === null) return false;
    if (
      payment.processor.name.toLocaleLowerCase('en-US') !==
      state.claim.processorName.toLocaleLowerCase('en-US')
    ) {
      return false;
    }
  } else if (payment.processor !== null || state.claim.processorName !== null) {
    return false;
  }
  return state.claim.options.some(
    (option) =>
      option.assetSlug === payment.assetSlug &&
      option.networkSlug === payment.networkSlug &&
      option.paymentMethod === payment.paymentMethod,
  );
}

function replayReceipt(
  existing: PositivePaymentEvidenceEventRecord,
  submissionId: string,
  request: PositivePaymentEvidenceRequest,
  actorId: string,
  requestFingerprint: string,
): PositivePaymentEvidenceReceipt {
  const payload = parsePositivePaymentEvidenceEvent(existing.internalNote);
  if (
    existing.submissionId !== submissionId ||
    existing.fromStatus !== 'in_review' ||
    existing.toStatus !== 'resolved' ||
    existing.action !== 'positive_payment_evidence_decided' ||
    existing.actorId !== actorId ||
    payload === null ||
    payload.requestFingerprint !== requestFingerprint ||
    payload.claimId !== request.claimId ||
    payload.decision !== request.decision
  ) {
    throw new PositivePaymentEvidenceError(
      'idempotency_conflict',
      'The positive payment Evidence request UUID was already used for a different operation.',
    );
  }
  return positivePaymentEvidenceReceiptSchema.parse({
    state: 'replayed',
    submissionId,
    evidenceId: payload.evidenceId,
    claimId: payload.claimId,
    decision: payload.decision,
    fromStatus: 'in_review',
    toStatus: 'resolved',
    resolution: 'approved',
    claimStatus:
      payload.decision === 'accept_and_reconfirm' ? 'confirmed' : request.expectedClaimStatus,
    verificationEventType:
      payload.verificationEventId === null
        ? null
        : request.expectedClaimStatus === 'stale'
          ? 'restored'
          : 'reconfirmed',
    decidedAt: existing.createdAt,
  });
}

export async function decidePositivePaymentEvidence(
  context: PaymentReportEvidenceDecisionContext,
  backend: PositivePaymentEvidenceBackend,
  submissionId: string,
  rawRequest: unknown,
  decidedAt = new Date(),
): Promise<PositivePaymentEvidenceReceipt> {
  if (!context.capabilities.includes('submission:payment-evidence:decide')) {
    throw new PositivePaymentEvidenceError(
      'unauthorized',
      'The actor is not authorized to decide positive payment Evidence.',
    );
  }
  const submissionIdResult = z.uuid().safeParse(submissionId);
  const requestResult = positivePaymentEvidenceRequestSchema.safeParse(rawRequest);
  if (!submissionIdResult.success || !requestResult.success || Number.isNaN(decidedAt.getTime())) {
    throw new PositivePaymentEvidenceError(
      'invalid_request',
      'The positive payment Evidence request is invalid.',
    );
  }
  const request = requestResult.data;
  const expectedClaimAssetIds = [...request.expectedClaimAssetIds].sort();
  const requestFingerprint = await sha256({ ...request, expectedClaimAssetIds });

  let existingEvent: PositivePaymentEvidenceEventRecord | null;
  try {
    existingEvent = await backend.readDecisionEvent(request.requestId);
  } catch (error) {
    throw new PositivePaymentEvidenceError('backend_failure', 'Evidence replay check failed.', {
      cause: error,
    });
  }
  if (existingEvent !== null) {
    return replayReceipt(
      existingEvent,
      submissionIdResult.data,
      request,
      context.actorId,
      requestFingerprint,
    );
  }

  let state: PositivePaymentEvidenceState | null;
  try {
    state = await backend.readState(submissionIdResult.data, request.claimId);
  } catch (error) {
    throw new PositivePaymentEvidenceError(
      'backend_failure',
      'The payment report and Claim state could not be loaded.',
      { cause: error },
    );
  }
  if (state === null || state.submissionType !== 'payment_report' || state.claim === null) {
    throw new PositivePaymentEvidenceError(
      'not_found',
      'The payment report or Claim was not found.',
    );
  }
  if (
    state.workflowStatus !== request.expectedStatus ||
    state.updatedAt !== request.expectedUpdatedAt ||
    state.payloadUpdatedAt !== request.expectedPayloadUpdatedAt ||
    state.claim.updatedAt !== request.expectedClaimUpdatedAt ||
    state.claim.claimStatus !== request.expectedClaimStatus ||
    state.claim.visibility !== request.expectedClaimVisibility ||
    JSON.stringify(state.claim.options.map((option) => option.id).sort()) !==
      JSON.stringify(expectedClaimAssetIds)
  ) {
    throw new PositivePaymentEvidenceError(
      'conflict',
      'The payment report or Claim state changed before the decision.',
    );
  }
  if (!targetMatchesClaim(state)) {
    throw new PositivePaymentEvidenceError(
      'ineligible',
      'The selected Claim does not belong to the reported target.',
    );
  }

  const projectionResult = paymentReportReviewProjectionSchema.safeParse(state.normalizedPayload);
  if (!projectionResult.success || projectionResult.data.result !== 'successful') {
    throw new PositivePaymentEvidenceError(
      'invalid_projection',
      'Only a valid successful payment report can create supporting Evidence.',
    );
  }
  const projection = projectionResult.data;
  const originalResult = paymentReportOriginalPayloadSchema.safeParse(state.originalPayload);
  if (
    !originalResult.success ||
    originalResult.data.result !== 'successful' ||
    originalResult.data.paymentDate !== projection.paymentDate
  ) {
    throw new PositivePaymentEvidenceError(
      'invalid_projection',
      'The original successful payment report could not be verified.',
    );
  }
  const original = originalResult.data;
  const paymentMatch = exactPaymentMatch(state, projection);
  if (request.evidenceClass === 'a') {
    if (
      !projection.restrictedEvidence.privateTransactionUrlPresent ||
      original.privateTransactionUrl === null ||
      !paymentMatch ||
      request.evidenceVisibility !== 'restricted'
    ) {
      throw new PositivePaymentEvidenceError(
        'ineligible',
        'Class A payment proof requires restricted private proof and an exact Claim payment match.',
      );
    }
  }
  if (request.decision === 'accept_and_reconfirm') {
    if (
      request.evidenceClass !== 'a' ||
      request.publicSummary === null ||
      !paymentMatch ||
      request.nextReviewAt === null ||
      Date.parse(request.nextReviewAt) <= decidedAt.getTime()
    ) {
      throw new PositivePaymentEvidenceError(
        'ineligible',
        'Reconfirmation requires Class A proof, an exact payment match, a publication-safe summary, and a future next-review time.',
      );
    }
  }

  const evidenceId = await deterministicUuid(`positive-payment-evidence:${request.requestId}`);
  const verificationEventId =
    request.decision === 'accept_and_reconfirm'
      ? await deterministicUuid(`positive-payment-verification:${request.requestId}`)
      : null;
  const eventInternalNote = serializePositivePaymentEvidenceEvent({
    schemaVersion: 'positive-payment-evidence-event-v1',
    requestFingerprint,
    evidenceId,
    claimId: request.claimId,
    decision: request.decision,
    verificationEventId,
    evidenceSummary: request.evidenceSummary,
    publicSummary: request.publicSummary,
    reviewerNote: request.reviewerNote,
  });

  try {
    await backend.commitDecision({
      eventId: request.requestId,
      evidenceId,
      verificationEventId,
      submissionId: submissionIdResult.data,
      claimId: request.claimId,
      expectedSubmissionUpdatedAt: new Date(request.expectedUpdatedAt),
      expectedPayloadUpdatedAt: new Date(request.expectedPayloadUpdatedAt),
      expectedClaimUpdatedAt: new Date(request.expectedClaimUpdatedAt),
      expectedClaimStatus: request.expectedClaimStatus,
      expectedClaimVisibility: request.expectedClaimVisibility,
      expectedClaimAssetIds,
      actorId: context.actorId,
      actorType: context.actorType,
      decision: request.decision,
      evidenceKind: request.evidenceClass === 'a' ? 'payment_proof' : 'independent_user_report',
      evidenceClass: request.evidenceClass,
      evidenceVisibility: request.evidenceVisibility,
      sourceType: request.evidenceClass === 'a' ? 'payment_proof' : 'user_submission',
      independenceKey: request.independenceKey,
      sourceUrl:
        request.evidenceClass === 'a'
          ? original.privateTransactionUrl
          : (projection.evidenceLinks[0]?.url ?? null),
      observedAt: new Date(`${projection.paymentDate}T00:00:00.000Z`),
      evidenceSummary: request.evidenceSummary,
      publicSummary: request.publicSummary,
      eventInternalNote,
      reviewerNote: request.reviewerNote,
      decidedAt,
      nextReviewAt: request.nextReviewAt === null ? null : new Date(request.nextReviewAt),
    });
  } catch (error) {
    if (error instanceof SubmissionPersistenceError && error.code === 'conflict') {
      let racedEvent: PositivePaymentEvidenceEventRecord | null;
      try {
        racedEvent = await backend.readDecisionEvent(request.requestId);
      } catch (readError) {
        throw new PositivePaymentEvidenceError(
          'backend_failure',
          'Evidence replay recovery failed.',
          { cause: readError },
        );
      }
      if (racedEvent !== null) {
        return replayReceipt(
          racedEvent,
          submissionIdResult.data,
          request,
          context.actorId,
          requestFingerprint,
        );
      }
      throw new PositivePaymentEvidenceError(
        'conflict',
        'The payment report or Claim changed before the decision committed.',
        { cause: error },
      );
    }
    throw new PositivePaymentEvidenceError(
      'backend_failure',
      'The positive payment Evidence transaction could not be committed.',
      { cause: error },
    );
  }

  return positivePaymentEvidenceReceiptSchema.parse({
    state: 'committed',
    submissionId: submissionIdResult.data,
    evidenceId,
    claimId: request.claimId,
    decision: request.decision,
    fromStatus: 'in_review',
    toStatus: 'resolved',
    resolution: 'approved',
    claimStatus:
      request.decision === 'accept_and_reconfirm' ? 'confirmed' : request.expectedClaimStatus,
    verificationEventType:
      verificationEventId === null
        ? null
        : request.expectedClaimStatus === 'stale'
          ? 'restored'
          : 'reconfirmed',
    decidedAt: decidedAt.toISOString(),
  });
}
