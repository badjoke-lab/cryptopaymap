import { z } from 'zod';
import { routeTypeValues } from '../../db/schema';
import { claimAssetPublicationContextSchema } from '../../schemas/claim-assets';
import {
  parseProblemClaimAssetReplacementPlanEventPayload,
  problemClaimAssetReplacementPlanReceiptSchema,
  problemClaimAssetReplacementPlanRequestSchema,
  serializeProblemClaimAssetReplacementPlanEventPayload,
  type ProblemClaimAssetReplacementPlanEventPayload,
  type ProblemClaimAssetReplacementPlanReceipt,
  type ProblemClaimAssetReplacementPlanRequest,
  type ProblemClaimAssetReplacementPrivateRow,
} from '../../submissions/problem-claim-asset-replacement-plan-contract';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import {
  readProblemClaimAssetSetPreview,
  type ProblemClaimAssetSetPreviewBackend,
  type ProblemClaimAssetSetPreviewState,
  type ProblemClaimAssetSetRowState,
} from './problem-claim-asset-set-preview';

export interface ProblemClaimAssetReplacementPlanContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:problem-claim-asset-plan:prepare'];
}

export interface ProblemClaimAssetReplacementPlanEventRecord {
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

export interface ProblemClaimAssetReplacementPlanCommitCommand {
  planId: string;
  applicationId: string;
  submissionId: string;
  sourceDecisionEventId: string;
  claimId: string;
  expectedApplicationUpdatedAt: Date;
  expectedClaimUpdatedAt: Date;
  expectedCurrentSet: ProblemClaimAssetReplacementPrivateRow[];
  proposedAssetId: string;
  proposedNetworkId: string;
  correctionKind: 'asset' | 'network';
  actorId: string;
  actorType: 'human' | 'system';
  internalNote: string;
  plannedAt: Date;
}

export interface ProblemClaimAssetReplacementPlanBackend
  extends ProblemClaimAssetSetPreviewBackend {
  readPlanEvent(planId: string): Promise<ProblemClaimAssetReplacementPlanEventRecord | null>;
  commitPlan(command: ProblemClaimAssetReplacementPlanCommitCommand): Promise<void>;
}

export class ProblemClaimAssetReplacementPlanError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'invalid_request'
      | 'not_found'
      | 'conflict'
      | 'ineligible'
      | 'selection_required'
      | 'no_change'
      | 'idempotency_conflict'
      | 'backend_failure',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProblemClaimAssetReplacementPlanError';
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

function privateRow(row: ProblemClaimAssetSetRowState): ProblemClaimAssetReplacementPrivateRow {
  return {
    rowId: row.rowId,
    claimId: row.claimId,
    asset: row.asset,
    network: row.network,
    paymentMethod: row.paymentMethod,
    contractAddress: row.contractAddress,
    isPrimary: row.isPrimary,
    notes: row.notes,
  };
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

function validateCompleteSet(
  routeType: (typeof routeTypeValues)[number],
  claimId: string,
  rows: readonly ProblemClaimAssetReplacementPrivateRow[],
): void {
  if (rows.length === 0 || rows.length > 50 || rows.some((row) => row.claimId !== claimId)) {
    throw new ProblemClaimAssetReplacementPlanError(
      'ineligible',
      'The Claim Asset plan does not contain one bounded complete set.',
    );
  }
  if (rows.filter((row) => row.isPrimary).length !== 1) {
    throw new ProblemClaimAssetReplacementPlanError(
      'ineligible',
      'The Claim Asset plan must preserve exactly one primary row.',
    );
  }
  const tuples = new Set<string>();
  for (const row of rows) {
    const result = claimAssetPublicationContextSchema.safeParse({
      routeType,
      networkSlug: row.network.slug,
      paymentMethodSlug: row.paymentMethod.slug,
      assetStatus: row.asset.status,
      networkStatus: row.network.status,
      paymentMethodStatus: row.paymentMethod.status,
    });
    if (!result.success) {
      throw new ProblemClaimAssetReplacementPlanError(
        'ineligible',
        'The proposed Claim Asset set violates publication prerequisites.',
      );
    }
    const tuple = [
      row.asset.id,
      row.network.id,
      row.paymentMethod.id,
      row.contractAddress ?? '<null>',
    ].join(':');
    if (tuples.has(tuple)) {
      throw new ProblemClaimAssetReplacementPlanError(
        'ineligible',
        'The proposed Claim Asset set contains a duplicate payment combination.',
      );
    }
    tuples.add(tuple);
  }
}

function receiptFromEvent(
  state: 'committed' | 'replayed',
  applicationId: string,
  actorId: string,
  requestFingerprint: string,
  existing: ProblemClaimAssetReplacementPlanEventRecord,
): ProblemClaimAssetReplacementPlanReceipt {
  const payload = parseProblemClaimAssetReplacementPlanEventPayload(existing.internalNote);
  if (
    existing.eventId !== payload?.planId ||
    existing.action !== 'problem_claim_asset_replacement_planned' ||
    existing.fromStatus !== null ||
    existing.toStatus !== 'resolved' ||
    existing.actorId !== actorId ||
    existing.actorType !== 'reviewer' ||
    payload.applicationId !== applicationId ||
    payload.requestFingerprint !== requestFingerprint ||
    existing.submissionId !== payload.submissionId ||
    existing.reasonCode !== payload.correction.kind
  ) {
    throw new ProblemClaimAssetReplacementPlanError(
      'idempotency_conflict',
      'The Claim Asset plan request ID was already used for a different operation.',
    );
  }
  return problemClaimAssetReplacementPlanReceiptSchema.parse({
    state,
    planId: payload.planId,
    applicationId: payload.applicationId,
    claimId: payload.claimId,
    correction: payload.correction,
    selection: payload.selection,
    selectedCurrentRowId: payload.selectedCurrentRowId,
    replacementRowId: payload.replacementRowId,
    currentSetHash: payload.currentSetHash,
    proposedSetHash: payload.proposedSetHash,
    plannedAt: payload.plannedAt,
  });
}

async function readExistingPlan(
  backend: ProblemClaimAssetReplacementPlanBackend,
  requestId: string,
): Promise<ProblemClaimAssetReplacementPlanEventRecord | null> {
  try {
    return await backend.readPlanEvent(requestId);
  } catch (error) {
    throw new ProblemClaimAssetReplacementPlanError(
      'backend_failure',
      'The Claim Asset replacement plan replay check failed.',
      { cause: error },
    );
  }
}

function assertExpectedVersions(
  state: ProblemClaimAssetSetPreviewState,
  request: ProblemClaimAssetReplacementPlanRequest,
): asserts state is ProblemClaimAssetSetPreviewState & {
  claim: NonNullable<ProblemClaimAssetSetPreviewState['claim']>;
} {
  if (state.claim === null) {
    throw new ProblemClaimAssetReplacementPlanError('not_found', 'The target Claim was not found.');
  }
  if (
    state.application.updatedAt !== request.expectedApplicationUpdatedAt ||
    state.application.sourceDecisionEventId !== request.expectedSourceDecisionEventId ||
    state.claim.updatedAt !== request.expectedClaimUpdatedAt
  ) {
    throw new ProblemClaimAssetReplacementPlanError(
      'conflict',
      'The application or Claim changed before replacement planning.',
    );
  }
}

async function buildPayload(
  backend: ProblemClaimAssetReplacementPlanBackend,
  applicationId: string,
  request: ProblemClaimAssetReplacementPlanRequest,
  requestFingerprint: string,
  plannedAt: Date,
): Promise<ProblemClaimAssetReplacementPlanEventPayload> {
  const preview = await readProblemClaimAssetSetPreview(
    {
      actorId: 'system:claim-asset-plan',
      actorType: 'system',
      capabilities: ['submission:problem-claim-asset-preview:read'],
    },
    backend,
    applicationId,
    plannedAt,
  );

  let state: ProblemClaimAssetSetPreviewState | null;
  try {
    state = await backend.readApplicationState(applicationId);
  } catch (error) {
    throw new ProblemClaimAssetReplacementPlanError(
      'backend_failure',
      'The Claim Asset replacement planning state could not be loaded.',
      { cause: error },
    );
  }
  if (state === null) {
    throw new ProblemClaimAssetReplacementPlanError(
      'not_found',
      'The Claim Asset replacement application was not found.',
    );
  }
  assertExpectedVersions(state, request);
  const claim = state.claim;
  const routeType = claim.routeType as (typeof routeTypeValues)[number];
  const currentSet = state.rows
    .map(privateRow)
    .sort((left, right) => left.rowId.localeCompare(right.rowId));
  validateCompleteSet(routeType, claim.claimId, currentSet);
  const currentSetHash = await setHash(currentSet);
  if (
    currentSetHash !== preview.currentSetHash ||
    currentSetHash !== request.expectedCurrentSetHash
  ) {
    throw new ProblemClaimAssetReplacementPlanError(
      'conflict',
      'The complete Claim Asset set changed before replacement planning.',
    );
  }

  let selectedCurrentRowId: string;
  if (request.selection.mode === 'automatic_single_row') {
    if (currentSet.length !== 1 || preview.readiness === 'needs_selection') {
      throw new ProblemClaimAssetReplacementPlanError(
        'selection_required',
        'This Claim requires an explicitly reviewed current-row selection.',
      );
    }
    if (preview.readiness === 'already_matches') {
      throw new ProblemClaimAssetReplacementPlanError(
        'no_change',
        'The proposed registry value already matches the current Claim Asset row.',
      );
    }
    if (preview.readiness !== 'ready' || preview.selectedCurrentRowId === null) {
      throw new ProblemClaimAssetReplacementPlanError(
        'ineligible',
        'The single-row Claim Asset replacement is not ready for planning.',
      );
    }
    selectedCurrentRowId = preview.selectedCurrentRowId;
  } else {
    if (currentSet.length < 2 || preview.readiness !== 'needs_selection') {
      throw new ProblemClaimAssetReplacementPlanError(
        'ineligible',
        'Reviewed current-row selection is only valid for a multi-row Claim awaiting selection.',
      );
    }
    selectedCurrentRowId = request.selection.selectedCurrentRowId as string;
  }

  const selected = currentSet.find((row) => row.rowId === selectedCurrentRowId);
  if (selected === undefined) {
    throw new ProblemClaimAssetReplacementPlanError(
      'ineligible',
      'The selected Claim Asset row is not in the exact current set.',
    );
  }

  let replacementAsset = selected.asset;
  let replacementNetwork = selected.network;
  try {
    if (preview.correction.kind === 'asset') {
      const asset = await backend.readAssetBySlug(preview.correction.proposedSlug);
      if (asset === null || asset.status !== 'active') {
        throw new ProblemClaimAssetReplacementPlanError(
          'ineligible',
          'The proposed Asset registry entry is unavailable.',
        );
      }
      replacementAsset = asset;
    } else {
      const network = await backend.readNetworkBySlug(preview.correction.proposedSlug);
      if (network === null || network.status !== 'active') {
        throw new ProblemClaimAssetReplacementPlanError(
          'ineligible',
          'The proposed Network registry entry is unavailable.',
        );
      }
      replacementNetwork = network;
    }
  } catch (error) {
    if (error instanceof ProblemClaimAssetReplacementPlanError) throw error;
    throw new ProblemClaimAssetReplacementPlanError(
      'backend_failure',
      'The proposed Claim Asset registry entry could not be loaded.',
      { cause: error },
    );
  }

  if (replacementAsset.id === selected.asset.id && replacementNetwork.id === selected.network.id) {
    throw new ProblemClaimAssetReplacementPlanError(
      'no_change',
      'The proposed registry value already matches the selected Claim Asset row.',
    );
  }

  const replacementRowId = await deterministicUuid(
    `problem-claim-asset-replacement:${applicationId}:${state.application.sourceDecisionEventId}:${selected.rowId}:${preview.correction.kind}:${preview.correction.proposedSlug}`,
  );
  const replacement: ProblemClaimAssetReplacementPrivateRow = {
    ...selected,
    rowId: replacementRowId,
    asset: replacementAsset,
    network: replacementNetwork,
  };
  const proposedSet = currentSet
    .map((row) => (row.rowId === selected.rowId ? replacement : row))
    .sort((left, right) => left.rowId.localeCompare(right.rowId));
  validateCompleteSet(routeType, claim.claimId, proposedSet);
  const proposedSetHash = await setHash(proposedSet);
  if (proposedSetHash === currentSetHash) {
    throw new ProblemClaimAssetReplacementPlanError(
      'no_change',
      'The complete proposed Claim Asset set does not change canonical data.',
    );
  }

  return {
    schemaVersion: 'problem-claim-asset-replacement-plan-event-v1',
    planId: request.requestId,
    requestFingerprint,
    applicationId,
    expectedApplicationUpdatedAt: request.expectedApplicationUpdatedAt,
    submissionId: state.application.submissionId,
    sourceDecisionEventId: state.application.sourceDecisionEventId,
    claimId: claim.claimId,
    expectedClaimUpdatedAt: request.expectedClaimUpdatedAt,
    correction: preview.correction,
    selection: request.selection,
    selectedCurrentRowId,
    replacementRowId,
    currentSetHash,
    proposedSetHash,
    currentSet,
    proposedSet,
    plannedAt: plannedAt.toISOString(),
  };
}

export async function prepareProblemClaimAssetReplacementPlan(
  context: ProblemClaimAssetReplacementPlanContext,
  backend: ProblemClaimAssetReplacementPlanBackend,
  applicationId: string,
  rawRequest: unknown,
  plannedAt = new Date(),
): Promise<ProblemClaimAssetReplacementPlanReceipt> {
  if (!context.capabilities.includes('submission:problem-claim-asset-plan:prepare')) {
    throw new ProblemClaimAssetReplacementPlanError(
      'unauthorized',
      'The actor is not authorized to prepare Claim Asset replacement plans.',
    );
  }
  const applicationIdResult = z.uuid().safeParse(applicationId);
  const requestResult = problemClaimAssetReplacementPlanRequestSchema.safeParse(rawRequest);
  if (!applicationIdResult.success || !requestResult.success || Number.isNaN(plannedAt.getTime())) {
    throw new ProblemClaimAssetReplacementPlanError(
      'invalid_request',
      'The Claim Asset replacement plan request is invalid.',
    );
  }
  const request = requestResult.data;
  const requestFingerprint = await sha256({ applicationId: applicationIdResult.data, request });

  const existing = await readExistingPlan(backend, request.requestId);
  if (existing !== null) {
    return receiptFromEvent(
      'replayed',
      applicationIdResult.data,
      context.actorId,
      requestFingerprint,
      existing,
    );
  }

  let payload: ProblemClaimAssetReplacementPlanEventPayload;
  try {
    payload = await buildPayload(
      backend,
      applicationIdResult.data,
      request,
      requestFingerprint,
      plannedAt,
    );
  } catch (error) {
    if (error instanceof ProblemClaimAssetReplacementPlanError) throw error;
    throw new ProblemClaimAssetReplacementPlanError(
      'ineligible',
      'The Claim Asset replacement plan could not be derived from the approved decision.',
      { cause: error },
    );
  }
  const internalNote = serializeProblemClaimAssetReplacementPlanEventPayload(payload);

  try {
    await backend.commitPlan({
      planId: payload.planId,
      applicationId: payload.applicationId,
      submissionId: payload.submissionId,
      sourceDecisionEventId: payload.sourceDecisionEventId,
      claimId: payload.claimId,
      expectedApplicationUpdatedAt: new Date(payload.expectedApplicationUpdatedAt),
      expectedClaimUpdatedAt: new Date(payload.expectedClaimUpdatedAt),
      expectedCurrentSet: payload.currentSet,
      proposedAssetId: payload.proposedSet.find((row) => row.rowId === payload.replacementRowId)
        ?.asset.id as string,
      proposedNetworkId: payload.proposedSet.find((row) => row.rowId === payload.replacementRowId)
        ?.network.id as string,
      correctionKind: payload.correction.kind,
      actorId: context.actorId,
      actorType: context.actorType,
      internalNote,
      plannedAt,
    });
  } catch (error) {
    if (error instanceof SubmissionPersistenceError && error.code === 'conflict') {
      const raced = await readExistingPlan(backend, request.requestId);
      if (raced !== null) {
        return receiptFromEvent(
          'replayed',
          applicationIdResult.data,
          context.actorId,
          requestFingerprint,
          raced,
        );
      }
      throw new ProblemClaimAssetReplacementPlanError(
        'conflict',
        'The application, Claim, or complete Claim Asset set changed before planning committed.',
        { cause: error },
      );
    }
    throw new ProblemClaimAssetReplacementPlanError(
      'backend_failure',
      'The Claim Asset replacement plan could not be committed.',
      { cause: error },
    );
  }

  const committed: ProblemClaimAssetReplacementPlanEventRecord = {
    eventId: payload.planId,
    submissionId: payload.submissionId,
    fromStatus: null,
    toStatus: 'resolved',
    action: 'problem_claim_asset_replacement_planned',
    reasonCode: payload.correction.kind,
    actorId: context.actorId,
    actorType: context.actorType === 'human' ? 'reviewer' : 'system',
    internalNote,
    createdAt: payload.plannedAt,
  };
  return receiptFromEvent(
    'committed',
    applicationIdResult.data,
    context.actorId,
    requestFingerprint,
    committed,
  );
}
