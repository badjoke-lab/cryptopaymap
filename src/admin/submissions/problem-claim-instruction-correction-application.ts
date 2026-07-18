import { z } from 'zod';
import { parseProblemReportDecisionEvent } from '../../submissions/problem-report-decision-contract';
import {
  type SubmissionApplicationLifecycleBackend,
  type SubmissionApplicationLifecycleRecord,
  type SubmissionApplicationTransitionReplayRecord,
  transitionSubmissionApplicationLifecycle,
} from './application-lifecycle';
import { problemReportReviewProjectionSchema } from './report-detail';

const timestampSchema = z.iso.datetime({ offset: true });
const safeTextSchema = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !/[<>]/.test(value), 'HTML-like text is not accepted.');

export const problemClaimInstructionCorrectionApplicationRequestSchema = z
  .object({
    schemaVersion: z.literal('problem-claim-instruction-correction-application-v1'),
    requestId: z.uuid(),
    expectedApplicationUpdatedAt: timestampSchema,
    expectedClaimUpdatedAt: timestampSchema,
  })
  .strict();

export const problemClaimInstructionCorrectionSourcePayloadSchema = z
  .object({
    schemaVersion: z.literal('problem-claim-instruction-correction-source-v1'),
    submissionReference: z.string().regex(/^CPM-S-\d{4}-\d{6}$/),
    sourceDecisionEventId: z.uuid(),
    targetClaimId: z.uuid(),
    reportType: z.literal('wrong_instructions'),
    observedAt: z.iso.date(),
    howToPay: safeTextSchema(2_000),
  })
  .strict();

export const problemClaimInstructionCorrectionEventPayloadSchema = z
  .object({
    schemaVersion: z.literal('problem-claim-instruction-correction-event-v1'),
    requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    applicationId: z.uuid(),
    sourceDecisionEventId: z.uuid(),
    claimId: z.uuid(),
    sourceRecordId: z.uuid(),
    verificationEventId: z.uuid(),
    expectedClaimUpdatedAt: timestampSchema,
    beforeHowToPay: safeTextSchema(2_000).nullable(),
    afterHowToPay: safeTextSchema(2_000),
  })
  .strict();

export const problemClaimInstructionCorrectionApplicationReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed', 'already_applied']),
    applicationId: z.uuid(),
    submissionId: z.uuid(),
    claimId: z.uuid(),
    correctionEventId: z.uuid(),
    sourceRecordId: z.uuid(),
    verificationEventId: z.uuid(),
    applicationStatus: z.literal('committed'),
    publicationStatus: z.enum(['pending', 'committed', 'failed']),
    transitionEventId: z.uuid().nullable(),
    appliedAt: timestampSchema,
  })
  .strict();

export type ProblemClaimInstructionCorrectionApplicationRequest = z.infer<
  typeof problemClaimInstructionCorrectionApplicationRequestSchema
>;
export type ProblemClaimInstructionCorrectionSourcePayload = z.infer<
  typeof problemClaimInstructionCorrectionSourcePayloadSchema
>;
export type ProblemClaimInstructionCorrectionEventPayload = z.infer<
  typeof problemClaimInstructionCorrectionEventPayloadSchema
>;
export type ProblemClaimInstructionCorrectionApplicationReceipt = z.infer<
  typeof problemClaimInstructionCorrectionApplicationReceiptSchema
>;

export interface ProblemClaimInstructionCorrectionApplicationContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:problem-claim-instructions:apply'];
}

export interface ProblemClaimInstructionCorrectionSourceRecordCommand {
  id: string;
  sourceId: string;
  externalId: string;
  rawPayload: ProblemClaimInstructionCorrectionSourcePayload;
  observedAt: Date;
  fetchedAt: Date;
  contentHash: string;
}

export interface ProblemClaimInstructionCorrectionEventRecord {
  eventId: string;
  submissionId: string;
  toStatus: string;
  action: string;
  reasonCode: string | null;
  actorId: string;
  internalNote: string | null;
  createdAt: string;
}

export interface ProblemClaimInstructionCorrectionApplicationState {
  application: SubmissionApplicationLifecycleRecord;
  submission: {
    submissionId: string;
    publicId: string;
    submissionType: string;
    targetType: string | null;
    targetId: string | null;
    workflowStatus: string;
    resolution: string | null;
    normalizedPayload: unknown;
  };
  sourceDecisionEvent: {
    eventId: string;
    submissionId: string;
    toStatus: string;
    action: string;
    internalNote: string | null;
    createdAt: string;
  } | null;
  claim: {
    claimId: string;
    claimStatus: string;
    visibility: string;
    howToPay: string | null;
    updatedAt: string;
    deletedAt: string | null;
  } | null;
  correctionEvent: ProblemClaimInstructionCorrectionEventRecord | null;
}

export interface ProblemClaimInstructionCorrectionCommitCommand {
  requestId: string;
  applicationId: string;
  submissionId: string;
  sourceDecisionEventId: string;
  claimId: string;
  expectedClaimUpdatedAt: Date;
  beforeHowToPay: string | null;
  afterHowToPay: string;
  sourceRecord: ProblemClaimInstructionCorrectionSourceRecordCommand;
  verificationEventId: string;
  publicSummary: string | null;
  internalNote: string;
  actorId: string;
  actorType: 'human' | 'system';
  requestFingerprint: string;
  appliedAt: Date;
}

export interface ProblemClaimInstructionCorrectionCommitReceipt {
  state: 'committed' | 'replayed';
  correctionEventId: string;
  claimId: string;
  sourceRecordId: string;
  verificationEventId: string;
  appliedAt: string;
}

export interface ProblemClaimInstructionCorrectionApplicationBackend
  extends SubmissionApplicationLifecycleBackend {
  readApplicationState(
    applicationId: string,
    correctionEventId: string,
  ): Promise<ProblemClaimInstructionCorrectionApplicationState | null>;
  commitClaimInstructionCorrection(
    command: ProblemClaimInstructionCorrectionCommitCommand,
  ): Promise<ProblemClaimInstructionCorrectionCommitReceipt>;
}

export class ProblemClaimInstructionCorrectionApplicationError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'invalid_request'
      | 'not_found'
      | 'ineligible'
      | 'conflict'
      | 'idempotency_conflict'
      | 'backend_failure',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProblemClaimInstructionCorrectionApplicationError';
  }
}

interface ApplicationPlan {
  claimId: string;
  beforeHowToPay: string | null;
  afterHowToPay: string;
  sourcePayload: ProblemClaimInstructionCorrectionSourcePayload;
  publicSummary: string | null;
  internalNote: string;
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

export function parseProblemClaimInstructionCorrectionEvent(
  value: string | null,
): ProblemClaimInstructionCorrectionEventPayload | null {
  if (value === null) return null;
  try {
    const result = problemClaimInstructionCorrectionEventPayloadSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function validateAndPlan(
  state: ProblemClaimInstructionCorrectionApplicationState,
  request: ProblemClaimInstructionCorrectionApplicationRequest,
): ApplicationPlan {
  const { application, submission, sourceDecisionEvent, claim, correctionEvent } = state;
  const decision = parseProblemReportDecisionEvent(sourceDecisionEvent?.internalNote ?? null);
  const projection = problemReportReviewProjectionSchema.safeParse(submission.normalizedPayload);
  const correctionReplay = parseProblemClaimInstructionCorrectionEvent(
    correctionEvent?.internalNote ?? null,
  );
  if (
    application.submissionType !== 'problem_report' ||
    application.sourceDecisionKind !== 'problem_correction_handoff' ||
    application.applicationKind !== 'problem_correction' ||
    application.submissionId !== submission.submissionId ||
    submission.submissionType !== 'problem_report' ||
    submission.targetType !== 'claim' ||
    submission.targetId === null ||
    submission.workflowStatus !== 'resolved' ||
    submission.resolution !== 'approved' ||
    sourceDecisionEvent === null ||
    sourceDecisionEvent.eventId !== application.sourceDecisionEventId ||
    sourceDecisionEvent.submissionId !== application.submissionId ||
    sourceDecisionEvent.toStatus !== 'resolved' ||
    sourceDecisionEvent.action !== 'problem_correction_handoff_approved' ||
    decision === null ||
    decision.operation !== 'approve_correction_handoff' ||
    decision.reportType !== 'wrong_instructions' ||
    decision.proposedCorrection?.kind !== 'instructions' ||
    !projection.success ||
    projection.data.targetType !== 'claim' ||
    projection.data.targetId !== submission.targetId ||
    projection.data.reportType !== 'wrong_instructions' ||
    projection.data.proposedCorrection?.kind !== 'instructions' ||
    JSON.stringify(projection.data.proposedCorrection) !==
      JSON.stringify(decision.proposedCorrection) ||
    claim === null ||
    claim.claimId !== submission.targetId ||
    !['confirmed', 'stale'].includes(claim.claimStatus) ||
    claim.deletedAt !== null ||
    (correctionEvent === null
      ? claim.updatedAt !== request.expectedClaimUpdatedAt
      : correctionEvent.eventId !== request.requestId ||
        correctionEvent.submissionId !== submission.submissionId ||
        correctionEvent.toStatus !== 'resolved' ||
        correctionEvent.action !== 'problem_claim_instructions_applied' ||
        correctionEvent.reasonCode !== 'problem_report_instruction_correction' ||
        correctionReplay === null ||
        correctionReplay.applicationId !== application.applicationId ||
        correctionReplay.sourceDecisionEventId !== application.sourceDecisionEventId ||
        correctionReplay.claimId !== claim.claimId ||
        correctionReplay.expectedClaimUpdatedAt !== request.expectedClaimUpdatedAt ||
        claim.updatedAt !== correctionEvent.createdAt)
  ) {
    throw new ProblemClaimInstructionCorrectionApplicationError(
      'ineligible',
      'The approved instruction correction handoff is not eligible for Claim application.',
    );
  }

  const afterHowToPay = decision.proposedCorrection.howToPay;
  if (claim.howToPay === afterHowToPay && correctionEvent === null) {
    throw new ProblemClaimInstructionCorrectionApplicationError(
      'ineligible',
      'The approved instruction correction does not change the canonical Claim.',
    );
  }

  return {
    claimId: claim.claimId,
    beforeHowToPay: correctionReplay?.beforeHowToPay ?? claim.howToPay,
    afterHowToPay,
    sourcePayload: problemClaimInstructionCorrectionSourcePayloadSchema.parse({
      schemaVersion: 'problem-claim-instruction-correction-source-v1',
      submissionReference: submission.publicId,
      sourceDecisionEventId: sourceDecisionEvent.eventId,
      targetClaimId: claim.claimId,
      reportType: 'wrong_instructions',
      observedAt: projection.data.observedAt,
      howToPay: afterHowToPay,
    }),
    publicSummary: decision.publicSummary,
    internalNote: `Applied instruction correction from approved problem report ${submission.publicId}.`,
  };
}

async function readStateAndReplay(
  backend: ProblemClaimInstructionCorrectionApplicationBackend,
  applicationId: string,
  request: ProblemClaimInstructionCorrectionApplicationRequest,
): Promise<{
  state: ProblemClaimInstructionCorrectionApplicationState;
  transitionReplay: SubmissionApplicationTransitionReplayRecord | null;
}> {
  try {
    const [state, transitionReplay] = await Promise.all([
      backend.readApplicationState(applicationId, request.requestId),
      backend.readTransition(request.requestId),
    ]);
    if (state === null) {
      throw new ProblemClaimInstructionCorrectionApplicationError(
        'not_found',
        'The instruction correction application was not found.',
      );
    }
    return { state, transitionReplay };
  } catch (error) {
    if (error instanceof ProblemClaimInstructionCorrectionApplicationError) throw error;
    throw new ProblemClaimInstructionCorrectionApplicationError(
      'backend_failure',
      'The instruction correction application state could not be loaded.',
      { cause: error },
    );
  }
}

function verifyCanonicalReplay(
  state: ProblemClaimInstructionCorrectionApplicationState,
  payload: ProblemClaimInstructionCorrectionEventPayload,
  context: ProblemClaimInstructionCorrectionApplicationContext,
  requestFingerprint: string,
): ProblemClaimInstructionCorrectionCommitReceipt {
  const event = state.correctionEvent;
  if (
    event === null ||
    event.actorId !== context.actorId ||
    payload.requestFingerprint !== requestFingerprint
  ) {
    throw new ProblemClaimInstructionCorrectionApplicationError(
      'idempotency_conflict',
      'The instruction correction UUID was already used for different content.',
    );
  }
  return {
    state: 'replayed',
    correctionEventId: event.eventId,
    claimId: payload.claimId,
    sourceRecordId: payload.sourceRecordId,
    verificationEventId: payload.verificationEventId,
    appliedAt: event.createdAt,
  };
}

function alreadyAppliedReceipt(
  state: ProblemClaimInstructionCorrectionApplicationState,
  payload: ProblemClaimInstructionCorrectionEventPayload,
): ProblemClaimInstructionCorrectionApplicationReceipt {
  const { application, correctionEvent } = state;
  if (
    correctionEvent === null ||
    application.applicationStatus !== 'committed' ||
    application.publicationStatus === 'blocked' ||
    application.applicationReceipt?.kind !== 'submission_event' ||
    application.applicationReceipt.ids.length !== 1 ||
    application.applicationReceipt.ids[0] !== correctionEvent.eventId
  ) {
    throw new ProblemClaimInstructionCorrectionApplicationError(
      'conflict',
      'The instruction correction application is not bound to the exact canonical receipt.',
    );
  }
  return problemClaimInstructionCorrectionApplicationReceiptSchema.parse({
    state: 'already_applied',
    applicationId: application.applicationId,
    submissionId: application.submissionId,
    claimId: payload.claimId,
    correctionEventId: correctionEvent.eventId,
    sourceRecordId: payload.sourceRecordId,
    verificationEventId: payload.verificationEventId,
    applicationStatus: 'committed',
    publicationStatus: application.publicationStatus,
    transitionEventId: null,
    appliedAt: correctionEvent.createdAt,
  });
}

export async function applyProblemClaimInstructionCorrectionApplication(
  context: ProblemClaimInstructionCorrectionApplicationContext,
  backend: ProblemClaimInstructionCorrectionApplicationBackend,
  applicationId: string,
  sourceId: string,
  rawRequest: unknown,
  appliedAt = new Date(),
): Promise<ProblemClaimInstructionCorrectionApplicationReceipt> {
  if (!context.capabilities.includes('submission:problem-claim-instructions:apply')) {
    throw new ProblemClaimInstructionCorrectionApplicationError(
      'unauthorized',
      'The actor is not authorized to apply approved Claim instruction corrections.',
    );
  }
  const applicationIdResult = z.uuid().safeParse(applicationId);
  const sourceIdResult = z.uuid().safeParse(sourceId);
  const requestResult = problemClaimInstructionCorrectionApplicationRequestSchema.safeParse(rawRequest);
  if (
    !applicationIdResult.success ||
    !sourceIdResult.success ||
    !requestResult.success ||
    Number.isNaN(appliedAt.getTime())
  ) {
    throw new ProblemClaimInstructionCorrectionApplicationError(
      'invalid_request',
      'The Claim instruction correction application request is invalid.',
    );
  }

  const request = requestResult.data;
  const { state, transitionReplay } = await readStateAndReplay(
    backend,
    applicationIdResult.data,
    request,
  );
  const plan = validateAndPlan(state, request);
  const sourceRecordId = await deterministicUuid(
    `problem-claim-instruction-source:${state.application.applicationId}:${state.application.sourceDecisionEventId}`,
  );
  const verificationEventId = await deterministicUuid(
    `problem-claim-instruction-verification:${request.requestId}`,
  );
  const requestFingerprint = await sha256({
    schemaVersion: 'problem-claim-instruction-correction-command-v1',
    request,
    actorId: context.actorId,
    applicationId: state.application.applicationId,
    submissionId: state.application.submissionId,
    sourceDecisionEventId: state.application.sourceDecisionEventId,
    claimId: plan.claimId,
    beforeHowToPay: plan.beforeHowToPay,
    afterHowToPay: plan.afterHowToPay,
    sourceRecordId,
    verificationEventId,
  });
  const existingPayload = parseProblemClaimInstructionCorrectionEvent(
    state.correctionEvent?.internalNote ?? null,
  );

  if (state.application.applicationStatus === 'committed') {
    if (state.application.updatedAt !== request.expectedApplicationUpdatedAt || existingPayload === null) {
      throw new ProblemClaimInstructionCorrectionApplicationError(
        'conflict',
        'The instruction correction application changed before its receipt was confirmed.',
      );
    }
    verifyCanonicalReplay(state, existingPayload, context, requestFingerprint);
    return alreadyAppliedReceipt(state, existingPayload);
  }
  if (
    transitionReplay === null &&
    (state.application.applicationStatus !== 'pending' ||
      state.application.publicationStatus !== 'blocked' ||
      state.application.updatedAt !== request.expectedApplicationUpdatedAt)
  ) {
    throw new ProblemClaimInstructionCorrectionApplicationError(
      'conflict',
      'The instruction correction application changed before canonical application.',
    );
  }

  let canonicalReceipt: ProblemClaimInstructionCorrectionCommitReceipt;
  if (existingPayload !== null) {
    canonicalReceipt = verifyCanonicalReplay(state, existingPayload, context, requestFingerprint);
  } else {
    const sourcePayload = plan.sourcePayload;
    const eventPayload = problemClaimInstructionCorrectionEventPayloadSchema.parse({
      schemaVersion: 'problem-claim-instruction-correction-event-v1',
      requestFingerprint,
      applicationId: state.application.applicationId,
      sourceDecisionEventId: state.application.sourceDecisionEventId,
      claimId: plan.claimId,
      sourceRecordId,
      verificationEventId,
      expectedClaimUpdatedAt: request.expectedClaimUpdatedAt,
      beforeHowToPay: plan.beforeHowToPay,
      afterHowToPay: plan.afterHowToPay,
    });
    try {
      canonicalReceipt = await backend.commitClaimInstructionCorrection({
        requestId: request.requestId,
        applicationId: state.application.applicationId,
        submissionId: state.application.submissionId,
        sourceDecisionEventId: state.application.sourceDecisionEventId,
        claimId: plan.claimId,
        expectedClaimUpdatedAt: new Date(request.expectedClaimUpdatedAt),
        beforeHowToPay: plan.beforeHowToPay,
        afterHowToPay: plan.afterHowToPay,
        sourceRecord: {
          id: sourceRecordId,
          sourceId: sourceIdResult.data,
          externalId: `problem-instructions:${state.submission.publicId}:${state.application.sourceDecisionEventId}`,
          rawPayload: sourcePayload,
          observedAt: new Date(`${sourcePayload.observedAt}T00:00:00.000Z`),
          fetchedAt: appliedAt,
          contentHash: await sha256(sourcePayload),
        },
        verificationEventId,
        publicSummary: plan.publicSummary,
        internalNote: plan.internalNote,
        actorId: context.actorId,
        actorType: context.actorType,
        requestFingerprint,
        appliedAt,
      });
    } catch (error) {
      if (error !== null && typeof error === 'object' && 'code' in error) {
        const code = (error as { code?: unknown }).code;
        if (code === 'idempotency_conflict') {
          throw new ProblemClaimInstructionCorrectionApplicationError(
            'idempotency_conflict',
            'The instruction correction UUID was already used for different content.',
            { cause: error },
          );
        }
        if (code === 'conflict') {
          throw new ProblemClaimInstructionCorrectionApplicationError(
            'conflict',
            'The canonical Claim changed before instruction correction application.',
            { cause: error },
          );
        }
      }
      throw new ProblemClaimInstructionCorrectionApplicationError(
        'backend_failure',
        'The approved Claim instruction correction could not be applied.',
        { cause: error },
      );
    }
  }

  try {
    const transition = await transitionSubmissionApplicationLifecycle(
      {
        actorId: context.actorId,
        actorType: context.actorType,
        capabilities: ['submission:application:transition'],
      },
      backend,
      applicationIdResult.data,
      {
        schemaVersion: 'submission-application-transition-v1',
        requestId: request.requestId,
        operation: 'commit_application',
        expectedApplicationStatus: 'pending',
        expectedPublicationStatus: 'blocked',
        expectedUpdatedAt: request.expectedApplicationUpdatedAt,
        receipt: { kind: 'submission_event', ids: [canonicalReceipt.correctionEventId] },
      },
      appliedAt,
    );
    return problemClaimInstructionCorrectionApplicationReceiptSchema.parse({
      state: transition.state,
      applicationId: transition.applicationId,
      submissionId: state.application.submissionId,
      claimId: canonicalReceipt.claimId,
      correctionEventId: canonicalReceipt.correctionEventId,
      sourceRecordId: canonicalReceipt.sourceRecordId,
      verificationEventId: canonicalReceipt.verificationEventId,
      applicationStatus: 'committed',
      publicationStatus: transition.toPublicationStatus,
      transitionEventId: transition.transitionEventId,
      appliedAt: transition.changedAt,
    });
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error) {
      const code = (error as { code?: unknown }).code;
      if (code === 'idempotency_conflict') {
        throw new ProblemClaimInstructionCorrectionApplicationError(
          'idempotency_conflict',
          'The instruction correction application UUID was reused for different content.',
          { cause: error },
        );
      }
      if (code === 'conflict') {
        throw new ProblemClaimInstructionCorrectionApplicationError(
          'conflict',
          'The application lifecycle changed after the canonical instruction correction committed.',
          { cause: error },
        );
      }
    }
    throw new ProblemClaimInstructionCorrectionApplicationError(
      'backend_failure',
      'The canonical instruction correction committed but its application receipt was not recorded.',
      { cause: error },
    );
  }
}
