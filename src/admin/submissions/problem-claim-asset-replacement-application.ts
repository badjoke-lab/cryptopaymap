import { z } from 'zod';
import { routeTypeValues } from '../../db/schema';
import { claimAssetPublicationContextSchema } from '../../schemas/claim-assets';
import {
  parseProblemClaimAssetReplacementApplicationEventPayload,
  problemClaimAssetReplacementApplicationReceiptSchema,
  problemClaimAssetReplacementApplicationRequestSchema,
  problemClaimAssetReplacementSourcePayloadSchema,
  type ProblemClaimAssetReplacementApplicationEventPayload,
  type ProblemClaimAssetReplacementApplicationReceipt,
  type ProblemClaimAssetReplacementApplicationRequest,
  type ProblemClaimAssetReplacementSourcePayload,
} from '../../submissions/problem-claim-asset-replacement-application-contract';
import {
  parseProblemClaimAssetReplacementPlanEventPayload,
  type ProblemClaimAssetReplacementPlanEventPayload,
  type ProblemClaimAssetReplacementPrivateRow,
} from '../../submissions/problem-claim-asset-replacement-plan-contract';
import { parseProblemReportDecisionEvent } from '../../submissions/problem-report-decision-contract';
import {
  type SubmissionApplicationLifecycleBackend,
  type SubmissionApplicationLifecycleRecord,
  type SubmissionApplicationTransitionReplayRecord,
  transitionSubmissionApplicationLifecycle,
} from './application-lifecycle';
import { problemReportReviewProjectionSchema } from './report-detail';

export interface ProblemClaimAssetReplacementApplicationContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:problem-claim-assets:apply'];
}

export interface ProblemClaimAssetReplacementApplicationEventRecord {
  eventId: string;
  submissionId: string;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  reasonCode: string | null;
  actorId: string;
  actorType: string;
  internalNote: string | null;
  createdAt: string;
}

export interface ProblemClaimAssetReplacementApplicationState {
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
  planEvent: ProblemClaimAssetReplacementApplicationEventRecord | null;
  correctionEvent: ProblemClaimAssetReplacementApplicationEventRecord | null;
  claim: {
    claimId: string;
    claimStatus: string;
    routeType: string;
    updatedAt: string;
    deletedAt: string | null;
  } | null;
  rows: ProblemClaimAssetReplacementPrivateRow[];
}

export interface ProblemClaimAssetReplacementSourceRecordCommand {
  id: string;
  sourceId: string;
  externalId: string;
  rawPayload: ProblemClaimAssetReplacementSourcePayload;
  observedAt: Date;
  fetchedAt: Date;
  contentHash: string;
}

export interface ProblemClaimAssetReplacementCommitCommand {
  requestId: string;
  applicationId: string;
  submissionId: string;
  sourceDecisionEventId: string;
  planId: string;
  planCreatedAt: Date;
  planInternalNote: string;
  claimId: string;
  expectedApplicationUpdatedAt: Date;
  expectedClaimUpdatedAt: Date;
  currentSetHash: string;
  proposedSetHash: string;
  expectedCurrentSet: ProblemClaimAssetReplacementPrivateRow[];
  proposedSet: ProblemClaimAssetReplacementPrivateRow[];
  selectedCurrentRowId: string;
  replacementRowId: string;
  correctionKind: 'asset' | 'network';
  sourceRecord: ProblemClaimAssetReplacementSourceRecordCommand;
  verificationEventId: string;
  publicSummary: string | null;
  internalNote: string;
  actorId: string;
  actorType: 'human' | 'system';
  requestFingerprint: string;
  appliedAt: Date;
}

export interface ProblemClaimAssetReplacementCommitReceipt {
  state: 'committed' | 'replayed';
  correctionEventId: string;
  planId: string;
  claimId: string;
  sourceRecordId: string;
  verificationEventId: string;
  currentSetHash: string;
  proposedSetHash: string;
  appliedAt: string;
}

export interface ProblemClaimAssetReplacementApplicationBackend
  extends SubmissionApplicationLifecycleBackend {
  readApplicationState(
    applicationId: string,
    planId: string,
    correctionEventId: string,
  ): Promise<ProblemClaimAssetReplacementApplicationState | null>;
  commitClaimAssetReplacement(
    command: ProblemClaimAssetReplacementCommitCommand,
  ): Promise<ProblemClaimAssetReplacementCommitReceipt>;
}

export class ProblemClaimAssetReplacementApplicationError extends Error {
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
    this.name = 'ProblemClaimAssetReplacementApplicationError';
  }
}

interface ApplicationPlan {
  payload: ProblemClaimAssetReplacementPlanEventPayload;
  sourcePayload: ProblemClaimAssetReplacementSourcePayload;
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

function internalHashRow(row: ProblemClaimAssetReplacementPrivateRow) {
  return {
    rowId: row.rowId,
    claimId: row.claimId,
    assetId: row.asset.id,
    assetSlug: row.asset.slug,
    assetStatus: row.asset.status,
    networkId: row.network.id,
    networkSlug: row.network.slug,
    networkStatus: row.network.status,
    paymentMethodId: row.paymentMethod.id,
    paymentMethodSlug: row.paymentMethod.slug,
    paymentMethodStatus: row.paymentMethod.status,
    contractAddress: row.contractAddress,
    isPrimary: row.isPrimary,
    notes: row.notes,
  };
}

async function setHash(rows: readonly ProblemClaimAssetReplacementPrivateRow[]): Promise<string> {
  return sha256(rows.map(internalHashRow));
}

function ordered(rows: readonly ProblemClaimAssetReplacementPrivateRow[]) {
  return [...rows].sort((left, right) => left.rowId.localeCompare(right.rowId));
}

function sameRows(
  left: readonly ProblemClaimAssetReplacementPrivateRow[],
  right: readonly ProblemClaimAssetReplacementPrivateRow[],
): boolean {
  return JSON.stringify(ordered(left)) === JSON.stringify(ordered(right));
}

function validateCompleteSet(
  routeType: (typeof routeTypeValues)[number],
  claimId: string,
  rows: readonly ProblemClaimAssetReplacementPrivateRow[],
): void {
  if (rows.length === 0 || rows.length > 50 || rows.some((row) => row.claimId !== claimId)) {
    throw new ProblemClaimAssetReplacementApplicationError(
      'ineligible',
      'The durable plan does not contain one bounded complete Claim Asset set.',
    );
  }
  if (rows.filter((row) => row.isPrimary).length !== 1) {
    throw new ProblemClaimAssetReplacementApplicationError(
      'ineligible',
      'The durable plan does not preserve exactly one primary Claim Asset row.',
    );
  }
  const rowIds = new Set<string>();
  const tuples = new Set<string>();
  for (const row of rows) {
    if (rowIds.has(row.rowId)) {
      throw new ProblemClaimAssetReplacementApplicationError(
        'ineligible',
        'The durable plan contains a duplicate Claim Asset row UUID.',
      );
    }
    rowIds.add(row.rowId);
    const result = claimAssetPublicationContextSchema.safeParse({
      routeType,
      networkSlug: row.network.slug,
      paymentMethodSlug: row.paymentMethod.slug,
      assetStatus: row.asset.status,
      networkStatus: row.network.status,
      paymentMethodStatus: row.paymentMethod.status,
    });
    if (!result.success) {
      throw new ProblemClaimAssetReplacementApplicationError(
        'ineligible',
        'The durable plan violates Claim Asset publication prerequisites.',
      );
    }
    const tuple = [
      row.asset.id,
      row.network.id,
      row.paymentMethod.id,
      row.contractAddress ?? '<null>',
    ].join(':');
    if (tuples.has(tuple)) {
      throw new ProblemClaimAssetReplacementApplicationError(
        'ineligible',
        'The durable plan contains a duplicate payment combination.',
      );
    }
    tuples.add(tuple);
  }
}

function validateReplacementShape(payload: ProblemClaimAssetReplacementPlanEventPayload): void {
  const selected = payload.currentSet.find((row) => row.rowId === payload.selectedCurrentRowId);
  const replacement = payload.proposedSet.find((row) => row.rowId === payload.replacementRowId);
  if (
    selected === undefined ||
    replacement === undefined ||
    payload.currentSet.some((row) => row.rowId === payload.replacementRowId) ||
    payload.proposedSet.some((row) => row.rowId === payload.selectedCurrentRowId)
  ) {
    throw new ProblemClaimAssetReplacementApplicationError(
      'ineligible',
      'The durable plan does not contain one exact selected-row replacement.',
    );
  }
  const currentRemainder = payload.currentSet.filter(
    (row) => row.rowId !== payload.selectedCurrentRowId,
  );
  const proposedRemainder = payload.proposedSet.filter(
    (row) => row.rowId !== payload.replacementRowId,
  );
  if (!sameRows(currentRemainder, proposedRemainder)) {
    throw new ProblemClaimAssetReplacementApplicationError(
      'ineligible',
      'The durable plan changes an unselected Claim Asset row.',
    );
  }
  if (
    selected.claimId !== replacement.claimId ||
    selected.paymentMethod.id !== replacement.paymentMethod.id ||
    selected.contractAddress !== replacement.contractAddress ||
    selected.isPrimary !== replacement.isPrimary ||
    selected.notes !== replacement.notes
  ) {
    throw new ProblemClaimAssetReplacementApplicationError(
      'ineligible',
      'The durable plan does not preserve the selected row payment tuple metadata.',
    );
  }
  const validCorrection =
    (payload.correction.kind === 'asset' &&
      selected.asset.id !== replacement.asset.id &&
      selected.network.id === replacement.network.id &&
      replacement.asset.slug === payload.correction.proposedSlug) ||
    (payload.correction.kind === 'network' &&
      selected.network.id !== replacement.network.id &&
      selected.asset.id === replacement.asset.id &&
      replacement.network.slug === payload.correction.proposedSlug);
  if (!validCorrection) {
    throw new ProblemClaimAssetReplacementApplicationError(
      'ineligible',
      'The durable plan replacement does not match the approved correction.',
    );
  }
}

async function validateAndPlan(
  state: ProblemClaimAssetReplacementApplicationState,
  request: ProblemClaimAssetReplacementApplicationRequest,
): Promise<ApplicationPlan> {
  const { application, submission, sourceDecisionEvent, planEvent, correctionEvent, claim } = state;
  const payload = parseProblemClaimAssetReplacementPlanEventPayload(
    planEvent?.internalNote ?? null,
  );
  const correctionReplay = parseProblemClaimAssetReplacementApplicationEventPayload(
    correctionEvent?.internalNote ?? null,
  );
  const decision = parseProblemReportDecisionEvent(sourceDecisionEvent?.internalNote ?? null);
  const projection = problemReportReviewProjectionSchema.safeParse(submission.normalizedPayload);

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
    planEvent === null ||
    planEvent.eventId !== request.planId ||
    planEvent.submissionId !== submission.submissionId ||
    planEvent.fromStatus !== null ||
    planEvent.toStatus !== 'resolved' ||
    planEvent.action !== 'problem_claim_asset_replacement_planned' ||
    payload === null ||
    planEvent.reasonCode !== payload.correction.kind ||
    planEvent.createdAt !== payload.plannedAt ||
    payload.planId !== request.planId ||
    payload.applicationId !== application.applicationId ||
    payload.submissionId !== submission.submissionId ||
    payload.sourceDecisionEventId !== application.sourceDecisionEventId ||
    payload.claimId !== submission.targetId ||
    payload.expectedApplicationUpdatedAt !== request.expectedApplicationUpdatedAt ||
    payload.expectedClaimUpdatedAt !== request.expectedClaimUpdatedAt ||
    payload.sourceDecisionEventId !== request.expectedSourceDecisionEventId ||
    payload.currentSetHash !== request.expectedCurrentSetHash ||
    payload.proposedSetHash !== request.expectedProposedSetHash ||
    payload.plannedAt !== request.expectedPlanCreatedAt ||
    decision === null ||
    decision.operation !== 'approve_correction_handoff' ||
    !['wrong_asset', 'wrong_network'].includes(decision.reportType) ||
    decision.proposedCorrection === null ||
    decision.proposedCorrection.kind !== payload.correction.kind ||
    !projection.success ||
    projection.data.targetType !== 'claim' ||
    projection.data.targetId !== submission.targetId ||
    projection.data.reportType !== payload.correction.reportType ||
    JSON.stringify(projection.data.proposedCorrection) !==
      JSON.stringify(decision.proposedCorrection) ||
    claim === null ||
    claim.claimId !== payload.claimId ||
    !['confirmed', 'stale'].includes(claim.claimStatus) ||
    !routeTypeValues.includes(claim.routeType as (typeof routeTypeValues)[number]) ||
    claim.deletedAt !== null
  ) {
    throw new ProblemClaimAssetReplacementApplicationError(
      'ineligible',
      'The durable Claim Asset replacement plan is not eligible for canonical application.',
    );
  }

  if (
    decision.proposedCorrection.kind !== 'asset' &&
    decision.proposedCorrection.kind !== 'network'
  ) {
    throw new ProblemClaimAssetReplacementApplicationError(
      'ineligible',
      'The retained decision is not an Asset or Network correction.',
    );
  }
  const proposedCorrectionSlug =
    decision.proposedCorrection.kind === 'asset'
      ? decision.proposedCorrection.assetSlug
      : decision.proposedCorrection.networkSlug;
  if (
    decision.reportType !== payload.correction.reportType ||
    proposedCorrectionSlug !== payload.correction.proposedSlug
  ) {
    throw new ProblemClaimAssetReplacementApplicationError(
      'ineligible',
      'The durable plan does not match the retained approved Problem Report decision.',
    );
  }

  const routeType = claim.routeType as (typeof routeTypeValues)[number];
  validateCompleteSet(routeType, claim.claimId, payload.currentSet);
  validateCompleteSet(routeType, claim.claimId, payload.proposedSet);
  validateReplacementShape(payload);
  if (
    (await setHash(payload.currentSet)) !== payload.currentSetHash ||
    (await setHash(payload.proposedSet)) !== payload.proposedSetHash ||
    payload.currentSetHash === payload.proposedSetHash
  ) {
    throw new ProblemClaimAssetReplacementApplicationError(
      'ineligible',
      'The durable plan complete-set hashes are invalid.',
    );
  }

  if (correctionEvent === null) {
    if (
      application.applicationStatus !== 'pending' ||
      application.publicationStatus !== 'blocked' ||
      application.applicationReceipt !== null ||
      application.updatedAt !== request.expectedApplicationUpdatedAt ||
      claim.updatedAt !== request.expectedClaimUpdatedAt ||
      !sameRows(state.rows, payload.currentSet)
    ) {
      throw new ProblemClaimAssetReplacementApplicationError(
        'conflict',
        'The application, Claim, or complete current Claim Asset set changed before application.',
      );
    }
  } else if (
    correctionEvent.eventId !== request.requestId ||
    correctionEvent.submissionId !== submission.submissionId ||
    correctionEvent.fromStatus !== null ||
    correctionEvent.toStatus !== 'resolved' ||
    correctionEvent.action !== 'problem_claim_assets_replaced' ||
    correctionEvent.reasonCode !== `problem_report_${payload.correction.kind}_correction` ||
    correctionReplay === null ||
    correctionReplay.applicationId !== application.applicationId ||
    correctionReplay.planId !== payload.planId ||
    correctionReplay.sourceDecisionEventId !== application.sourceDecisionEventId ||
    correctionReplay.claimId !== claim.claimId ||
    correctionReplay.currentSetHash !== payload.currentSetHash ||
    correctionReplay.proposedSetHash !== payload.proposedSetHash ||
    correctionReplay.selectedCurrentRowId !== payload.selectedCurrentRowId ||
    correctionReplay.replacementRowId !== payload.replacementRowId ||
    claim.updatedAt !== correctionEvent.createdAt ||
    !sameRows(state.rows, payload.proposedSet)
  ) {
    throw new ProblemClaimAssetReplacementApplicationError(
      'conflict',
      'The existing Claim Asset replacement does not match the exact durable plan.',
    );
  }

  return {
    payload,
    sourcePayload: problemClaimAssetReplacementSourcePayloadSchema.parse({
      schemaVersion: 'problem-claim-asset-replacement-source-v1',
      submissionReference: submission.publicId,
      planId: payload.planId,
      sourceDecisionEventId: payload.sourceDecisionEventId,
      targetClaimId: payload.claimId,
      reportType: payload.correction.reportType,
      correction: {
        kind: payload.correction.kind,
        proposedSlug: payload.correction.proposedSlug,
      },
      observedAt: projection.data.observedAt,
      currentSetHash: payload.currentSetHash,
      proposedSetHash: payload.proposedSetHash,
      selectedCurrentRowId: payload.selectedCurrentRowId,
      replacementRowId: payload.replacementRowId,
    }),
    publicSummary: decision.publicSummary,
    internalNote: `Applied durable Claim Asset replacement plan ${payload.planId} from approved problem report ${submission.publicId}.`,
  };
}

async function readStateAndReplay(
  backend: ProblemClaimAssetReplacementApplicationBackend,
  applicationId: string,
  request: ProblemClaimAssetReplacementApplicationRequest,
): Promise<{
  state: ProblemClaimAssetReplacementApplicationState;
  transitionReplay: SubmissionApplicationTransitionReplayRecord | null;
}> {
  try {
    const [state, transitionReplay] = await Promise.all([
      backend.readApplicationState(applicationId, request.planId, request.requestId),
      backend.readTransition(request.requestId),
    ]);
    if (state === null) {
      throw new ProblemClaimAssetReplacementApplicationError(
        'not_found',
        'The Claim Asset replacement application was not found.',
      );
    }
    return { state, transitionReplay };
  } catch (error) {
    if (error instanceof ProblemClaimAssetReplacementApplicationError) throw error;
    throw new ProblemClaimAssetReplacementApplicationError(
      'backend_failure',
      'The Claim Asset replacement application state could not be loaded.',
      { cause: error },
    );
  }
}

function verifyCanonicalReplay(
  state: ProblemClaimAssetReplacementApplicationState,
  payload: ProblemClaimAssetReplacementApplicationEventPayload,
  context: ProblemClaimAssetReplacementApplicationContext,
  requestFingerprint: string,
): ProblemClaimAssetReplacementCommitReceipt {
  const event = state.correctionEvent;
  if (
    event === null ||
    event.actorId !== context.actorId ||
    payload.requestFingerprint !== requestFingerprint
  ) {
    throw new ProblemClaimAssetReplacementApplicationError(
      'idempotency_conflict',
      'The Claim Asset replacement UUID was already used for different content.',
    );
  }
  return {
    state: 'replayed',
    correctionEventId: event.eventId,
    planId: payload.planId,
    claimId: payload.claimId,
    sourceRecordId: payload.sourceRecordId,
    verificationEventId: payload.verificationEventId,
    currentSetHash: payload.currentSetHash,
    proposedSetHash: payload.proposedSetHash,
    appliedAt: event.createdAt,
  };
}

function alreadyAppliedReceipt(
  state: ProblemClaimAssetReplacementApplicationState,
  payload: ProblemClaimAssetReplacementApplicationEventPayload,
): ProblemClaimAssetReplacementApplicationReceipt {
  const { application, correctionEvent } = state;
  if (
    correctionEvent === null ||
    application.applicationStatus !== 'committed' ||
    application.publicationStatus === 'blocked' ||
    application.applicationReceipt?.kind !== 'submission_event' ||
    application.applicationReceipt.ids.length !== 1 ||
    application.applicationReceipt.ids[0] !== correctionEvent.eventId
  ) {
    throw new ProblemClaimAssetReplacementApplicationError(
      'conflict',
      'The Claim Asset replacement application is not bound to the exact canonical receipt.',
    );
  }
  return problemClaimAssetReplacementApplicationReceiptSchema.parse({
    state: 'already_applied',
    applicationId: application.applicationId,
    submissionId: application.submissionId,
    claimId: payload.claimId,
    planId: payload.planId,
    correctionEventId: correctionEvent.eventId,
    sourceRecordId: payload.sourceRecordId,
    verificationEventId: payload.verificationEventId,
    currentSetHash: payload.currentSetHash,
    proposedSetHash: payload.proposedSetHash,
    applicationStatus: 'committed',
    publicationStatus: application.publicationStatus,
    transitionEventId: null,
    appliedAt: correctionEvent.createdAt,
  });
}

function mapCanonicalCommitError(error: unknown): never {
  if (error !== null && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'idempotency_conflict') {
      throw new ProblemClaimAssetReplacementApplicationError(
        'idempotency_conflict',
        'The Claim Asset replacement UUID was already used for different content.',
        { cause: error },
      );
    }
    if (code === 'conflict') {
      throw new ProblemClaimAssetReplacementApplicationError(
        'conflict',
        'The application, Claim, plan, or complete Claim Asset set changed before commit.',
        { cause: error },
      );
    }
  }
  throw new ProblemClaimAssetReplacementApplicationError(
    'backend_failure',
    'The approved Claim Asset replacement could not be applied.',
    { cause: error },
  );
}

function mapLifecycleError(error: unknown): never {
  if (error !== null && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'idempotency_conflict') {
      throw new ProblemClaimAssetReplacementApplicationError(
        'idempotency_conflict',
        'The Claim Asset replacement application UUID was reused for different content.',
        { cause: error },
      );
    }
    if (code === 'conflict') {
      throw new ProblemClaimAssetReplacementApplicationError(
        'conflict',
        'The application lifecycle changed after the canonical Claim Asset replacement committed.',
        { cause: error },
      );
    }
  }
  throw new ProblemClaimAssetReplacementApplicationError(
    'backend_failure',
    'The canonical Claim Asset replacement committed but its application receipt was not recorded.',
    { cause: error },
  );
}

export async function applyProblemClaimAssetReplacementApplication(
  context: ProblemClaimAssetReplacementApplicationContext,
  backend: ProblemClaimAssetReplacementApplicationBackend,
  applicationId: string,
  sourceId: string,
  rawRequest: unknown,
  appliedAt = new Date(),
): Promise<ProblemClaimAssetReplacementApplicationReceipt> {
  if (!context.capabilities.includes('submission:problem-claim-assets:apply')) {
    throw new ProblemClaimAssetReplacementApplicationError(
      'unauthorized',
      'The actor is not authorized to apply approved Claim Asset replacements.',
    );
  }

  const applicationIdResult = z.uuid().safeParse(applicationId);
  const sourceIdResult = z.uuid().safeParse(sourceId);
  const requestResult = problemClaimAssetReplacementApplicationRequestSchema.safeParse(rawRequest);
  if (
    !applicationIdResult.success ||
    !sourceIdResult.success ||
    !requestResult.success ||
    Number.isNaN(appliedAt.getTime())
  ) {
    throw new ProblemClaimAssetReplacementApplicationError(
      'invalid_request',
      'The Claim Asset replacement application request is invalid.',
    );
  }

  const request = requestResult.data;
  const { state, transitionReplay } = await readStateAndReplay(
    backend,
    applicationIdResult.data,
    request,
  );
  const plan = await validateAndPlan(state, request);
  const sourceRecordId = await deterministicUuid(
    `problem-claim-asset-source:${state.application.applicationId}:${plan.payload.planId}`,
  );
  const verificationEventId = await deterministicUuid(
    `problem-claim-asset-verification:${request.requestId}`,
  );
  const requestFingerprint = await sha256({
    schemaVersion: 'problem-claim-asset-replacement-command-v1',
    request,
    actorId: context.actorId,
    applicationId: state.application.applicationId,
    submissionId: state.application.submissionId,
    sourceDecisionEventId: state.application.sourceDecisionEventId,
    claimId: plan.payload.claimId,
    sourceId: sourceIdResult.data,
    sourceRecordId,
    verificationEventId,
    currentSet: plan.payload.currentSet,
    proposedSet: plan.payload.proposedSet,
  });
  const existingPayload = parseProblemClaimAssetReplacementApplicationEventPayload(
    state.correctionEvent?.internalNote ?? null,
  );

  if (state.application.applicationStatus === 'committed') {
    if (existingPayload === null) {
      throw new ProblemClaimAssetReplacementApplicationError(
        'conflict',
        'The committed Claim Asset replacement application has no exact canonical receipt.',
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
    throw new ProblemClaimAssetReplacementApplicationError(
      'conflict',
      'The Claim Asset replacement application changed before canonical application.',
    );
  }

  let canonicalReceipt: ProblemClaimAssetReplacementCommitReceipt;
  if (existingPayload !== null) {
    canonicalReceipt = verifyCanonicalReplay(state, existingPayload, context, requestFingerprint);
  } else {
    const sourcePayload = plan.sourcePayload;
    try {
      canonicalReceipt = await backend.commitClaimAssetReplacement({
        requestId: request.requestId,
        applicationId: state.application.applicationId,
        submissionId: state.application.submissionId,
        sourceDecisionEventId: state.application.sourceDecisionEventId,
        planId: plan.payload.planId,
        planCreatedAt: new Date(plan.payload.plannedAt),
        planInternalNote: JSON.stringify(plan.payload),
        claimId: plan.payload.claimId,
        expectedApplicationUpdatedAt: new Date(request.expectedApplicationUpdatedAt),
        expectedClaimUpdatedAt: new Date(request.expectedClaimUpdatedAt),
        currentSetHash: plan.payload.currentSetHash,
        proposedSetHash: plan.payload.proposedSetHash,
        expectedCurrentSet: plan.payload.currentSet,
        proposedSet: plan.payload.proposedSet,
        selectedCurrentRowId: plan.payload.selectedCurrentRowId,
        replacementRowId: plan.payload.replacementRowId,
        correctionKind: plan.payload.correction.kind,
        sourceRecord: {
          id: sourceRecordId,
          sourceId: sourceIdResult.data,
          externalId: `problem-claim-assets:${state.submission.publicId}:${plan.payload.planId}`,
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
      mapCanonicalCommitError(error);
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
    return problemClaimAssetReplacementApplicationReceiptSchema.parse({
      state: transition.state,
      applicationId: transition.applicationId,
      submissionId: state.application.submissionId,
      claimId: canonicalReceipt.claimId,
      planId: canonicalReceipt.planId,
      correctionEventId: canonicalReceipt.correctionEventId,
      sourceRecordId: canonicalReceipt.sourceRecordId,
      verificationEventId: canonicalReceipt.verificationEventId,
      currentSetHash: canonicalReceipt.currentSetHash,
      proposedSetHash: canonicalReceipt.proposedSetHash,
      applicationStatus: 'committed',
      publicationStatus: transition.toPublicationStatus,
      transitionEventId: transition.transitionEventId,
      appliedAt: transition.changedAt,
    });
  } catch (error) {
    mapLifecycleError(error);
  }
}
