import { z } from 'zod';
import {
  parseNegativeReportEvidenceEvent,
  negativeReportEvidenceDecisionSchema,
  serializeNegativeReportEvidenceEvent,
} from '../../submissions/negative-report-evidence-contract';
import {
  paymentReportOriginalPayloadSchema,
  problemReportOriginalPayloadSchema,
} from '../../submissions/report-contract';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type { NegativeReportEvidenceDecisionContext } from './authorization';
import {
  paymentReportReviewProjectionSchema,
  problemReportReviewProjectionSchema,
} from './report-detail';

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

export const negativeReportEvidenceRequestSchema = z
  .object({
    schemaVersion: z.literal('negative-report-evidence-decision-v1'),
    requestId: z.uuid(),
    expectedStatus: z.literal('in_review'),
    expectedUpdatedAt: timestampSchema,
    expectedPayloadUpdatedAt: timestampSchema,
    claimId: z.uuid(),
    expectedClaimUpdatedAt: timestampSchema,
    expectedClaimStatus: z.enum(['confirmed', 'stale']),
    expectedClaimVisibility: z.enum(['public', 'hidden', 'temporarily_hidden']),
    decision: negativeReportEvidenceDecisionSchema,
    evidenceClass: z.enum(['a', 'b']),
    evidenceVisibility: z.enum(['private', 'restricted']),
    independenceKey: independenceKeySchema.nullable(),
    evidenceSummary: safeTextSchema(1_000),
    reviewerNote: safeTextSchema(1_000).nullable(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.evidenceClass === 'a') {
      if (request.independenceKey !== null) {
        context.addIssue({
          code: 'custom',
          path: ['independenceKey'],
          message: 'Class A restricted proof does not use a Class B independence key.',
        });
      }
      if (request.evidenceVisibility !== 'restricted') {
        context.addIssue({
          code: 'custom',
          path: ['evidenceVisibility'],
          message: 'Class A negative proof must remain restricted.',
        });
      }
    }
    if (request.evidenceClass === 'b' && request.independenceKey === null) {
      context.addIssue({
        code: 'custom',
        path: ['independenceKey'],
        message: 'Class B negative Evidence requires an independence key.',
      });
    }
  });

export const negativeReportEvidenceReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed']),
    submissionId: z.uuid(),
    evidenceId: z.uuid(),
    claimId: z.uuid(),
    decision: negativeReportEvidenceDecisionSchema,
    fromStatus: z.literal('in_review'),
    toStatus: z.literal('resolved'),
    resolution: z.literal('approved'),
    claimStatus: z.enum(['confirmed', 'stale']),
    recheckPrioritized: z.boolean(),
    decidedAt: timestampSchema,
  })
  .strict();

export type NegativeReportEvidenceRequest = z.infer<typeof negativeReportEvidenceRequestSchema>;
export type NegativeReportEvidenceReceipt = z.infer<typeof negativeReportEvidenceReceiptSchema>;

export interface NegativeReportEvidenceState {
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
    claimStatus: 'candidate' | 'confirmed' | 'stale' | 'ended' | 'rejected';
    visibility: 'public' | 'hidden' | 'temporarily_hidden';
    updatedAt: string;
  } | null;
}

export interface NegativeReportEvidenceEventRecord {
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

export interface NegativeReportEvidenceCommitCommand {
  eventId: string;
  evidenceId: string;
  submissionId: string;
  claimId: string;
  expectedSubmissionUpdatedAt: Date;
  expectedPayloadUpdatedAt: Date;
  expectedClaimUpdatedAt: Date;
  expectedClaimStatus: 'confirmed' | 'stale';
  expectedClaimVisibility: 'public' | 'hidden' | 'temporarily_hidden';
  actorId: string;
  actorType: 'human' | 'system';
  decision: NegativeReportEvidenceRequest['decision'];
  evidenceKind: 'payment_proof' | 'independent_user_report';
  evidenceClass: 'a' | 'b';
  evidenceVisibility: 'private' | 'restricted';
  sourceType: 'payment_proof' | 'user_submission';
  independenceKey: string | null;
  sourceUrl: string | null;
  observedAt: Date;
  evidenceSummary: string;
  eventInternalNote: string;
  decidedAt: Date;
}

export interface NegativeReportEvidenceBackend {
  readState(submissionId: string, claimId: string): Promise<NegativeReportEvidenceState | null>;
  readDecisionEvent(eventId: string): Promise<NegativeReportEvidenceEventRecord | null>;
  commitDecision(command: NegativeReportEvidenceCommitCommand): Promise<void>;
}

export class NegativeReportEvidenceError extends Error {
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
    this.name = 'NegativeReportEvidenceError';
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

function targetMatchesClaim(state: NegativeReportEvidenceState): boolean {
  if (state.claim === null || state.targetType === null || state.targetId === null) return false;
  if (state.targetType === 'claim') return state.targetId === state.claim.id;
  if (state.targetType === 'entity') return state.targetId === state.claim.entityId;
  if (state.targetType === 'location') return state.targetId === state.claim.locationId;
  return false;
}

interface NegativeProjectionMaterial {
  observedAt: string;
  sourceUrl: string | null;
}

function parseNegativeProjection(
  state: NegativeReportEvidenceState,
  evidenceClass: 'a' | 'b',
): NegativeProjectionMaterial {
  if (state.submissionType === 'payment_report') {
    const projectionResult = paymentReportReviewProjectionSchema.safeParse(state.normalizedPayload);
    const originalResult = paymentReportOriginalPayloadSchema.safeParse(state.originalPayload);
    if (
      !projectionResult.success ||
      !originalResult.success ||
      projectionResult.data.result !== 'failed' ||
      originalResult.data.result !== 'failed' ||
      projectionResult.data.paymentDate !== originalResult.data.paymentDate ||
      projectionResult.data.restrictedEvidence.privateTransactionUrlPresent !==
        (originalResult.data.privateTransactionUrl !== null)
    ) {
      throw new NegativeReportEvidenceError(
        'invalid_projection',
        'Only a consistent failed payment report can create negative Evidence.',
      );
    }
    if (evidenceClass === 'a' && originalResult.data.privateTransactionUrl === null) {
      throw new NegativeReportEvidenceError(
        'ineligible',
        'Class A negative payment proof requires a restricted transaction URL.',
      );
    }
    return {
      observedAt: projectionResult.data.paymentDate,
      sourceUrl:
        evidenceClass === 'a'
          ? originalResult.data.privateTransactionUrl
          : (projectionResult.data.evidenceLinks[0]?.url ?? null),
    };
  }

  if (state.submissionType === 'problem_report') {
    const projectionResult = problemReportReviewProjectionSchema.safeParse(state.normalizedPayload);
    const originalResult = problemReportOriginalPayloadSchema.safeParse(state.originalPayload);
    if (
      !projectionResult.success ||
      !originalResult.success ||
      !['no_longer_accepts_crypto', 'payment_failed'].includes(projectionResult.data.reportType) ||
      projectionResult.data.reportType !== originalResult.data.reportType ||
      projectionResult.data.observedAt !== originalResult.data.observedAt ||
      projectionResult.data.explanation !== originalResult.data.explanation ||
      projectionResult.data.restrictedEvidence.privateEvidenceUrlPresent !==
        (originalResult.data.privateEvidenceUrl !== null)
    ) {
      throw new NegativeReportEvidenceError(
        'invalid_projection',
        'Only a consistent negative payment problem report can create negative Evidence.',
      );
    }
    if (evidenceClass === 'a' && originalResult.data.privateEvidenceUrl === null) {
      throw new NegativeReportEvidenceError(
        'ineligible',
        'Class A negative problem proof requires a restricted evidence URL.',
      );
    }
    return {
      observedAt: projectionResult.data.observedAt,
      sourceUrl:
        evidenceClass === 'a'
          ? originalResult.data.privateEvidenceUrl
          : (projectionResult.data.evidenceLinks[0]?.url ?? null),
    };
  }

  throw new NegativeReportEvidenceError(
    'not_found',
    'The Submission is not an eligible negative payment report.',
  );
}

function replayReceipt(
  existing: NegativeReportEvidenceEventRecord,
  submissionId: string,
  request: NegativeReportEvidenceRequest,
  actorId: string,
  requestFingerprint: string,
): NegativeReportEvidenceReceipt {
  const payload = parseNegativeReportEvidenceEvent(existing.internalNote);
  const expectedReason =
    request.decision === 'accept_and_prioritize_recheck'
      ? 'negative_evidence_recheck_priority'
      : 'negative_evidence_accepted';
  if (
    existing.submissionId !== submissionId ||
    existing.fromStatus !== 'in_review' ||
    existing.toStatus !== 'resolved' ||
    existing.action !== 'negative_report_evidence_decided' ||
    existing.reasonCode !== expectedReason ||
    existing.actorId !== actorId ||
    payload === null ||
    payload.requestFingerprint !== requestFingerprint ||
    payload.claimId !== request.claimId ||
    payload.decision !== request.decision
  ) {
    throw new NegativeReportEvidenceError(
      'idempotency_conflict',
      'The negative Evidence request UUID was already used for a different operation.',
    );
  }
  return negativeReportEvidenceReceiptSchema.parse({
    state: 'replayed',
    submissionId,
    evidenceId: payload.evidenceId,
    claimId: payload.claimId,
    decision: payload.decision,
    fromStatus: 'in_review',
    toStatus: 'resolved',
    resolution: 'approved',
    claimStatus: request.expectedClaimStatus,
    recheckPrioritized: payload.decision === 'accept_and_prioritize_recheck',
    decidedAt: existing.createdAt,
  });
}

export async function decideNegativeReportEvidence(
  context: NegativeReportEvidenceDecisionContext,
  backend: NegativeReportEvidenceBackend,
  submissionId: string,
  rawRequest: unknown,
  decidedAt = new Date(),
): Promise<NegativeReportEvidenceReceipt> {
  if (!context.capabilities.includes('submission:negative-evidence:decide')) {
    throw new NegativeReportEvidenceError(
      'unauthorized',
      'The actor is not authorized to decide negative report Evidence.',
    );
  }
  const submissionIdResult = z.uuid().safeParse(submissionId);
  const requestResult = negativeReportEvidenceRequestSchema.safeParse(rawRequest);
  if (!submissionIdResult.success || !requestResult.success || Number.isNaN(decidedAt.getTime())) {
    throw new NegativeReportEvidenceError(
      'invalid_request',
      'The negative report Evidence request is invalid.',
    );
  }
  const request = requestResult.data;
  const requestFingerprint = await sha256(request);

  let existingEvent: NegativeReportEvidenceEventRecord | null;
  try {
    existingEvent = await backend.readDecisionEvent(request.requestId);
  } catch (error) {
    throw new NegativeReportEvidenceError('backend_failure', 'Evidence replay check failed.', {
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

  let state: NegativeReportEvidenceState | null;
  try {
    state = await backend.readState(submissionIdResult.data, request.claimId);
  } catch (error) {
    throw new NegativeReportEvidenceError(
      'backend_failure',
      'The negative report and Claim state could not be loaded.',
      { cause: error },
    );
  }
  if (state === null || state.claim === null) {
    throw new NegativeReportEvidenceError(
      'not_found',
      'The negative report or Claim was not found.',
    );
  }
  if (
    state.workflowStatus !== request.expectedStatus ||
    state.updatedAt !== request.expectedUpdatedAt ||
    state.payloadUpdatedAt !== request.expectedPayloadUpdatedAt ||
    state.claim.updatedAt !== request.expectedClaimUpdatedAt ||
    state.claim.claimStatus !== request.expectedClaimStatus ||
    state.claim.visibility !== request.expectedClaimVisibility
  ) {
    throw new NegativeReportEvidenceError(
      'conflict',
      'The negative report or Claim state changed before the decision.',
    );
  }
  if (!targetMatchesClaim(state)) {
    throw new NegativeReportEvidenceError(
      'ineligible',
      'The selected Claim does not belong to the reported target.',
    );
  }

  const material = parseNegativeProjection(state, request.evidenceClass);
  const evidenceId = await deterministicUuid(`negative-report-evidence:${request.requestId}`);
  const eventInternalNote = serializeNegativeReportEvidenceEvent({
    schemaVersion: 'negative-report-evidence-event-v1',
    requestFingerprint,
    evidenceId,
    claimId: request.claimId,
    decision: request.decision,
    evidenceSummary: request.evidenceSummary,
    reviewerNote: request.reviewerNote,
  });

  try {
    await backend.commitDecision({
      eventId: request.requestId,
      evidenceId,
      submissionId: submissionIdResult.data,
      claimId: request.claimId,
      expectedSubmissionUpdatedAt: new Date(request.expectedUpdatedAt),
      expectedPayloadUpdatedAt: new Date(request.expectedPayloadUpdatedAt),
      expectedClaimUpdatedAt: new Date(request.expectedClaimUpdatedAt),
      expectedClaimStatus: request.expectedClaimStatus,
      expectedClaimVisibility: request.expectedClaimVisibility,
      actorId: context.actorId,
      actorType: context.actorType,
      decision: request.decision,
      evidenceKind: request.evidenceClass === 'a' ? 'payment_proof' : 'independent_user_report',
      evidenceClass: request.evidenceClass,
      evidenceVisibility: request.evidenceVisibility,
      sourceType: request.evidenceClass === 'a' ? 'payment_proof' : 'user_submission',
      independenceKey: request.independenceKey,
      sourceUrl: material.sourceUrl,
      observedAt: new Date(`${material.observedAt}T00:00:00.000Z`),
      evidenceSummary: request.evidenceSummary,
      eventInternalNote,
      decidedAt,
    });
  } catch (error) {
    if (error instanceof SubmissionPersistenceError && error.code === 'conflict') {
      let racedEvent: NegativeReportEvidenceEventRecord | null;
      try {
        racedEvent = await backend.readDecisionEvent(request.requestId);
      } catch (readError) {
        throw new NegativeReportEvidenceError(
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
      throw new NegativeReportEvidenceError(
        'conflict',
        'The negative report or Claim changed before the decision committed.',
        { cause: error },
      );
    }
    throw new NegativeReportEvidenceError(
      'backend_failure',
      'The negative Evidence transaction could not be committed.',
      { cause: error },
    );
  }

  return negativeReportEvidenceReceiptSchema.parse({
    state: 'committed',
    submissionId: submissionIdResult.data,
    evidenceId,
    claimId: request.claimId,
    decision: request.decision,
    fromStatus: 'in_review',
    toStatus: 'resolved',
    resolution: 'approved',
    claimStatus: request.expectedClaimStatus,
    recheckPrioritized: request.decision === 'accept_and_prioritize_recheck',
    decidedAt: decidedAt.toISOString(),
  });
}
