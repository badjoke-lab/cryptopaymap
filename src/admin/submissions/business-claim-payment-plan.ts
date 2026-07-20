import { z } from 'zod';
import {
  businessClaimPaymentPlanEventPayloadSchema,
  businessClaimPaymentPlanReceiptSchema,
  businessClaimPaymentPlanRequestSchema,
  parseBusinessClaimPaymentPlanEventPayload,
  serializeBusinessClaimPaymentPlanEventPayload,
  type BusinessClaimPaymentExistingClaimGuard,
  type BusinessClaimPaymentPlanEventPayload,
  type BusinessClaimPaymentPlanItem,
  type BusinessClaimPaymentPlanReceipt,
  type BusinessClaimPaymentPlanRequest,
  type BusinessClaimPaymentPlannedClaim,
} from '../../submissions/business-claim-payment-plan-contract';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import {
  readBusinessClaimPaymentPreview,
  type BusinessClaimPaymentPreviewBackend,
  type BusinessClaimPaymentPreviewClaimState,
  type BusinessClaimPaymentPreviewState,
} from './business-claim-payment-preview';

export interface BusinessClaimPaymentPlanContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:business-claim-payment-plan:prepare'];
}

export interface BusinessClaimPaymentPlanEventRecord {
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

export interface BusinessClaimPaymentTargetPlanningContext {
  targetType: 'entity' | 'location';
  targetId: string;
  entityId: string;
  entityType: string;
  entityUpdatedAt: string;
  locationId: string | null;
  locationUpdatedAt: string | null;
}

export interface BusinessClaimPaymentPlanExpectedRow {
  rowId: string;
  assetId: string;
  networkId: string;
  paymentMethodId: string;
  contractAddress: string | null;
  isPrimary: boolean;
}

export interface BusinessClaimPaymentPlanExpectedClaim {
  claimId: string;
  expectedClaimUpdatedAt: Date;
  expectedRows: BusinessClaimPaymentPlanExpectedRow[];
}

export interface BusinessClaimPaymentPlanCommitCommand {
  planId: string;
  applicationId: string;
  submissionId: string;
  sourceDecisionEventId: string;
  fieldApplicationEventId: string;
  expectedApplicationUpdatedAt: Date;
  target: BusinessClaimPaymentTargetPlanningContext;
  expectedExistingClaims: BusinessClaimPaymentPlanExpectedClaim[];
  assetIds: string[];
  networkIds: string[];
  paymentMethodIds: string[];
  processorIds: string[];
  actorId: string;
  actorType: 'human' | 'system';
  internalNote: string;
  plannedAt: Date;
}

export interface BusinessClaimPaymentPlanBackend extends BusinessClaimPaymentPreviewBackend {
  readPlanEvent(planId: string): Promise<BusinessClaimPaymentPlanEventRecord | null>;
  readCurrentPlanEvent(applicationId: string): Promise<BusinessClaimPaymentPlanEventRecord | null>;
  readTargetPlanningContext(
    targetType: 'entity' | 'location',
    targetId: string,
  ): Promise<BusinessClaimPaymentTargetPlanningContext | null>;
  commitPlan(command: BusinessClaimPaymentPlanCommitCommand): Promise<void>;
}

export class BusinessClaimPaymentPlanError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'invalid_request'
      | 'not_found'
      | 'conflict'
      | 'ineligible'
      | 'selection_required'
      | 'idempotency_conflict'
      | 'backend_failure',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BusinessClaimPaymentPlanError';
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

function expectedRows(claim: BusinessClaimPaymentPreviewClaimState): BusinessClaimPaymentPlanExpectedRow[] {
  return claim.rows
    .map((row) => ({
      rowId: row.rowId,
      assetId: row.assetId,
      networkId: row.networkId,
      paymentMethodId: row.paymentMethodId,
      contractAddress: row.contractAddress,
      isPrimary: row.isPrimary,
    }))
    .sort((left, right) => left.rowId.localeCompare(right.rowId));
}

async function claimAssetSetHash(claim: BusinessClaimPaymentPreviewClaimState): Promise<string> {
  return sha256(expectedRows(claim));
}

function receiptFromEvent(
  state: 'committed' | 'replayed',
  applicationId: string,
  actorId: string,
  requestFingerprint: string,
  event: BusinessClaimPaymentPlanEventRecord,
): BusinessClaimPaymentPlanReceipt {
  const payload = parseBusinessClaimPaymentPlanEventPayload(event.internalNote);
  if (
    payload === null ||
    event.eventId !== payload.planId ||
    event.action !== 'business_claim_payment_plan_prepared' ||
    event.fromStatus !== null ||
    event.toStatus !== 'resolved' ||
    event.reasonCode !== 'payment_information' ||
    event.actorId !== actorId ||
    event.actorType !== 'reviewer' ||
    payload.applicationId !== applicationId ||
    payload.requestFingerprint !== requestFingerprint ||
    event.submissionId !== payload.submissionId
  ) {
    throw new BusinessClaimPaymentPlanError(
      'idempotency_conflict',
      'The Business Claim payment plan request ID was already used for another operation.',
    );
  }
  return businessClaimPaymentPlanReceiptSchema.parse({
    state,
    planId: payload.planId,
    applicationId: payload.applicationId,
    submissionId: payload.submissionId,
    draftSetHash: payload.draftSetHash,
    itemCount: payload.items.length,
    plannedClaimCount: payload.plannedClaims.length,
    insertCount: payload.items.filter((item) => item.operation === 'insert_claim_asset').length,
    alreadyPresentCount: payload.items.filter((item) => item.operation === 'already_present').length,
    plannedAt: payload.plannedAt,
  });
}

async function readEvent(
  reader: () => Promise<BusinessClaimPaymentPlanEventRecord | null>,
  message: string,
): Promise<BusinessClaimPaymentPlanEventRecord | null> {
  try {
    return await reader();
  } catch (error) {
    throw new BusinessClaimPaymentPlanError('backend_failure', message, { cause: error });
  }
}

function exactClaim(
  state: BusinessClaimPaymentPreviewState,
  claimId: string,
): BusinessClaimPaymentPreviewClaimState {
  const claim = state.claims.find((candidate) => candidate.claimId === claimId);
  if (
    claim === undefined ||
    claim.deletedAt !== null ||
    !['candidate', 'confirmed', 'stale'].includes(claim.claimStatus)
  ) {
    throw new BusinessClaimPaymentPlanError(
      'conflict',
      'A selected existing Claim changed before payment planning.',
    );
  }
  return claim;
}

function exactDuplicateRow(
  claim: BusinessClaimPaymentPreviewClaimState,
  assetId: string,
  networkId: string,
  paymentMethodId: string,
  contractAddress: string | null,
) {
  return claim.rows.find(
    (row) =>
      row.assetId === assetId &&
      row.networkId === networkId &&
      row.paymentMethodId === paymentMethodId &&
      row.contractAddress === contractAddress,
  );
}

function mergeOptionalText(
  current: string | null,
  next: string | null,
  label: string,
): string | null {
  if (current === null) return next;
  if (next === null || next === current) return current;
  throw new BusinessClaimPaymentPlanError(
    'ineligible',
    `Accepted payment drafts disagree on ${label} for one planned Claim.`,
  );
}

async function buildPayload(
  backend: BusinessClaimPaymentPlanBackend,
  applicationId: string,
  request: BusinessClaimPaymentPlanRequest,
  requestFingerprint: string,
  plannedAt: Date,
): Promise<{
  payload: BusinessClaimPaymentPlanEventPayload;
  commit: Omit<
    BusinessClaimPaymentPlanCommitCommand,
    'planId' | 'actorId' | 'actorType' | 'internalNote' | 'plannedAt'
  >;
}> {
  const preview = await readBusinessClaimPaymentPreview(
    {
      actorId: 'system:business-claim-payment-plan',
      actorType: 'system',
      capabilities: ['submission:business-claim-payment-preview:read'],
    },
    backend,
    applicationId,
    plannedAt,
  );
  if (preview.readiness === 'blocked') {
    throw new BusinessClaimPaymentPlanError(
      'ineligible',
      'Blocked Business Claim payment drafts cannot be planned.',
    );
  }
  if (
    preview.application.expectedApplicationUpdatedAt !== request.expectedApplicationUpdatedAt ||
    preview.application.sourceDecisionEventId !== request.expectedSourceDecisionEventId ||
    preview.application.fieldApplicationEventId !== request.expectedFieldApplicationEventId ||
    preview.draftSetHash !== request.expectedDraftSetHash
  ) {
    throw new BusinessClaimPaymentPlanError(
      'conflict',
      'The Business Claim payment preview changed before planning.',
    );
  }

  let state: BusinessClaimPaymentPreviewState | null;
  let targetContext: BusinessClaimPaymentTargetPlanningContext | null;
  try {
    [state, targetContext] = await Promise.all([
      backend.readApplicationState(applicationId),
      backend.readTargetPlanningContext(preview.target.targetType, preview.target.targetId),
    ]);
  } catch (error) {
    throw new BusinessClaimPaymentPlanError(
      'backend_failure',
      'The Business Claim payment planning state could not be loaded.',
      { cause: error },
    );
  }
  if (state === null || targetContext === null) {
    throw new BusinessClaimPaymentPlanError(
      'not_found',
      'The Business Claim payment planning target was not found.',
    );
  }
  if (
    state.application.updatedAt !== request.expectedApplicationUpdatedAt ||
    state.fieldApplicationEvent?.eventId !== request.expectedFieldApplicationEventId ||
    targetContext.targetType !== preview.target.targetType ||
    targetContext.targetId !== preview.target.targetId ||
    targetContext.entityId !== preview.target.entityId ||
    targetContext.locationId !== preview.target.locationId ||
    !['merchant', 'online_service'].includes(targetContext.entityType)
  ) {
    throw new BusinessClaimPaymentPlanError(
      'conflict',
      'The Business Claim target changed before payment planning.',
    );
  }

  const selections = new Map(
    request.selections.map((selection) => [selection.submittedIndex, selection.selectedClaimId]),
  );
  const neededIndexes = preview.items
    .filter((item) => item.readiness === 'needs_selection')
    .map((item) => item.submittedIndex);
  if (neededIndexes.some((index) => !selections.has(index))) {
    throw new BusinessClaimPaymentPlanError(
      'selection_required',
      'Every ambiguous payment draft requires one explicit compatible Claim selection.',
    );
  }
  if (
    request.selections.some(
      (selection) => !neededIndexes.includes(selection.submittedIndex),
    )
  ) {
    throw new BusinessClaimPaymentPlanError(
      'invalid_request',
      'Only ambiguous payment drafts accept reviewer Claim selections.',
    );
  }

  const plannedClaims = new Map<string, BusinessClaimPaymentPlannedClaim>();
  const existingClaims = new Map<
    string,
    { guard: BusinessClaimPaymentExistingClaimGuard; command: BusinessClaimPaymentPlanExpectedClaim }
  >();
  const items: BusinessClaimPaymentPlanItem[] = [];

  for (const item of preview.items) {
    if (
      item.readiness === 'blocked' ||
      item.asset === null ||
      item.network === null ||
      item.paymentMethod === null ||
      item.proposal.routeType === null
    ) {
      throw new BusinessClaimPaymentPlanError(
        'ineligible',
        'A payment draft lost an exact active registry or route before planning.',
      );
    }

    let targetKind: BusinessClaimPaymentPlanItem['targetKind'];
    let targetClaimId: string;
    let expectedTargetClaimUpdatedAt: string | null = null;
    let existingClaimAssetRowId: string | null = null;
    let plannedClaimAssetRowId: string | null = null;
    let operation: BusinessClaimPaymentPlanItem['operation'] = 'insert_claim_asset';
    let isPrimary = item.proposal.isPrimary;

    if (item.readiness === 'create_candidate_claim') {
      targetKind = 'new_candidate_claim';
      const groupKey = [
        preview.target.targetType,
        preview.target.targetId,
        item.proposal.routeType,
        item.processor?.id ?? '<direct>',
      ].join(':');
      targetClaimId = await deterministicUuid(
        `business-claim-payment-candidate:${applicationId}:${request.expectedFieldApplicationEventId}:${groupKey}`,
      );
      const existingPlanned = plannedClaims.get(targetClaimId);
      if (existingPlanned === undefined) {
        plannedClaims.set(targetClaimId, {
          claimId: targetClaimId,
          entityId: preview.target.entityId,
          locationId: preview.target.locationId,
          claimScope:
            preview.target.targetType === 'location'
              ? 'location_specific'
              : targetContext.entityType === 'online_service'
                ? 'online_service'
                : 'brand_global',
          routeType: item.proposal.routeType,
          processorId: item.processor?.id ?? null,
          customerPaysCrypto: true,
          merchantExplicitlyAcceptsCrypto: true,
          claimStatus: 'candidate',
          visibility: 'hidden',
          howToPay: item.proposal.howToPay,
          restrictions: item.proposal.restrictions,
        });
      } else {
        plannedClaims.set(targetClaimId, {
          ...existingPlanned,
          howToPay: mergeOptionalText(
            existingPlanned.howToPay,
            item.proposal.howToPay,
            'how-to-pay instructions',
          ),
          restrictions: mergeOptionalText(
            existingPlanned.restrictions,
            item.proposal.restrictions,
            'payment restrictions',
          ),
        });
      }
    } else {
      targetKind = 'existing_claim';
      targetClaimId =
        item.readiness === 'needs_selection'
          ? (selections.get(item.submittedIndex) as string)
          : (item.selectedClaimId as string);
      if (!item.compatibleClaims.some((claim) => claim.claimId === targetClaimId)) {
        throw new BusinessClaimPaymentPlanError(
          'ineligible',
          'The reviewed Claim selection is not in the exact compatible Claim set.',
        );
      }
      const claim = exactClaim(state, targetClaimId);
      const projected = item.compatibleClaims.find((candidate) => candidate.claimId === targetClaimId);
      if (projected === undefined || projected.updatedAt !== claim.updatedAt) {
        throw new BusinessClaimPaymentPlanError(
          'conflict',
          'A selected compatible Claim changed before payment planning.',
        );
      }
      expectedTargetClaimUpdatedAt = claim.updatedAt;
      const duplicate = exactDuplicateRow(
        claim,
        item.asset.id,
        item.network.id,
        item.paymentMethod.id,
        item.proposal.contractAddress,
      );
      if (duplicate !== undefined) {
        operation = 'already_present';
        existingClaimAssetRowId = duplicate.rowId;
        isPrimary = duplicate.isPrimary;
      } else if (item.proposal.isPrimary && claim.rows.some((row) => row.isPrimary)) {
        throw new BusinessClaimPaymentPlanError(
          'ineligible',
          'A selected Claim already has a different primary payment row.',
        );
      }
      if (!existingClaims.has(claim.claimId)) {
        existingClaims.set(claim.claimId, {
          guard: {
            claimId: claim.claimId,
            expectedClaimUpdatedAt: claim.updatedAt,
            claimAssetSetHash: await claimAssetSetHash(claim),
            rowCount: claim.rows.length,
          },
          command: {
            claimId: claim.claimId,
            expectedClaimUpdatedAt: new Date(claim.updatedAt),
            expectedRows: expectedRows(claim),
          },
        });
      }
    }

    if (operation === 'insert_claim_asset') {
      plannedClaimAssetRowId = await deterministicUuid(
        [
          'business-claim-payment-row',
          applicationId,
          request.expectedFieldApplicationEventId,
          item.submittedIndex,
          targetClaimId,
          item.asset.id,
          item.network.id,
          item.paymentMethod.id,
          item.proposal.contractAddress ?? '<null>',
        ].join(':'),
      );
    }

    items.push({
      submittedIndex: item.submittedIndex,
      proposal: item.proposal,
      operation,
      targetKind,
      targetClaimId,
      expectedTargetClaimUpdatedAt,
      asset: item.asset,
      network: item.network,
      paymentMethod: item.paymentMethod,
      processor: item.processor,
      existingClaimAssetRowId,
      plannedClaimAssetRowId,
      isPrimary,
    });
  }

  const sortedPlannedClaims = [...plannedClaims.values()].sort((left, right) =>
    left.claimId.localeCompare(right.claimId),
  );
  const sortedExisting = [...existingClaims.values()].sort((left, right) =>
    left.guard.claimId.localeCompare(right.guard.claimId),
  );
  const payload = businessClaimPaymentPlanEventPayloadSchema.parse({
    schemaVersion: 'business-claim-payment-plan-event-v1',
    planId: request.requestId,
    requestFingerprint,
    applicationId,
    expectedApplicationUpdatedAt: request.expectedApplicationUpdatedAt,
    submissionId: preview.application.submissionId,
    sourceDecisionEventId: request.expectedSourceDecisionEventId,
    fieldApplicationEventId: request.expectedFieldApplicationEventId,
    target: {
      targetType: targetContext.targetType,
      targetId: targetContext.targetId,
      entityId: targetContext.entityId,
      entityType: targetContext.entityType,
      expectedEntityUpdatedAt: targetContext.entityUpdatedAt,
      locationId: targetContext.locationId,
      expectedLocationUpdatedAt: targetContext.locationUpdatedAt,
    },
    draftSetHash: preview.draftSetHash,
    selections: [...request.selections].sort(
      (left, right) => left.submittedIndex - right.submittedIndex,
    ),
    plannedClaims: sortedPlannedClaims,
    existingClaims: sortedExisting.map((entry) => entry.guard),
    items,
    plannedAt: plannedAt.toISOString(),
  });

  return {
    payload,
    commit: {
      applicationId,
      submissionId: payload.submissionId,
      sourceDecisionEventId: payload.sourceDecisionEventId,
      fieldApplicationEventId: payload.fieldApplicationEventId,
      expectedApplicationUpdatedAt: new Date(payload.expectedApplicationUpdatedAt),
      target: targetContext,
      expectedExistingClaims: sortedExisting.map((entry) => entry.command),
      assetIds: [...new Set(items.map((item) => item.asset.id))].sort(),
      networkIds: [...new Set(items.map((item) => item.network.id))].sort(),
      paymentMethodIds: [...new Set(items.map((item) => item.paymentMethod.id))].sort(),
      processorIds: [
        ...new Set(items.flatMap((item) => (item.processor === null ? [] : [item.processor.id]))),
      ].sort(),
    },
  };
}

export async function prepareBusinessClaimPaymentPlan(
  context: BusinessClaimPaymentPlanContext,
  backend: BusinessClaimPaymentPlanBackend,
  applicationId: string,
  rawRequest: unknown,
  plannedAt = new Date(),
): Promise<BusinessClaimPaymentPlanReceipt> {
  if (!context.capabilities.includes('submission:business-claim-payment-plan:prepare')) {
    throw new BusinessClaimPaymentPlanError(
      'unauthorized',
      'The actor is not authorized to prepare Business Claim payment plans.',
    );
  }
  const applicationIdResult = z.uuid().safeParse(applicationId);
  const requestResult = businessClaimPaymentPlanRequestSchema.safeParse(rawRequest);
  if (!applicationIdResult.success || !requestResult.success || Number.isNaN(plannedAt.getTime())) {
    throw new BusinessClaimPaymentPlanError(
      'invalid_request',
      'The Business Claim payment plan request is invalid.',
    );
  }
  const request = requestResult.data;
  const requestFingerprint = await sha256({ applicationId: applicationIdResult.data, request });

  const existing = await readEvent(
    () => backend.readPlanEvent(request.requestId),
    'The Business Claim payment plan replay check failed.',
  );
  if (existing !== null) {
    return receiptFromEvent(
      'replayed',
      applicationIdResult.data,
      context.actorId,
      requestFingerprint,
      existing,
    );
  }
  const current = await readEvent(
    () => backend.readCurrentPlanEvent(applicationIdResult.data),
    'The current Business Claim payment plan could not be loaded.',
  );
  if (current !== null) {
    throw new BusinessClaimPaymentPlanError(
      'conflict',
      'This Business Claim application already has a durable payment plan.',
    );
  }

  const { payload, commit } = await buildPayload(
    backend,
    applicationIdResult.data,
    request,
    requestFingerprint,
    plannedAt,
  );
  const internalNote = serializeBusinessClaimPaymentPlanEventPayload(payload);

  try {
    await backend.commitPlan({
      ...commit,
      planId: payload.planId,
      actorId: context.actorId,
      actorType: context.actorType,
      internalNote,
      plannedAt,
    });
  } catch (error) {
    if (error instanceof SubmissionPersistenceError && error.code === 'conflict') {
      const raced = await readEvent(
        () => backend.readPlanEvent(request.requestId),
        'The raced Business Claim payment plan could not be loaded.',
      );
      if (raced !== null) {
        return receiptFromEvent(
          'replayed',
          applicationIdResult.data,
          context.actorId,
          requestFingerprint,
          raced,
        );
      }
      throw new BusinessClaimPaymentPlanError(
        'conflict',
        'The application, target, registries, or selected Claims changed before planning committed.',
        { cause: error },
      );
    }
    throw new BusinessClaimPaymentPlanError(
      'backend_failure',
      'The Business Claim payment plan could not be committed.',
      { cause: error },
    );
  }

  return receiptFromEvent(
    'committed',
    applicationIdResult.data,
    context.actorId,
    requestFingerprint,
    {
      eventId: payload.planId,
      submissionId: payload.submissionId,
      fromStatus: null,
      toStatus: 'resolved',
      action: 'business_claim_payment_plan_prepared',
      reasonCode: 'payment_information',
      actorId: context.actorId,
      actorType: context.actorType === 'human' ? 'reviewer' : 'system',
      internalNote,
      createdAt: payload.plannedAt,
    },
  );
}
