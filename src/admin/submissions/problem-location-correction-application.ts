import { z } from 'zod';
import { parseProblemReportDecisionEvent } from '../../submissions/problem-report-decision-contract';
import {
  type LocationCorrectionChanges,
  LocationCorrectionDecisionError,
  type LocationCorrectionDecisionInput,
  type LocationCorrectionDecisionReceipt,
  type LocationCorrectionMutationContext,
  type PracticalLocationCorrectionField,
} from '../location-correction/decision';
import {
  type SubmissionApplicationLifecycleBackend,
  type SubmissionApplicationLifecycleRecord,
  type SubmissionApplicationTransitionReplayRecord,
  transitionSubmissionApplicationLifecycle,
} from './application-lifecycle';
import { problemReportReviewProjectionSchema } from './report-detail';

const timestampSchema = z.iso.datetime({ offset: true });

export const problemLocationCorrectionApplicationRequestSchema = z
  .object({
    schemaVersion: z.literal('problem-location-correction-application-v1'),
    requestId: z.uuid(),
    expectedApplicationUpdatedAt: timestampSchema,
    expectedLocationUpdatedAt: timestampSchema,
  })
  .strict();

export const problemLocationCorrectionSourcePayloadSchema = z
  .object({
    schemaVersion: z.literal('problem-location-correction-source-v1'),
    submissionReference: z.string().regex(/^CPM-S-\d{4}-\d{6}$/),
    sourceDecisionEventId: z.uuid(),
    targetLocationId: z.uuid(),
    reportType: z.string().trim().min(1).max(96),
    observedAt: z.iso.date(),
    proposedCorrection: z.record(z.string(), z.unknown()),
  })
  .strict();

export const problemLocationCorrectionApplicationReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed', 'already_applied']),
    applicationId: z.uuid(),
    submissionId: z.uuid(),
    locationId: z.uuid(),
    correctionDecisionRequestId: z.uuid(),
    sourceRecordId: z.uuid(),
    appliedFieldPaths: z.array(z.string().trim().min(1)).min(1).max(10),
    applicationStatus: z.literal('committed'),
    publicationStatus: z.enum(['pending', 'committed', 'failed']),
    transitionEventId: z.uuid().nullable(),
    appliedAt: timestampSchema,
  })
  .strict();

export type ProblemLocationCorrectionApplicationRequest = z.infer<
  typeof problemLocationCorrectionApplicationRequestSchema
>;
export type ProblemLocationCorrectionApplicationReceipt = z.infer<
  typeof problemLocationCorrectionApplicationReceiptSchema
>;
export type ProblemLocationCorrectionSourcePayload = z.infer<
  typeof problemLocationCorrectionSourcePayloadSchema
>;

export interface ProblemLocationCorrectionApplicationContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:problem-location-correction:apply'];
}

export interface ProblemLocationCorrectionSourceRecordCommand {
  id: string;
  sourceId: string;
  externalId: string;
  rawPayload: ProblemLocationCorrectionSourcePayload;
  observedAt: Date;
  fetchedAt: Date;
  contentHash: string;
}

export interface ProblemLocationCorrectionApplicationState {
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
  location: {
    locationId: string;
    updatedAt: string;
    deletedAt: string | null;
  } | null;
  correctionDecision: {
    requestId: string;
    locationId: string;
    expectedLocationUpdatedAt: string;
    changedFieldPaths: string[];
    decidedAt: string;
  } | null;
}

export interface ProblemLocationCorrectionApplicationBackend
  extends SubmissionApplicationLifecycleBackend {
  readApplicationState(
    applicationId: string,
    correctionRequestId: string,
  ): Promise<ProblemLocationCorrectionApplicationState | null>;
  applyLocationCorrection(
    context: LocationCorrectionMutationContext,
    input: LocationCorrectionDecisionInput,
    sourceRecord: ProblemLocationCorrectionSourceRecordCommand,
  ): Promise<LocationCorrectionDecisionReceipt>;
}

export class ProblemLocationCorrectionApplicationError extends Error {
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
    this.name = 'ProblemLocationCorrectionApplicationError';
  }
}

interface ApplicationPlan {
  locationId: string;
  changes: LocationCorrectionChanges;
  appliedFieldPaths: PracticalLocationCorrectionField[];
  sourcePayload: ProblemLocationCorrectionSourcePayload;
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

function buildChanges(correction: Record<string, unknown>): {
  changes: LocationCorrectionChanges;
  fields: PracticalLocationCorrectionField[];
} {
  if (
    correction.countryCode !== null ||
    correction.latitude !== null ||
    correction.longitude !== null
  ) {
    throw new ProblemLocationCorrectionApplicationError(
      'ineligible',
      'Country and coordinate changes require a separate canonical correction boundary.',
    );
  }

  const changes: LocationCorrectionChanges = {};
  const scalarFields = [
    'addressLine',
    'locality',
    'region',
    'postalCode',
    'websiteUrl',
    'phone',
    'description',
    'openingHours',
  ] as const;
  for (const field of scalarFields) {
    const value = correction[field];
    if (typeof value === 'string') {
      changes[field] = { operation: 'set', value };
    }
  }

  if (Array.isArray(correction.amenities)) {
    changes.amenities =
      correction.amenities.length === 0
        ? { operation: 'clear' }
        : { operation: 'replace', values: correction.amenities as string[] };
  }
  if (Array.isArray(correction.socialLinks)) {
    changes.socialLinks =
      correction.socialLinks.length === 0
        ? { operation: 'clear' }
        : {
            operation: 'replace',
            values: correction.socialLinks as NonNullable<
              Extract<LocationCorrectionChanges['socialLinks'], { operation: 'replace' }>
            >['values'],
          };
  }

  const fields = Object.keys(changes) as PracticalLocationCorrectionField[];
  if (fields.length === 0) {
    throw new ProblemLocationCorrectionApplicationError(
      'ineligible',
      'The approved handoff does not contain a supported practical Location field change.',
    );
  }
  return { changes, fields };
}

function validateAndPlan(
  state: ProblemLocationCorrectionApplicationState,
  request: ProblemLocationCorrectionApplicationRequest,
): ApplicationPlan {
  const { application, submission, sourceDecisionEvent, location } = state;
  const eventPayload = parseProblemReportDecisionEvent(sourceDecisionEvent?.internalNote ?? null);
  const projection = problemReportReviewProjectionSchema.safeParse(submission.normalizedPayload);
  if (
    application.submissionType !== 'problem_report' ||
    application.sourceDecisionKind !== 'problem_correction_handoff' ||
    application.applicationKind !== 'problem_correction' ||
    application.submissionId !== submission.submissionId ||
    submission.submissionType !== 'problem_report' ||
    submission.targetType !== 'location' ||
    submission.targetId === null ||
    submission.workflowStatus !== 'resolved' ||
    submission.resolution !== 'approved' ||
    sourceDecisionEvent === null ||
    sourceDecisionEvent.eventId !== application.sourceDecisionEventId ||
    sourceDecisionEvent.submissionId !== application.submissionId ||
    sourceDecisionEvent.toStatus !== 'resolved' ||
    sourceDecisionEvent.action !== 'problem_correction_handoff_approved' ||
    eventPayload === null ||
    eventPayload.operation !== 'approve_correction_handoff' ||
    eventPayload.proposedCorrection?.kind !== 'location_profile' ||
    !projection.success ||
    projection.data.targetType !== 'location' ||
    projection.data.targetId !== submission.targetId ||
    projection.data.proposedCorrection?.kind !== 'location_profile' ||
    JSON.stringify(projection.data.proposedCorrection) !==
      JSON.stringify(eventPayload.proposedCorrection) ||
    location === null ||
    location.locationId !== submission.targetId ||
    location.deletedAt !== null ||
    (state.correctionDecision === null
      ? location.updatedAt !== request.expectedLocationUpdatedAt
      : state.correctionDecision.requestId !== request.requestId ||
        state.correctionDecision.locationId !== location.locationId ||
        state.correctionDecision.expectedLocationUpdatedAt !== request.expectedLocationUpdatedAt ||
        location.updatedAt !== state.correctionDecision.decidedAt)
  ) {
    throw new ProblemLocationCorrectionApplicationError(
      'ineligible',
      'The approved problem correction handoff is not eligible for Location application.',
    );
  }

  const proposedCorrection = eventPayload.proposedCorrection as unknown as Record<string, unknown>;
  const { changes, fields } = buildChanges(proposedCorrection);
  const sourcePayload = problemLocationCorrectionSourcePayloadSchema.parse({
    schemaVersion: 'problem-location-correction-source-v1',
    submissionReference: submission.publicId,
    sourceDecisionEventId: sourceDecisionEvent.eventId,
    targetLocationId: location.locationId,
    reportType: eventPayload.reportType,
    observedAt: projection.data.observedAt,
    proposedCorrection,
  });

  return {
    locationId: location.locationId,
    changes,
    appliedFieldPaths: fields,
    sourcePayload,
    publicSummary: eventPayload.publicSummary,
    internalNote: `Applied from approved problem report ${submission.publicId}.`,
  };
}

async function readStateAndReplay(
  backend: ProblemLocationCorrectionApplicationBackend,
  applicationId: string,
  request: ProblemLocationCorrectionApplicationRequest,
): Promise<{
  state: ProblemLocationCorrectionApplicationState;
  replay: SubmissionApplicationTransitionReplayRecord | null;
}> {
  try {
    const [state, replay] = await Promise.all([
      backend.readApplicationState(applicationId, request.requestId),
      backend.readTransition(request.requestId),
    ]);
    if (state === null) {
      throw new ProblemLocationCorrectionApplicationError(
        'not_found',
        'The problem correction application was not found.',
      );
    }
    return { state, replay };
  } catch (error) {
    if (error instanceof ProblemLocationCorrectionApplicationError) throw error;
    throw new ProblemLocationCorrectionApplicationError(
      'backend_failure',
      'The problem correction application state could not be loaded.',
      { cause: error },
    );
  }
}

function alreadyAppliedReceipt(
  state: ProblemLocationCorrectionApplicationState,
  request: ProblemLocationCorrectionApplicationRequest,
  sourceRecordId: string,
): ProblemLocationCorrectionApplicationReceipt {
  const { application, correctionDecision } = state;
  if (
    application.applicationStatus !== 'committed' ||
    application.publicationStatus === 'blocked' ||
    application.applicationReceipt?.kind !== 'location_profile_correction_decision' ||
    application.applicationReceipt.ids.length !== 1 ||
    application.applicationReceipt.ids[0] !== request.requestId ||
    correctionDecision === null ||
    correctionDecision.requestId !== request.requestId
  ) {
    throw new ProblemLocationCorrectionApplicationError(
      'conflict',
      'The problem correction application is not pending or bound to the exact correction receipt.',
    );
  }
  return problemLocationCorrectionApplicationReceiptSchema.parse({
    state: 'already_applied',
    applicationId: application.applicationId,
    submissionId: application.submissionId,
    locationId: correctionDecision.locationId,
    correctionDecisionRequestId: correctionDecision.requestId,
    sourceRecordId,
    appliedFieldPaths: correctionDecision.changedFieldPaths,
    applicationStatus: 'committed',
    publicationStatus: application.publicationStatus,
    transitionEventId: null,
    appliedAt: correctionDecision.decidedAt,
  });
}

function mapCorrectionError(error: unknown): never {
  if (error instanceof LocationCorrectionDecisionError) {
    if (error.code === 'not_found') {
      throw new ProblemLocationCorrectionApplicationError(
        'not_found',
        'The canonical Location was not found.',
        { cause: error },
      );
    }
    if (error.code === 'invalid_decision') {
      throw new ProblemLocationCorrectionApplicationError(
        'ineligible',
        'The approved correction does not produce a valid canonical Location change.',
        { cause: error },
      );
    }
    if (error.code === 'conflict') {
      throw new ProblemLocationCorrectionApplicationError(
        'conflict',
        'The canonical Location changed before correction application.',
        { cause: error },
      );
    }
  }
  throw new ProblemLocationCorrectionApplicationError(
    'backend_failure',
    'The approved Location correction could not be applied.',
    { cause: error },
  );
}

export async function applyProblemLocationCorrectionApplication(
  context: ProblemLocationCorrectionApplicationContext,
  backend: ProblemLocationCorrectionApplicationBackend,
  applicationId: string,
  sourceId: string,
  rawRequest: unknown,
  appliedAt = new Date(),
): Promise<ProblemLocationCorrectionApplicationReceipt> {
  if (!context.capabilities.includes('submission:problem-location-correction:apply')) {
    throw new ProblemLocationCorrectionApplicationError(
      'unauthorized',
      'The actor is not authorized to apply approved problem Location corrections.',
    );
  }
  const applicationIdResult = z.uuid().safeParse(applicationId);
  const sourceIdResult = z.uuid().safeParse(sourceId);
  const requestResult = problemLocationCorrectionApplicationRequestSchema.safeParse(rawRequest);
  if (
    !applicationIdResult.success ||
    !sourceIdResult.success ||
    !requestResult.success ||
    Number.isNaN(appliedAt.getTime())
  ) {
    throw new ProblemLocationCorrectionApplicationError(
      'invalid_request',
      'The problem Location correction application request is invalid.',
    );
  }
  const request = requestResult.data;
  const { state, replay } = await readStateAndReplay(backend, applicationIdResult.data, request);
  const plan = validateAndPlan(state, request);
  const sourceRecordId = await deterministicUuid(
    `problem-location-correction-source:${state.application.applicationId}:${state.application.sourceDecisionEventId}`,
  );

  if (replay === null && state.application.applicationStatus === 'committed') {
    if (state.application.updatedAt !== request.expectedApplicationUpdatedAt) {
      throw new ProblemLocationCorrectionApplicationError(
        'conflict',
        'The problem correction application changed before its receipt was confirmed.',
      );
    }
    return alreadyAppliedReceipt(state, request, sourceRecordId);
  }
  if (
    replay === null &&
    (state.application.applicationStatus !== 'pending' ||
      state.application.publicationStatus !== 'blocked' ||
      state.application.updatedAt !== request.expectedApplicationUpdatedAt)
  ) {
    throw new ProblemLocationCorrectionApplicationError(
      'conflict',
      'The problem correction application changed before canonical application.',
    );
  }

  const sourceRecord: ProblemLocationCorrectionSourceRecordCommand = {
    id: sourceRecordId,
    sourceId: sourceIdResult.data,
    externalId: `problem-correction:${state.submission.publicId}:${state.application.sourceDecisionEventId}`,
    rawPayload: plan.sourcePayload,
    observedAt: new Date(`${plan.sourcePayload.observedAt}T00:00:00.000Z`),
    fetchedAt: appliedAt,
    contentHash: await sha256(plan.sourcePayload),
  };
  const locationInput: LocationCorrectionDecisionInput = {
    locationId: plan.locationId,
    expectedLocationUpdatedAt: request.expectedLocationUpdatedAt,
    decidedAt: appliedAt.toISOString(),
    changes: plan.changes,
    sourceRecordIds: [sourceRecordId],
    provenanceAssignments: plan.appliedFieldPaths.map((fieldPath) => ({
      fieldPath,
      sourceRecordIds: [sourceRecordId],
    })),
    reasonCode: 'problem_report_correction',
    publicSummary: plan.publicSummary,
    internalNote: plan.internalNote,
  };

  let correction: LocationCorrectionDecisionReceipt;
  try {
    correction = await backend.applyLocationCorrection(
      {
        requestId: request.requestId,
        actorId: context.actorId,
        actorType: context.actorType,
        capabilities: ['location:correct'],
      },
      locationInput,
      sourceRecord,
    );
  } catch (error) {
    mapCorrectionError(error);
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
        receipt: {
          kind: 'location_profile_correction_decision',
          ids: [request.requestId],
        },
      },
      appliedAt,
    );
    return problemLocationCorrectionApplicationReceiptSchema.parse({
      state: transition.state,
      applicationId: transition.applicationId,
      submissionId: state.application.submissionId,
      locationId: correction.locationId,
      correctionDecisionRequestId: correction.requestId,
      sourceRecordId,
      appliedFieldPaths: correction.appliedFieldPaths,
      applicationStatus: 'committed',
      publicationStatus: transition.toPublicationStatus,
      transitionEventId: transition.transitionEventId,
      appliedAt: transition.changedAt,
    });
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error) {
      const code = (error as { code?: unknown }).code;
      if (code === 'idempotency_conflict') {
        throw new ProblemLocationCorrectionApplicationError(
          'idempotency_conflict',
          'The correction application UUID was already used for different content.',
          { cause: error },
        );
      }
      if (code === 'conflict') {
        throw new ProblemLocationCorrectionApplicationError(
          'conflict',
          'The application lifecycle changed after the canonical correction committed.',
          { cause: error },
        );
      }
    }
    throw new ProblemLocationCorrectionApplicationError(
      'backend_failure',
      'The canonical correction committed but its common application receipt could not be recorded.',
      { cause: error },
    );
  }
}
