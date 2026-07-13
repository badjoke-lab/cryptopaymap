import { z } from 'zod';
import {
  parseProblemReportDecisionEvent,
  problemReportClaimActionSchema,
  problemReportDecisionOperationSchema,
  serializeProblemReportDecisionEvent,
} from '../../submissions/problem-report-decision-contract';
import {
  paymentReportOriginalPayloadSchema,
  problemReportCorrectionSchema,
  problemReportDuplicateTargetSchema,
  problemReportOriginalPayloadSchema,
} from '../../submissions/report-contract';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import type { ProblemReportMutationContext } from './authorization';
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
const claimStatusSchema = z.enum(['confirmed', 'stale']);
const claimVisibilitySchema = z.enum(['public', 'hidden', 'temporarily_hidden']);

const sharedRequestShape = {
  schemaVersion: z.literal('problem-report-decision-v1'),
  requestId: z.uuid(),
  expectedSubmissionUpdatedAt: timestampSchema,
  expectedPayloadUpdatedAt: timestampSchema,
  publicSummary: safeTextSchema(1_000).nullable(),
  internalNote: safeTextSchema(2_000).nullable(),
};

const ordinaryDecisionSchema = z
  .object({
    ...sharedRequestShape,
    operation: z.enum([
      'approve_correction_handoff',
      'resolve_duplicate',
      'resolve_no_change',
    ]),
    expectedSubmissionStatus: z.literal('in_review'),
    expectedSubmissionResolution: z.null(),
    claimId: z.null(),
    expectedClaimUpdatedAt: z.null(),
    expectedClaimStatus: z.null(),
    expectedClaimVisibility: z.null(),
    evidenceId: z.null(),
    claimAction: z.null(),
    nextReviewAt: z.null(),
    endedReason: z.null(),
  })
  .strict();

const urgentHideSchema = z
  .object({
    ...sharedRequestShape,
    operation: z.literal('temporarily_hide_claim'),
    expectedSubmissionStatus: z.literal('in_review'),
    expectedSubmissionResolution: z.null(),
    claimId: z.uuid(),
    expectedClaimUpdatedAt: timestampSchema,
    expectedClaimStatus: claimStatusSchema,
    expectedClaimVisibility: z.literal('public'),
    evidenceId: z.null(),
    claimAction: z.null(),
    nextReviewAt: z.null(),
    endedReason: z.null(),
  })
  .strict();

const negativeClaimActionSchema = z
  .object({
    ...sharedRequestShape,
    operation: z.literal('apply_negative_claim_action'),
    expectedSubmissionStatus: z.literal('resolved'),
    expectedSubmissionResolution: z.literal('approved'),
    claimId: z.uuid(),
    expectedClaimUpdatedAt: timestampSchema,
    expectedClaimStatus: claimStatusSchema,
    expectedClaimVisibility: claimVisibilitySchema,
    evidenceId: z.uuid(),
    claimAction: problemReportClaimActionSchema,
    nextReviewAt: timestampSchema.nullable(),
    endedReason: safeTextSchema(1_000).nullable(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.claimAction === 'mark_stale') {
      if (request.expectedClaimStatus !== 'confirmed') {
        context.addIssue({
          code: 'custom',
          path: ['expectedClaimStatus'],
          message: 'Only a confirmed Claim can be marked stale.',
        });
      }
      if (
        request.nextReviewAt === null ||
        Date.parse(request.nextReviewAt) <= Date.parse(request.expectedClaimUpdatedAt)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['nextReviewAt'],
          message: 'Mark-stale requires a future next-review time.',
        });
      }
      if (request.endedReason !== null) {
        context.addIssue({
          code: 'custom',
          path: ['endedReason'],
          message: 'Mark-stale cannot assign an ended reason.',
        });
      }
    }
    if (request.claimAction === 'end') {
      if (request.nextReviewAt !== null) {
        context.addIssue({
          code: 'custom',
          path: ['nextReviewAt'],
          message: 'Ending a Claim cannot assign a next-review time.',
        });
      }
      if (request.endedReason === null) {
        context.addIssue({
          code: 'custom',
          path: ['endedReason'],
          message: 'Ending a Claim requires an ended reason.',
        });
      }
    }
  });

export const problemReportDecisionRequestSchema = z
  .discriminatedUnion('operation', [
    ordinaryDecisionSchema,
    urgentHideSchema,
    negativeClaimActionSchema,
  ])
  .superRefine((request, context) => {
    if (request.publicSummary === null && request.internalNote === null) {
      context.addIssue({
        code: 'custom',
        path: ['internalNote'],
        message: 'A problem report decision requires a public summary or internal note.',
      });
    }
  });

export const problemReportDecisionReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed']),
    submissionId: z.uuid(),
    operation: problemReportDecisionOperationSchema,
    submissionStatus: z.enum(['resolved', 'duplicate']),
    submissionResolution: z.enum(['approved', 'duplicate', 'no_change']),
    claimId: z.uuid().nullable(),
    claimStatus: z.enum(['confirmed', 'stale', 'ended']).nullable(),
    claimVisibility: claimVisibilitySchema.nullable(),
    verificationEventId: z.uuid().nullable(),
    decidedAt: timestampSchema,
  })
  .strict();

export type ProblemReportDecisionRequest = z.infer<typeof problemReportDecisionRequestSchema>;
export type ProblemReportDecisionReceipt = z.infer<typeof problemReportDecisionReceiptSchema>;

export interface ProblemReportDecisionState {
  submissionId: string;
  submissionType: string;
  targetType: string | null;
  targetId: string | null;
  workflowStatus: string;
  resolution: string | null;
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
  evidence: {
    id: string;
    claimId: string | null;
    submissionId: string | null;
    reviewStatus: string;
    polarity: string;
    deletedAt: string | null;
  } | null;
}

export interface ProblemReportDecisionEventRecord {
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

export interface ProblemReportDecisionCommand {
  requestId: string;
  verificationEventId: string | null;
  submissionId: string;
  expectedSubmissionStatus: 'in_review' | 'resolved';
  expectedSubmissionResolution: 'approved' | null;
  expectedSubmissionUpdatedAt: Date;
  expectedPayloadUpdatedAt: Date;
  actorId: string;
  actorType: 'human' | 'system';
  operation: ProblemReportDecisionRequest['operation'];
  reportType: string;
  toSubmissionStatus: 'resolved' | 'duplicate';
  toSubmissionResolution: 'approved' | 'duplicate' | 'no_change';
  claimId: string | null;
  expectedClaimUpdatedAt: Date | null;
  expectedClaimStatus: 'confirmed' | 'stale' | null;
  expectedClaimVisibility: 'public' | 'hidden' | 'temporarily_hidden' | null;
  toClaimStatus: 'stale' | 'ended' | null;
  toClaimVisibility: 'temporarily_hidden' | null;
  nextReviewAt: Date | null;
  endedReason: string | null;
  evidenceId: string | null;
  duplicateTarget: z.infer<typeof problemReportDuplicateTargetSchema> | null;
  eventAction: string;
  eventReasonCode: string;
  eventInternalNote: string;
  publicSummary: string | null;
  decidedAt: Date;
}

export interface ProblemReportDecisionBackend {
  readDecisionEvent(eventId: string): Promise<ProblemReportDecisionEventRecord | null>;
  readState(
    submissionId: string,
    claimId: string | null,
    evidenceId: string | null,
  ): Promise<ProblemReportDecisionState | null>;
  readDuplicateTargetExists(targetType: 'entity' | 'location' | 'claim', targetId: string): Promise<boolean>;
  commitDecision(command: ProblemReportDecisionCommand): Promise<void>;
}

export class ProblemReportDecisionError extends Error {
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
    this.name = 'ProblemReportDecisionError';
  }
}

interface ReportMaterial {
  reportType: string;
  proposedCorrection: z.infer<typeof problemReportCorrectionSchema> | null;
  duplicateTarget: z.infer<typeof problemReportDuplicateTargetSchema> | null;
  privateEvidencePresent: boolean;
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

function targetMatchesClaim(state: ProblemReportDecisionState): boolean {
  if (state.claim === null || state.targetType === null || state.targetId === null) return false;
  if (state.targetType === 'claim') return state.targetId === state.claim.id;
  if (state.targetType === 'entity') return state.targetId === state.claim.entityId;
  if (state.targetType === 'location') return state.targetId === state.claim.locationId;
  return false;
}

function parseReportMaterial(state: ProblemReportDecisionState): ReportMaterial {
  if (state.submissionType === 'problem_report') {
    const projection = problemReportReviewProjectionSchema.safeParse(state.normalizedPayload);
    const original = problemReportOriginalPayloadSchema.safeParse(state.originalPayload);
    if (
      !projection.success ||
      !original.success ||
      projection.data.targetType !== state.targetType ||
      projection.data.targetId !== state.targetId ||
      projection.data.reportType !== original.data.reportType ||
      projection.data.observedAt !== original.data.observedAt ||
      projection.data.explanation !== original.data.explanation ||
      JSON.stringify(projection.data.proposedCorrection) !==
        JSON.stringify(original.data.proposedCorrection) ||
      JSON.stringify(projection.data.duplicateTarget) !== JSON.stringify(original.data.duplicateTarget) ||
      projection.data.restrictedEvidence.privateEvidenceUrlPresent !==
        (original.data.privateEvidenceUrl !== null)
    ) {
      throw new ProblemReportDecisionError(
        'invalid_projection',
        'The stored problem report projection is inconsistent.',
      );
    }
    return {
      reportType: projection.data.reportType,
      proposedCorrection: projection.data.proposedCorrection,
      duplicateTarget: projection.data.duplicateTarget,
      privateEvidencePresent: original.data.privateEvidenceUrl !== null,
    };
  }

  if (state.submissionType === 'payment_report') {
    const projection = paymentReportReviewProjectionSchema.safeParse(state.normalizedPayload);
    const original = paymentReportOriginalPayloadSchema.safeParse(state.originalPayload);
    if (
      !projection.success ||
      !original.success ||
      projection.data.targetType !== state.targetType ||
      projection.data.targetId !== state.targetId ||
      projection.data.result !== 'failed' ||
      original.data.result !== 'failed' ||
      projection.data.paymentDate !== original.data.paymentDate ||
      JSON.stringify(projection.data.payment) !== JSON.stringify(original.data.payment) ||
      projection.data.notes !== original.data.notes ||
      projection.data.restrictedEvidence.privateTransactionUrlPresent !==
        (original.data.privateTransactionUrl !== null)
    ) {
      throw new ProblemReportDecisionError(
        'invalid_projection',
        'The stored failed payment report projection is inconsistent.',
      );
    }
    return {
      reportType: 'failed_payment',
      proposedCorrection: null,
      duplicateTarget: null,
      privateEvidencePresent: original.data.privateTransactionUrl !== null,
    };
  }

  throw new ProblemReportDecisionError(
    'ineligible',
    'Only payment and problem reports are eligible for this decision boundary.',
  );
}

function operationContract(operation: ProblemReportDecisionRequest['operation']) {
  if (operation === 'approve_correction_handoff') {
    return {
      action: 'problem_correction_handoff_approved',
      reason: 'correction_handoff_approved',
      status: 'resolved' as const,
      resolution: 'approved' as const,
    };
  }
  if (operation === 'resolve_duplicate') {
    return {
      action: 'problem_duplicate_resolved',
      reason: 'duplicate_confirmed',
      status: 'duplicate' as const,
      resolution: 'duplicate' as const,
    };
  }
  if (operation === 'resolve_no_change') {
    return {
      action: 'problem_no_change_resolved',
      reason: 'no_change',
      status: 'resolved' as const,
      resolution: 'no_change' as const,
    };
  }
  if (operation === 'temporarily_hide_claim') {
    return {
      action: 'problem_urgent_visibility_decided',
      reason: 'urgent_temporary_hide',
      status: 'resolved' as const,
      resolution: 'approved' as const,
    };
  }
  return {
    action: 'negative_claim_action_decided',
    reason: 'accepted_negative_evidence_action',
    status: 'resolved' as const,
    resolution: 'approved' as const,
  };
}

function assertCapability(
  context: ProblemReportMutationContext,
  operation: ProblemReportDecisionRequest['operation'],
): void {
  const required =
    operation === 'temporarily_hide_claim' || operation === 'apply_negative_claim_action'
      ? 'submission:urgent-visibility:decide'
      : 'submission:problem:decide';
  if (!context.capabilities.includes(required)) {
    throw new ProblemReportDecisionError(
      'unauthorized',
      'The actor is not authorized for this problem report operation.',
    );
  }
}

function replayReceipt(
  existing: ProblemReportDecisionEventRecord,
  submissionId: string,
  request: ProblemReportDecisionRequest,
  actorId: string,
  requestFingerprint: string,
): ProblemReportDecisionReceipt {
  const payload = parseProblemReportDecisionEvent(existing.internalNote);
  const contract = operationContract(request.operation);
  if (
    existing.submissionId !== submissionId ||
    existing.toStatus !== contract.status ||
    existing.action !== contract.action ||
    existing.reasonCode !== contract.reason ||
    existing.actorId !== actorId ||
    payload === null ||
    payload.requestFingerprint !== requestFingerprint ||
    payload.operation !== request.operation ||
    payload.claimId !== request.claimId ||
    payload.evidenceId !== request.evidenceId ||
    payload.claimAction !== request.claimAction
  ) {
    throw new ProblemReportDecisionError(
      'idempotency_conflict',
      'The problem report request UUID was already used for a different operation.',
    );
  }
  const claimStatus =
    request.operation === 'apply_negative_claim_action'
      ? request.claimAction === 'mark_stale'
        ? 'stale'
        : 'ended'
      : request.operation === 'temporarily_hide_claim'
        ? request.expectedClaimStatus
        : null;
  const claimVisibility =
    request.operation === 'temporarily_hide_claim'
      ? 'temporarily_hidden'
      : request.operation === 'apply_negative_claim_action'
        ? request.expectedClaimVisibility
        : null;
  return problemReportDecisionReceiptSchema.parse({
    state: 'replayed',
    submissionId,
    operation: request.operation,
    submissionStatus: contract.status,
    submissionResolution: contract.resolution,
    claimId: request.claimId,
    claimStatus,
    claimVisibility,
    verificationEventId: payload.verificationEventId,
    decidedAt: existing.createdAt,
  });
}

export async function decideProblemReport(
  context: ProblemReportMutationContext,
  backend: ProblemReportDecisionBackend,
  submissionId: string,
  rawRequest: unknown,
  decidedAt = new Date(),
): Promise<ProblemReportDecisionReceipt> {
  const submissionIdResult = z.uuid().safeParse(submissionId);
  const requestResult = problemReportDecisionRequestSchema.safeParse(rawRequest);
  if (!submissionIdResult.success || !requestResult.success || Number.isNaN(decidedAt.getTime())) {
    throw new ProblemReportDecisionError('invalid_request', 'The problem report decision is invalid.');
  }
  const request = requestResult.data;
  assertCapability(context, request.operation);
  const requestFingerprint = await sha256(request);

  let existing: ProblemReportDecisionEventRecord | null;
  try {
    existing = await backend.readDecisionEvent(request.requestId);
  } catch (error) {
    throw new ProblemReportDecisionError('backend_failure', 'Problem decision replay check failed.', {
      cause: error,
    });
  }
  if (existing !== null) {
    return replayReceipt(
      existing,
      submissionIdResult.data,
      request,
      context.actorId,
      requestFingerprint,
    );
  }

  let state: ProblemReportDecisionState | null;
  try {
    state = await backend.readState(submissionIdResult.data, request.claimId, request.evidenceId);
  } catch (error) {
    throw new ProblemReportDecisionError('backend_failure', 'Problem report state could not be loaded.', {
      cause: error,
    });
  }
  if (state === null) {
    throw new ProblemReportDecisionError('not_found', 'The problem report was not found.');
  }
  if (
    state.workflowStatus !== request.expectedSubmissionStatus ||
    state.resolution !== request.expectedSubmissionResolution ||
    state.updatedAt !== request.expectedSubmissionUpdatedAt ||
    state.payloadUpdatedAt !== request.expectedPayloadUpdatedAt
  ) {
    throw new ProblemReportDecisionError(
      'conflict',
      'The problem report changed before the decision.',
    );
  }
  if (request.claimId !== null) {
    if (
      state.claim === null ||
      state.claim.updatedAt !== request.expectedClaimUpdatedAt ||
      state.claim.claimStatus !== request.expectedClaimStatus ||
      state.claim.visibility !== request.expectedClaimVisibility
    ) {
      throw new ProblemReportDecisionError('conflict', 'The Claim changed before the decision.');
    }
    if (!targetMatchesClaim(state)) {
      throw new ProblemReportDecisionError(
        'ineligible',
        'The selected Claim does not belong to the reported target.',
      );
    }
  }

  const material = parseReportMaterial(state);
  if (request.operation !== 'apply_negative_claim_action' && state.submissionType !== 'problem_report') {
    throw new ProblemReportDecisionError(
      'ineligible',
      'This operation requires a problem report.',
    );
  }
  if (request.operation === 'approve_correction_handoff' && material.proposedCorrection === null) {
    throw new ProblemReportDecisionError(
      'ineligible',
      'Correction handoff requires a typed proposed correction.',
    );
  }
  if (request.operation === 'resolve_duplicate') {
    if (material.reportType !== 'duplicate' || material.duplicateTarget === null) {
      throw new ProblemReportDecisionError(
        'ineligible',
        'Duplicate resolution requires a stored duplicate target.',
      );
    }
    let duplicateExists: boolean;
    try {
      duplicateExists = await backend.readDuplicateTargetExists(
        material.duplicateTarget.targetType,
        material.duplicateTarget.targetId,
      );
    } catch (error) {
      throw new ProblemReportDecisionError(
        'backend_failure',
        'The duplicate target could not be checked.',
        { cause: error },
      );
    }
    if (!duplicateExists) {
      throw new ProblemReportDecisionError('ineligible', 'The duplicate target no longer exists.');
    }
  }
  if (request.operation === 'temporarily_hide_claim') {
    if (
      !['business_closed', 'unauthorized_image', 'privacy_issue'].includes(material.reportType) ||
      !material.privateEvidencePresent
    ) {
      throw new ProblemReportDecisionError(
        'ineligible',
        'Urgent temporary hiding requires a closure, privacy, or rights report with restricted evidence.',
      );
    }
  }
  if (request.operation === 'apply_negative_claim_action') {
    if (!['failed_payment', 'no_longer_accepts_crypto', 'payment_failed'].includes(material.reportType)) {
      throw new ProblemReportDecisionError(
        'ineligible',
        'Only reviewed negative payment Evidence can drive this Claim action.',
      );
    }
    if (
      state.evidence === null ||
      state.evidence.id !== request.evidenceId ||
      state.evidence.claimId !== request.claimId ||
      state.evidence.submissionId !== submissionIdResult.data ||
      state.evidence.reviewStatus !== 'accepted' ||
      state.evidence.polarity !== 'contradicting' ||
      state.evidence.deletedAt !== null
    ) {
      throw new ProblemReportDecisionError(
        'ineligible',
        'The selected accepted contradicting Evidence is not valid for this report and Claim.',
      );
    }
  }

  const contract = operationContract(request.operation);
  const verificationEventId =
    request.operation === 'temporarily_hide_claim' ||
    request.operation === 'apply_negative_claim_action'
      ? await deterministicUuid(`problem-report-verification:${request.requestId}`)
      : null;
  const eventInternalNote = serializeProblemReportDecisionEvent({
    schemaVersion: 'problem-report-decision-event-v1',
    requestFingerprint,
    operation: request.operation,
    reportType: material.reportType,
    claimId: request.claimId,
    evidenceId: request.evidenceId,
    verificationEventId,
    claimAction: request.claimAction,
    proposedCorrection: material.proposedCorrection,
    duplicateTarget: material.duplicateTarget,
    publicSummary: request.publicSummary,
    internalNote: request.internalNote,
  });

  const toClaimStatus =
    request.operation === 'apply_negative_claim_action'
      ? request.claimAction === 'mark_stale'
        ? 'stale'
        : 'ended'
      : null;
  try {
    await backend.commitDecision({
      requestId: request.requestId,
      verificationEventId,
      submissionId: submissionIdResult.data,
      expectedSubmissionStatus: request.expectedSubmissionStatus,
      expectedSubmissionResolution: request.expectedSubmissionResolution,
      expectedSubmissionUpdatedAt: new Date(request.expectedSubmissionUpdatedAt),
      expectedPayloadUpdatedAt: new Date(request.expectedPayloadUpdatedAt),
      actorId: context.actorId,
      actorType: context.actorType,
      operation: request.operation,
      reportType: material.reportType,
      toSubmissionStatus: contract.status,
      toSubmissionResolution: contract.resolution,
      claimId: request.claimId,
      expectedClaimUpdatedAt:
        request.expectedClaimUpdatedAt === null ? null : new Date(request.expectedClaimUpdatedAt),
      expectedClaimStatus: request.expectedClaimStatus,
      expectedClaimVisibility: request.expectedClaimVisibility,
      toClaimStatus,
      toClaimVisibility:
        request.operation === 'temporarily_hide_claim' ? 'temporarily_hidden' : null,
      nextReviewAt: request.nextReviewAt === null ? null : new Date(request.nextReviewAt),
      endedReason: request.endedReason,
      evidenceId: request.evidenceId,
      duplicateTarget: material.duplicateTarget,
      eventAction: contract.action,
      eventReasonCode: contract.reason,
      eventInternalNote,
      publicSummary: request.publicSummary,
      decidedAt,
    });
  } catch (error) {
    if (error instanceof SubmissionPersistenceError && error.code === 'conflict') {
      let raced: ProblemReportDecisionEventRecord | null;
      try {
        raced = await backend.readDecisionEvent(request.requestId);
      } catch (readError) {
        throw new ProblemReportDecisionError(
          'backend_failure',
          'Problem decision replay recovery failed.',
          { cause: readError },
        );
      }
      if (raced !== null) {
        return replayReceipt(
          raced,
          submissionIdResult.data,
          request,
          context.actorId,
          requestFingerprint,
        );
      }
      throw new ProblemReportDecisionError(
        'conflict',
        'The problem report or Claim changed before commit.',
        { cause: error },
      );
    }
    throw new ProblemReportDecisionError(
      'backend_failure',
      'The problem report decision could not be committed.',
      { cause: error },
    );
  }

  return problemReportDecisionReceiptSchema.parse({
    state: 'committed',
    submissionId: submissionIdResult.data,
    operation: request.operation,
    submissionStatus: contract.status,
    submissionResolution: contract.resolution,
    claimId: request.claimId,
    claimStatus:
      request.operation === 'temporarily_hide_claim' ? request.expectedClaimStatus : toClaimStatus,
    claimVisibility:
      request.operation === 'temporarily_hide_claim'
        ? 'temporarily_hidden'
        : request.operation === 'apply_negative_claim_action'
          ? request.expectedClaimVisibility
          : null,
    verificationEventId,
    decidedAt: decidedAt.toISOString(),
  });
}
