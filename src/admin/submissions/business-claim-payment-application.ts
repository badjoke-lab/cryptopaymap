import { z } from 'zod';
import {
  businessClaimPaymentApplicationReceiptSchema,
  businessClaimPaymentApplicationRequestSchema,
  businessClaimPaymentSourcePayloadSchema,
  parseBusinessClaimPaymentApplicationEventPayload,
  type BusinessClaimPaymentApplicationEventPayload,
  type BusinessClaimPaymentApplicationReceipt,
  type BusinessClaimPaymentFinalClaimAssetSet,
  type BusinessClaimPaymentApplicationRequest,
  type BusinessClaimPaymentSourcePayload,
  type BusinessClaimPaymentVerificationReference,
} from '../../submissions/business-claim-payment-application-contract';
import {
  parseBusinessClaimPaymentPlanEventPayload,
  type BusinessClaimPaymentPlanEventPayload,
  type BusinessClaimPaymentPlanItem,
  type BusinessClaimPaymentPlannedClaim,
} from '../../submissions/business-claim-payment-plan-contract';
import { SubmissionPersistenceError } from '../../submissions/persistence';
import {
  type SubmissionApplicationLifecycleBackend,
  type SubmissionApplicationLifecycleRecord,
  type SubmissionApplicationTransitionReplayRecord,
  transitionSubmissionApplicationLifecycle,
} from './application-lifecycle';

export interface BusinessClaimPaymentApplicationContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:business-claim-payments:apply'];
}

export interface BusinessClaimPaymentApplicationEventRecord {
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

export interface BusinessClaimPaymentApplicationClaimState {
  claimId: string;
  entityId: string;
  locationId: string | null;
  claimScope: string;
  routeType: string;
  acceptanceScope: string;
  processorId: string | null;
  customerPaysCrypto: boolean;
  merchantExplicitlyAcceptsCrypto: boolean;
  claimStatus: string;
  visibility: string;
  howToPay: string | null;
  instructionsLanguage: string;
  merchantReceives: string;
  restrictions: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface BusinessClaimPaymentApplicationRowState {
  rowId: string;
  claimId: string;
  assetId: string;
  networkId: string;
  paymentMethodId: string;
  contractAddress: string | null;
  isPrimary: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessClaimPaymentApplicationState {
  application: SubmissionApplicationLifecycleRecord;
  submission: {
    submissionId: string;
    publicId: string;
    submissionType: string;
    targetType: string | null;
    targetId: string | null;
    workflowStatus: string;
    resolution: string | null;
  };
  sourceDecisionEvent: BusinessClaimPaymentApplicationEventRecord | null;
  fieldApplicationEvent: BusinessClaimPaymentApplicationEventRecord | null;
  planEvent: BusinessClaimPaymentApplicationEventRecord | null;
  applicationEvent: BusinessClaimPaymentApplicationEventRecord | null;
  target: {
    targetType: 'entity' | 'location';
    targetId: string;
    entityId: string;
    entityType: string;
    entityUpdatedAt: string;
    locationId: string | null;
    locationUpdatedAt: string | null;
  } | null;
  claims: BusinessClaimPaymentApplicationClaimState[];
  rows: BusinessClaimPaymentApplicationRowState[];
  sourceRecord: {
    id: string;
    sourceId: string;
    externalId: string | null;
    contentHash: string | null;
  } | null;
  verificationEvents: Array<{
    eventId: string;
    claimId: string;
    eventType: string;
    reasonCode: string;
    effectiveAt: string;
    internalNote: string | null;
  }>;
  provenanceLinks: Array<{
    subjectType: string;
    subjectId: string;
    fieldPath: string | null;
    sourceRecordId: string;
    provenanceRole: string;
  }>;
}

export interface BusinessClaimPaymentExpectedClaim {
  claimId: string;
  entityId: string;
  locationId: string | null;
  claimStatus: string;
  routeType: string;
  processorId: string | null;
  expectedClaimUpdatedAt: Date;
  expectedRows: Array<{
    rowId: string;
    assetId: string;
    networkId: string;
    paymentMethodId: string;
    contractAddress: string | null;
    isPrimary: boolean;
  }>;
}

export interface BusinessClaimPaymentSourceRecordCommand {
  id: string;
  sourceId: string;
  externalId: string;
  rawPayload: BusinessClaimPaymentSourcePayload;
  observedAt: Date;
  fetchedAt: Date;
  contentHash: string;
}

export interface BusinessClaimPaymentVerificationCommand {
  eventId: string;
  claimId: string;
  internalNote: string;
}

export interface BusinessClaimPaymentApplicationCommitCommand {
  requestId: string;
  applicationId: string;
  submissionId: string;
  sourceDecisionEventId: string;
  fieldApplicationEventId: string;
  planId: string;
  planCreatedAt: Date;
  planInternalNote: string;
  draftSetHash: string;
  expectedApplicationUpdatedAt: Date;
  target: NonNullable<BusinessClaimPaymentApplicationState['target']>;
  plannedClaims: BusinessClaimPaymentPlannedClaim[];
  expectedExistingClaims: BusinessClaimPaymentExpectedClaim[];
  items: BusinessClaimPaymentPlanItem[];
  finalClaimAssetSets: BusinessClaimPaymentFinalClaimAssetSet[];
  sourceRecord: BusinessClaimPaymentSourceRecordCommand;
  verificationEvents: BusinessClaimPaymentVerificationCommand[];
  actorId: string;
  actorType: 'human' | 'system';
  requestFingerprint: string;
  appliedAt: Date;
}

export interface BusinessClaimPaymentApplicationCommitReceipt {
  state: 'committed' | 'replayed';
  applicationEventId: string;
  planId: string;
  sourceRecordId: string;
  createdClaimIds: string[];
  insertedClaimAssetRowIds: string[];
  alreadyPresentClaimAssetRowIds: string[];
  verificationEventIds: string[];
  appliedAt: string;
}

export interface BusinessClaimPaymentApplicationBackend
  extends SubmissionApplicationLifecycleBackend {
  readApplicationState(
    applicationId: string,
    planId: string,
    applicationEventId: string,
  ): Promise<BusinessClaimPaymentApplicationState | null>;
  commitPaymentApplication(
    command: BusinessClaimPaymentApplicationCommitCommand,
  ): Promise<BusinessClaimPaymentApplicationCommitReceipt>;
}

export class BusinessClaimPaymentApplicationError extends Error {
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
    this.name = 'BusinessClaimPaymentApplicationError';
  }
}

interface ExecutionPlan {
  payload: BusinessClaimPaymentPlanEventPayload;
  sourcePayload: BusinessClaimPaymentSourcePayload;
  createdClaimIds: string[];
  insertedRowIds: string[];
  alreadyPresentRowIds: string[];
  affectedClaimIds: string[];
  expectedExistingClaims: BusinessClaimPaymentExpectedClaim[];
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

function rowGuard(row: BusinessClaimPaymentApplicationRowState) {
  return {
    rowId: row.rowId,
    assetId: row.assetId,
    networkId: row.networkId,
    paymentMethodId: row.paymentMethodId,
    contractAddress: row.contractAddress,
    isPrimary: row.isPrimary,
  };
}

function orderedRows(rows: BusinessClaimPaymentApplicationRowState[]) {
  return [...rows].sort((left, right) => left.rowId.localeCompare(right.rowId));
}

async function rowSetHash(rows: BusinessClaimPaymentApplicationRowState[]): Promise<string> {
  return sha256(orderedRows(rows).map(rowGuard));
}

function tupleKey(item: {
  assetId: string;
  networkId: string;
  paymentMethodId: string;
  contractAddress: string | null;
}) {
  return [
    item.assetId,
    item.networkId,
    item.paymentMethodId,
    item.contractAddress ?? '<null>',
  ].join(':');
}

function itemRowId(item: BusinessClaimPaymentPlanItem): string {
  const id =
    item.operation === 'insert_claim_asset'
      ? item.plannedClaimAssetRowId
      : item.existingClaimAssetRowId;
  if (id === null) {
    throw new BusinessClaimPaymentApplicationError(
      'ineligible',
      'The durable payment plan contains an incomplete Claim Asset operation.',
    );
  }
  return id;
}

function deriveFinalClaimAssetSets(
  payload: BusinessClaimPaymentPlanEventPayload,
  expectedExistingClaims: BusinessClaimPaymentExpectedClaim[],
): BusinessClaimPaymentFinalClaimAssetSet[] {
  const rowIdsByClaim = new Map<string, Set<string>>();
  for (const claim of payload.plannedClaims) {
    rowIdsByClaim.set(claim.claimId, new Set());
  }
  for (const claim of expectedExistingClaims) {
    rowIdsByClaim.set(claim.claimId, new Set(claim.expectedRows.map((row) => row.rowId)));
  }
  for (const item of payload.items) {
    const rowIds = rowIdsByClaim.get(item.targetClaimId) ?? new Set<string>();
    rowIds.add(itemRowId(item));
    rowIdsByClaim.set(item.targetClaimId, rowIds);
  }
  return [...rowIdsByClaim.entries()]
    .map(([claimId, rowIds]) => ({ claimId, rowIds: [...rowIds].sort() }))
    .sort((left, right) => left.claimId.localeCompare(right.claimId));
}

function validateFinalClaimAssetSets(
  payload: BusinessClaimPaymentPlanEventPayload,
  finalSets: BusinessClaimPaymentFinalClaimAssetSet[],
): void {
  const affectedClaimIds = [...new Set(payload.items.map((item) => item.targetClaimId))].sort();
  const finalClaimIds = finalSets.map((item) => item.claimId).sort();
  if (JSON.stringify(affectedClaimIds) !== JSON.stringify(finalClaimIds)) {
    throw new BusinessClaimPaymentApplicationError(
      'conflict',
      'The canonical receipt does not bind every affected Claim to one final payment set.',
    );
  }
  const setByClaim = new Map(finalSets.map((item) => [item.claimId, new Set(item.rowIds)]));
  for (const item of payload.items) {
    if (!setByClaim.get(item.targetClaimId)?.has(itemRowId(item))) {
      throw new BusinessClaimPaymentApplicationError(
        'conflict',
        'The canonical receipt omits a planned Claim Asset row.',
      );
    }
  }
  for (const planned of payload.plannedClaims) {
    const plannedIds = payload.items
      .filter((item) => item.targetClaimId === planned.claimId)
      .map(itemRowId)
      .sort();
    const finalIds = [...(setByClaim.get(planned.claimId) ?? new Set<string>())].sort();
    if (JSON.stringify(plannedIds) !== JSON.stringify(finalIds)) {
      throw new BusinessClaimPaymentApplicationError(
        'conflict',
        'A new candidate Claim receipt contains an unexpected Claim Asset row.',
      );
    }
  }
}

function exactClaim(
  state: BusinessClaimPaymentApplicationState,
  claimId: string,
): BusinessClaimPaymentApplicationClaimState | null {
  return state.claims.find((claim) => claim.claimId === claimId) ?? null;
}

function rowsForClaim(state: BusinessClaimPaymentApplicationState, claimId: string) {
  return state.rows.filter((row) => row.claimId === claimId);
}

function exactRow(
  state: BusinessClaimPaymentApplicationState,
  rowId: string,
): BusinessClaimPaymentApplicationRowState | null {
  return state.rows.find((row) => row.rowId === rowId) ?? null;
}

function assertUnique(values: string[], message: string): void {
  if (new Set(values).size !== values.length) {
    throw new BusinessClaimPaymentApplicationError('ineligible', message);
  }
}

function assertPlanShape(payload: BusinessClaimPaymentPlanEventPayload): void {
  const indexes = payload.items.map((item) => item.submittedIndex);
  if (
    new Set(indexes).size !== indexes.length ||
    indexes.some((value, index) => index > 0 && value <= (indexes[index - 1] as number))
  ) {
    throw new BusinessClaimPaymentApplicationError(
      'ineligible',
      'The durable payment plan does not preserve one strict submitted order.',
    );
  }

  const plannedIds = payload.plannedClaims.map((claim) => claim.claimId);
  const existingIds = payload.existingClaims.map((claim) => claim.claimId);
  assertUnique(plannedIds, 'The durable payment plan contains duplicate candidate Claim IDs.');
  assertUnique(existingIds, 'The durable payment plan contains duplicate existing Claim guards.');
  if (plannedIds.some((id) => existingIds.includes(id))) {
    throw new BusinessClaimPaymentApplicationError(
      'ineligible',
      'The durable payment plan reuses one Claim as both existing and new.',
    );
  }

  const insertedIds = payload.items
    .filter((item) => item.operation === 'insert_claim_asset')
    .map(itemRowId);
  const existingRowIds = payload.items
    .filter((item) => item.operation === 'already_present')
    .map(itemRowId);
  assertUnique(insertedIds, 'The durable payment plan contains duplicate inserted row IDs.');
  assertUnique(existingRowIds, 'The durable payment plan contains duplicate preserved row IDs.');
  if (insertedIds.some((id) => existingRowIds.includes(id))) {
    throw new BusinessClaimPaymentApplicationError(
      'ineligible',
      'The durable payment plan reuses one Claim Asset row ID for two operations.',
    );
  }

  for (const item of payload.items) {
    if (
      (item.targetKind === 'new_candidate_claim' && !plannedIds.includes(item.targetClaimId)) ||
      (item.targetKind === 'existing_claim' && !existingIds.includes(item.targetClaimId))
    ) {
      throw new BusinessClaimPaymentApplicationError(
        'ineligible',
        'The durable payment plan item does not reference its exact Claim owner.',
      );
    }
  }

  for (const claim of payload.plannedClaims) {
    const items = payload.items.filter((item) => item.targetClaimId === claim.claimId);
    if (
      items.length === 0 ||
      items.some(
        (item) =>
          item.targetKind !== 'new_candidate_claim' || item.operation !== 'insert_claim_asset',
      ) ||
      items.filter((item) => item.isPrimary).length !== 1
    ) {
      throw new BusinessClaimPaymentApplicationError(
        'ineligible',
        'Every planned candidate Claim requires inserted rows and exactly one primary row.',
      );
    }
    const tuples = items.map((item) =>
      tupleKey({
        assetId: item.asset.id,
        networkId: item.network.id,
        paymentMethodId: item.paymentMethod.id,
        contractAddress: item.proposal.contractAddress,
      }),
    );
    assertUnique(tuples, 'A planned candidate Claim contains duplicate payment combinations.');
  }
}

function validateTarget(
  state: BusinessClaimPaymentApplicationState,
  payload: BusinessClaimPaymentPlanEventPayload,
): NonNullable<BusinessClaimPaymentApplicationState['target']> {
  const target = state.target;
  if (
    target === null ||
    target.targetType !== payload.target.targetType ||
    target.targetId !== payload.target.targetId ||
    target.entityId !== payload.target.entityId ||
    target.locationId !== payload.target.locationId ||
    target.entityUpdatedAt !== payload.target.expectedEntityUpdatedAt ||
    target.locationUpdatedAt !== payload.target.expectedLocationUpdatedAt ||
    !['merchant', 'online_service'].includes(target.entityType)
  ) {
    throw new BusinessClaimPaymentApplicationError(
      'conflict',
      'The Business Claim canonical target changed after payment planning.',
    );
  }
  return target;
}

async function buildExecution(
  state: BusinessClaimPaymentApplicationState,
  request: BusinessClaimPaymentApplicationRequest,
): Promise<ExecutionPlan> {
  const planEvent = state.planEvent;
  const payload = parseBusinessClaimPaymentPlanEventPayload(planEvent?.internalNote ?? null);
  if (
    state.application.submissionType !== 'claim' ||
    state.application.sourceDecisionKind !== 'business_claim_relationship' ||
    state.application.applicationKind !== 'business_claim_update' ||
    state.application.submissionId !== state.submission.submissionId ||
    state.submission.submissionType !== 'claim' ||
    state.submission.workflowStatus !== 'resolved' ||
    state.submission.resolution !== 'approved' ||
    state.submission.targetType === null ||
    state.submission.targetId === null ||
    state.sourceDecisionEvent === null ||
    state.sourceDecisionEvent.eventId !== state.application.sourceDecisionEventId ||
    state.sourceDecisionEvent.eventId !== request.expectedSourceDecisionEventId ||
    state.sourceDecisionEvent.submissionId !== state.submission.submissionId ||
    state.sourceDecisionEvent.action !== 'business_claim_relationship_approved' ||
    state.sourceDecisionEvent.toStatus !== 'resolved' ||
    state.fieldApplicationEvent === null ||
    state.fieldApplicationEvent.eventId !== request.expectedFieldApplicationEventId ||
    state.fieldApplicationEvent.submissionId !== state.submission.submissionId ||
    state.fieldApplicationEvent.action !== 'business_claim_fields_applied' ||
    planEvent === null ||
    planEvent.eventId !== request.planId ||
    planEvent.submissionId !== state.submission.submissionId ||
    planEvent.fromStatus !== null ||
    planEvent.toStatus !== 'resolved' ||
    planEvent.action !== 'business_claim_payment_plan_prepared' ||
    planEvent.reasonCode !== 'payment_information' ||
    planEvent.createdAt !== request.expectedPlanCreatedAt ||
    payload === null ||
    payload.planId !== request.planId ||
    payload.applicationId !== state.application.applicationId ||
    payload.submissionId !== state.submission.submissionId ||
    payload.sourceDecisionEventId !== request.expectedSourceDecisionEventId ||
    payload.fieldApplicationEventId !== request.expectedFieldApplicationEventId ||
    payload.expectedApplicationUpdatedAt !== request.expectedApplicationUpdatedAt ||
    payload.draftSetHash !== request.expectedDraftSetHash ||
    payload.plannedAt !== request.expectedPlanCreatedAt ||
    payload.target.targetType !== state.submission.targetType ||
    payload.target.targetId !== state.submission.targetId
  ) {
    throw new BusinessClaimPaymentApplicationError(
      'ineligible',
      'The exact durable Business Claim payment plan is not eligible for canonical application.',
    );
  }

  assertPlanShape(payload);
  validateTarget(state, payload);

  const createdClaimIds = payload.plannedClaims.map((claim) => claim.claimId).sort();
  const insertedRowIds = payload.items
    .filter((item) => item.operation === 'insert_claim_asset')
    .map(itemRowId)
    .sort();
  const alreadyPresentRowIds = payload.items
    .filter((item) => item.operation === 'already_present')
    .map(itemRowId)
    .sort();
  const affectedClaimIds = [...new Set(payload.items.map((item) => item.targetClaimId))].sort();

  const expectedExistingClaims: BusinessClaimPaymentExpectedClaim[] = [];
  for (const guard of payload.existingClaims) {
    const claim = exactClaim(state, guard.claimId);
    if (claim === null) {
      if (state.applicationEvent === null) {
        throw new BusinessClaimPaymentApplicationError(
          'conflict',
          'An existing Claim disappeared before payment application.',
        );
      }
      continue;
    }
    const rows = rowsForClaim(state, claim.claimId);
    if (state.applicationEvent === null) {
      if (
        claim.deletedAt !== null ||
        !['candidate', 'confirmed', 'stale'].includes(claim.claimStatus) ||
        claim.updatedAt !== guard.expectedClaimUpdatedAt ||
        rows.length !== guard.rowCount ||
        (await rowSetHash(rows)) !== guard.claimAssetSetHash
      ) {
        throw new BusinessClaimPaymentApplicationError(
          'conflict',
          'An existing Claim or its complete payment row set changed before application.',
        );
      }
      const claimItems = payload.items.filter((item) => item.targetClaimId === claim.claimId);
      if (
        claimItems.some(
          (item) =>
            item.targetKind !== 'existing_claim' ||
            item.proposal.routeType !== claim.routeType ||
            (item.processor?.id ?? null) !== claim.processorId ||
            claim.entityId !== payload.target.entityId ||
            claim.locationId !== payload.target.locationId,
        )
      ) {
        throw new BusinessClaimPaymentApplicationError(
          'conflict',
          'An existing Claim no longer matches the exact planned route and target.',
        );
      }
      const finalRows = [
        ...rows.map((row) => ({
          assetId: row.assetId,
          networkId: row.networkId,
          paymentMethodId: row.paymentMethodId,
          contractAddress: row.contractAddress,
          isPrimary: row.isPrimary,
        })),
        ...claimItems
          .filter((item) => item.operation === 'insert_claim_asset')
          .map((item) => ({
            assetId: item.asset.id,
            networkId: item.network.id,
            paymentMethodId: item.paymentMethod.id,
            contractAddress: item.proposal.contractAddress,
            isPrimary: item.isPrimary,
          })),
      ];
      assertUnique(
        finalRows.map(tupleKey),
        'The final existing Claim payment set would contain duplicate combinations.',
      );
      if (finalRows.filter((row) => row.isPrimary).length > 1) {
        throw new BusinessClaimPaymentApplicationError(
          'ineligible',
          'The final existing Claim payment set would contain multiple primary rows.',
        );
      }
      expectedExistingClaims.push({
        claimId: claim.claimId,
        entityId: claim.entityId,
        locationId: claim.locationId,
        claimStatus: claim.claimStatus,
        routeType: claim.routeType,
        processorId: claim.processorId,
        expectedClaimUpdatedAt: new Date(claim.updatedAt),
        expectedRows: orderedRows(rows).map(rowGuard),
      });
    }
  }

  if (state.applicationEvent === null) {
    if (
      state.application.applicationStatus !== 'pending' ||
      state.application.publicationStatus !== 'blocked' ||
      state.application.applicationReceipt !== null ||
      state.application.updatedAt !== request.expectedApplicationUpdatedAt
    ) {
      throw new BusinessClaimPaymentApplicationError(
        'conflict',
        'The Business Claim application changed before canonical payment application.',
      );
    }
    if (createdClaimIds.some((id) => exactClaim(state, id) !== null)) {
      throw new BusinessClaimPaymentApplicationError(
        'conflict',
        'A planned candidate Claim ID already exists.',
      );
    }
    if (insertedRowIds.some((id) => exactRow(state, id) !== null)) {
      throw new BusinessClaimPaymentApplicationError(
        'conflict',
        'A planned Claim Asset row ID already exists.',
      );
    }
    for (const item of payload.items.filter(
      (candidate) => candidate.operation === 'already_present',
    )) {
      const row = exactRow(state, itemRowId(item));
      if (
        row === null ||
        row.claimId !== item.targetClaimId ||
        row.assetId !== item.asset.id ||
        row.networkId !== item.network.id ||
        row.paymentMethodId !== item.paymentMethod.id ||
        row.contractAddress !== item.proposal.contractAddress ||
        row.isPrimary !== item.isPrimary
      ) {
        throw new BusinessClaimPaymentApplicationError(
          'conflict',
          'An already-present Claim Asset row changed before application.',
        );
      }
    }
  }

  const sourcePayload = businessClaimPaymentSourcePayloadSchema.parse({
    schemaVersion: 'business-claim-payment-source-v1',
    submissionReference: state.submission.publicId,
    planId: payload.planId,
    sourceDecisionEventId: payload.sourceDecisionEventId,
    fieldApplicationEventId: payload.fieldApplicationEventId,
    target: {
      targetType: payload.target.targetType,
      targetId: payload.target.targetId,
      entityId: payload.target.entityId,
      locationId: payload.target.locationId,
    },
    draftSetHash: payload.draftSetHash,
    items: payload.items.map((item) => ({
      submittedIndex: item.submittedIndex,
      proposal: item.proposal,
      operation: item.operation,
      targetKind: item.targetKind,
      targetClaimId: item.targetClaimId,
      claimAssetRowId: itemRowId(item),
      assetId: item.asset.id,
      networkId: item.network.id,
      paymentMethodId: item.paymentMethod.id,
      contractAddress: item.proposal.contractAddress,
      isPrimary: item.isPrimary,
    })),
  });

  return {
    payload,
    sourcePayload,
    createdClaimIds,
    insertedRowIds,
    alreadyPresentRowIds,
    affectedClaimIds,
    expectedExistingClaims,
  };
}

function expectedProvenanceKeys(
  execution: ExecutionPlan,
  sourceRecordId: string,
  verificationEvents: BusinessClaimPaymentVerificationReference[],
) {
  const created = new Set(execution.createdClaimIds);
  const keys = execution.affectedClaimIds.map(
    (claimId) =>
      `acceptance_claim:${claimId}:<null>:${sourceRecordId}:${created.has(claimId) ? 'origin' : 'verification'}`,
  );
  for (const item of execution.payload.items) {
    keys.push(
      `claim_asset:${itemRowId(item)}:<null>:${sourceRecordId}:${item.operation === 'insert_claim_asset' ? 'origin' : 'verification'}`,
    );
  }
  for (const item of verificationEvents) {
    keys.push(
      `verification_event:${item.verificationEventId}:<null>:${sourceRecordId}:verification`,
    );
  }
  return keys.sort();
}

function provenanceKey(link: BusinessClaimPaymentApplicationState['provenanceLinks'][number]) {
  return [
    link.subjectType,
    link.subjectId,
    link.fieldPath ?? '<null>',
    link.sourceRecordId,
    link.provenanceRole,
  ].join(':');
}

async function verifyCanonicalReplayState(
  state: BusinessClaimPaymentApplicationState,
  execution: ExecutionPlan,
  eventPayload: BusinessClaimPaymentApplicationEventPayload,
  sourceId: string,
  sourceRecordId: string,
  sourceContentHash: string,
  verificationEvents: BusinessClaimPaymentVerificationReference[],
): Promise<void> {
  const event = state.applicationEvent;
  if (event === null) {
    throw new BusinessClaimPaymentApplicationError(
      'conflict',
      'The canonical Business Claim payment receipt is missing.',
    );
  }
  const appliedAt = event.createdAt;
  for (const planned of execution.payload.plannedClaims) {
    const claim = exactClaim(state, planned.claimId);
    if (
      claim === null ||
      claim.entityId !== planned.entityId ||
      claim.locationId !== planned.locationId ||
      claim.claimScope !== planned.claimScope ||
      claim.routeType !== planned.routeType ||
      claim.acceptanceScope !== 'all_checkout' ||
      claim.processorId !== planned.processorId ||
      claim.customerPaysCrypto !== true ||
      claim.merchantExplicitlyAcceptsCrypto !== true ||
      claim.claimStatus !== 'candidate' ||
      claim.visibility !== 'hidden' ||
      claim.howToPay !== planned.howToPay ||
      claim.instructionsLanguage !== 'en' ||
      claim.merchantReceives !== 'not_publicly_confirmed' ||
      claim.restrictions !== planned.restrictions ||
      claim.createdAt !== appliedAt ||
      claim.updatedAt !== appliedAt ||
      claim.deletedAt !== null
    ) {
      throw new BusinessClaimPaymentApplicationError(
        'conflict',
        'A created candidate Claim does not match the exact durable plan.',
      );
    }
  }
  for (const guard of execution.payload.existingClaims) {
    const claim = exactClaim(state, guard.claimId);
    const claimItems = execution.payload.items.filter(
      (item) => item.targetClaimId === guard.claimId,
    );
    if (
      claim === null ||
      claim.deletedAt !== null ||
      !['candidate', 'confirmed', 'stale'].includes(claim.claimStatus) ||
      claim.entityId !== execution.payload.target.entityId ||
      claim.locationId !== execution.payload.target.locationId ||
      claim.updatedAt !== appliedAt ||
      claimItems.some(
        (item) =>
          item.targetKind !== 'existing_claim' ||
          item.proposal.routeType !== claim.routeType ||
          (item.processor?.id ?? null) !== claim.processorId,
      )
    ) {
      throw new BusinessClaimPaymentApplicationError(
        'conflict',
        'An affected existing Claim does not match the canonical payment receipt.',
      );
    }
  }
  for (const item of execution.payload.items) {
    const row = exactRow(state, itemRowId(item));
    if (
      row === null ||
      row.claimId !== item.targetClaimId ||
      row.assetId !== item.asset.id ||
      row.networkId !== item.network.id ||
      row.paymentMethodId !== item.paymentMethod.id ||
      row.contractAddress !== item.proposal.contractAddress ||
      row.isPrimary !== item.isPrimary ||
      (item.operation === 'insert_claim_asset' &&
        (row.notes !== null || row.createdAt !== appliedAt || row.updatedAt !== appliedAt))
    ) {
      throw new BusinessClaimPaymentApplicationError(
        'conflict',
        'A canonical Claim Asset row does not match the exact durable plan.',
      );
    }
  }
  for (const finalSet of eventPayload.finalClaimAssetSets) {
    const actualRowIds = rowsForClaim(state, finalSet.claimId)
      .map((row) => row.rowId)
      .sort();
    if (JSON.stringify(actualRowIds) !== JSON.stringify(finalSet.rowIds)) {
      throw new BusinessClaimPaymentApplicationError(
        'conflict',
        'A canonical Claim contains an unexpected or missing Claim Asset row.',
      );
    }
  }
  if (
    state.sourceRecord === null ||
    state.sourceRecord.id !== sourceRecordId ||
    state.sourceRecord.sourceId !== sourceId ||
    state.sourceRecord.externalId !==
      `business-claim-payments:${state.submission.publicId}:${execution.payload.planId}` ||
    state.sourceRecord.contentHash !== sourceContentHash
  ) {
    throw new BusinessClaimPaymentApplicationError(
      'conflict',
      'The Business Claim payment Source Record does not match the canonical receipt.',
    );
  }
  const actualVerification = state.verificationEvents
    .map(
      (item) =>
        `${item.claimId}:${item.eventId}:${item.eventType}:${item.reasonCode}:${item.effectiveAt}`,
    )
    .sort();
  const expectedVerification = verificationEvents
    .map(
      (item) =>
        `${item.claimId}:${item.verificationEventId}:corrected:business_claim_payment_information_applied:${appliedAt}`,
    )
    .sort();
  if (JSON.stringify(actualVerification) !== JSON.stringify(expectedVerification)) {
    throw new BusinessClaimPaymentApplicationError(
      'conflict',
      'The Business Claim payment Verification Events do not match the canonical receipt.',
    );
  }
  const actualProvenance = state.provenanceLinks.map(provenanceKey).sort();
  if (
    JSON.stringify(actualProvenance) !==
    JSON.stringify(expectedProvenanceKeys(execution, sourceRecordId, verificationEvents))
  ) {
    throw new BusinessClaimPaymentApplicationError(
      'conflict',
      'The Business Claim payment provenance does not match the canonical receipt.',
    );
  }
  if (
    eventPayload.createdClaimIds.join(',') !== execution.createdClaimIds.join(',') ||
    eventPayload.insertedClaimAssetRowIds.join(',') !== execution.insertedRowIds.join(',') ||
    eventPayload.alreadyPresentClaimAssetRowIds.join(',') !==
      execution.alreadyPresentRowIds.join(',') ||
    JSON.stringify(eventPayload.verificationEvents) !== JSON.stringify(verificationEvents)
  ) {
    throw new BusinessClaimPaymentApplicationError(
      'conflict',
      'The canonical Business Claim payment receipt contains different applied identities.',
    );
  }
}

function canonicalReceiptFromEvent(
  state: 'replayed',
  event: BusinessClaimPaymentApplicationEventRecord,
  payload: BusinessClaimPaymentApplicationEventPayload,
): BusinessClaimPaymentApplicationCommitReceipt {
  return {
    state,
    applicationEventId: event.eventId,
    planId: payload.planId,
    sourceRecordId: payload.sourceRecordId,
    createdClaimIds: payload.createdClaimIds,
    insertedClaimAssetRowIds: payload.insertedClaimAssetRowIds,
    alreadyPresentClaimAssetRowIds: payload.alreadyPresentClaimAssetRowIds,
    verificationEventIds: payload.verificationEvents.map((item) => item.verificationEventId),
    appliedAt: event.createdAt,
  };
}

function alreadyAppliedReceipt(
  state: BusinessClaimPaymentApplicationState,
  payload: BusinessClaimPaymentApplicationEventPayload,
): BusinessClaimPaymentApplicationReceipt {
  if (
    state.applicationEvent === null ||
    state.application.applicationStatus !== 'committed' ||
    state.application.publicationStatus === 'blocked' ||
    state.application.applicationReceipt?.kind !== 'submission_event' ||
    state.application.applicationReceipt.ids.length !== 1 ||
    state.application.applicationReceipt.ids[0] !== state.applicationEvent.eventId
  ) {
    throw new BusinessClaimPaymentApplicationError(
      'conflict',
      'The committed Business Claim payment application is not bound to its exact receipt.',
    );
  }
  return businessClaimPaymentApplicationReceiptSchema.parse({
    state: 'already_applied',
    applicationId: state.application.applicationId,
    submissionId: state.application.submissionId,
    planId: payload.planId,
    applicationEventId: state.applicationEvent.eventId,
    sourceRecordId: payload.sourceRecordId,
    createdClaimIds: payload.createdClaimIds,
    insertedClaimAssetRowIds: payload.insertedClaimAssetRowIds,
    alreadyPresentClaimAssetRowIds: payload.alreadyPresentClaimAssetRowIds,
    verificationEventIds: payload.verificationEvents.map((item) => item.verificationEventId),
    applicationStatus: 'committed',
    publicationStatus: state.application.publicationStatus,
    transitionEventId: null,
    appliedAt: state.applicationEvent.createdAt,
  });
}

async function readStateAndReplay(
  backend: BusinessClaimPaymentApplicationBackend,
  applicationId: string,
  request: BusinessClaimPaymentApplicationRequest,
): Promise<{
  state: BusinessClaimPaymentApplicationState;
  transitionReplay: SubmissionApplicationTransitionReplayRecord | null;
}> {
  try {
    const [state, transitionReplay] = await Promise.all([
      backend.readApplicationState(applicationId, request.planId, request.requestId),
      backend.readTransition(request.requestId),
    ]);
    if (state === null) {
      throw new BusinessClaimPaymentApplicationError(
        'not_found',
        'The Business Claim payment application was not found.',
      );
    }
    return { state, transitionReplay };
  } catch (error) {
    if (error instanceof BusinessClaimPaymentApplicationError) throw error;
    throw new BusinessClaimPaymentApplicationError(
      'backend_failure',
      'The Business Claim payment application state could not be loaded.',
      { cause: error },
    );
  }
}

function mapCanonicalCommitError(error: unknown): never {
  if (error !== null && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'idempotency_conflict') {
      throw new BusinessClaimPaymentApplicationError(
        'idempotency_conflict',
        'The Business Claim payment application UUID was reused for different content.',
        { cause: error },
      );
    }
    if (code === 'conflict') {
      throw new BusinessClaimPaymentApplicationError(
        'conflict',
        'The application, plan, target, registries, Claims, or Claim Assets changed before commit.',
        { cause: error },
      );
    }
  }
  throw new BusinessClaimPaymentApplicationError(
    'backend_failure',
    'The Business Claim payment plan could not be applied.',
    { cause: error },
  );
}

function mapLifecycleError(error: unknown): never {
  if (error !== null && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'idempotency_conflict') {
      throw new BusinessClaimPaymentApplicationError(
        'idempotency_conflict',
        'The Business Claim payment lifecycle UUID was reused for different content.',
        { cause: error },
      );
    }
    if (code === 'conflict') {
      throw new BusinessClaimPaymentApplicationError(
        'conflict',
        'The application lifecycle changed after canonical payment application committed.',
        { cause: error },
      );
    }
  }
  throw new BusinessClaimPaymentApplicationError(
    'backend_failure',
    'Canonical Business Claim payments committed but the application receipt was not recorded.',
    { cause: error },
  );
}

export async function applyBusinessClaimPaymentApplication(
  context: BusinessClaimPaymentApplicationContext,
  backend: BusinessClaimPaymentApplicationBackend,
  applicationId: string,
  sourceId: string,
  rawRequest: unknown,
  appliedAt = new Date(),
): Promise<BusinessClaimPaymentApplicationReceipt> {
  if (!context.capabilities.includes('submission:business-claim-payments:apply')) {
    throw new BusinessClaimPaymentApplicationError(
      'unauthorized',
      'The actor is not authorized to apply Business Claim payments.',
    );
  }
  const applicationIdResult = z.uuid().safeParse(applicationId);
  const sourceIdResult = z.uuid().safeParse(sourceId);
  const requestResult = businessClaimPaymentApplicationRequestSchema.safeParse(rawRequest);
  if (
    !applicationIdResult.success ||
    !sourceIdResult.success ||
    !requestResult.success ||
    Number.isNaN(appliedAt.getTime())
  ) {
    throw new BusinessClaimPaymentApplicationError(
      'invalid_request',
      'The Business Claim payment application request is invalid.',
    );
  }

  const request = requestResult.data;
  const { state, transitionReplay } = await readStateAndReplay(
    backend,
    applicationIdResult.data,
    request,
  );
  const execution = await buildExecution(state, request);
  const sourceRecordId = await deterministicUuid(
    `business-claim-payment-source:${state.application.applicationId}:${execution.payload.planId}`,
  );
  const verificationEvents: BusinessClaimPaymentVerificationReference[] = await Promise.all(
    execution.affectedClaimIds.map(async (claimId) => ({
      claimId,
      verificationEventId: await deterministicUuid(
        `business-claim-payment-verification:${request.requestId}:${claimId}`,
      ),
    })),
  );
  const sourceContentHash = await sha256(execution.sourcePayload);
  const eventPayload = parseBusinessClaimPaymentApplicationEventPayload(
    state.applicationEvent?.internalNote ?? null,
  );
  const finalClaimAssetSets =
    eventPayload?.finalClaimAssetSets ??
    deriveFinalClaimAssetSets(execution.payload, execution.expectedExistingClaims);
  validateFinalClaimAssetSets(execution.payload, finalClaimAssetSets);
  const requestFingerprint = await sha256({
    schemaVersion: 'business-claim-payment-application-command-v1',
    request,
    actorId: context.actorId,
    applicationId: state.application.applicationId,
    submissionId: state.application.submissionId,
    sourceId: sourceIdResult.data,
    sourceRecordId,
    plan: execution.payload,
    finalClaimAssetSets,
    verificationEvents,
  });
  if (state.applicationEvent !== null) {
    if (
      eventPayload === null ||
      state.applicationEvent.eventId !== request.requestId ||
      state.applicationEvent.submissionId !== state.submission.submissionId ||
      state.applicationEvent.fromStatus !== null ||
      state.applicationEvent.toStatus !== 'resolved' ||
      state.applicationEvent.action !== 'business_claim_payments_applied' ||
      state.applicationEvent.reasonCode !== 'business_claim_payment_information_applied' ||
      state.applicationEvent.actorId !== context.actorId ||
      state.applicationEvent.actorType !==
        (context.actorType === 'human' ? 'reviewer' : 'system') ||
      eventPayload.requestFingerprint !== requestFingerprint ||
      eventPayload.applicationId !== state.application.applicationId ||
      eventPayload.planId !== execution.payload.planId ||
      eventPayload.sourceDecisionEventId !== execution.payload.sourceDecisionEventId ||
      eventPayload.fieldApplicationEventId !== execution.payload.fieldApplicationEventId ||
      eventPayload.sourceRecordId !== sourceRecordId ||
      eventPayload.draftSetHash !== execution.payload.draftSetHash ||
      eventPayload.expectedApplicationUpdatedAt !== request.expectedApplicationUpdatedAt ||
      eventPayload.expectedPlanCreatedAt !== request.expectedPlanCreatedAt ||
      eventPayload.appliedAt !== state.applicationEvent.createdAt
    ) {
      throw new BusinessClaimPaymentApplicationError(
        'idempotency_conflict',
        'The Business Claim payment application UUID was already used for different content.',
      );
    }
    await verifyCanonicalReplayState(
      state,
      execution,
      eventPayload,
      sourceIdResult.data,
      sourceRecordId,
      sourceContentHash,
      verificationEvents,
    );
    if (state.application.applicationStatus === 'committed') {
      return alreadyAppliedReceipt(state, eventPayload);
    }
  } else if (
    transitionReplay === null &&
    (state.application.applicationStatus !== 'pending' ||
      state.application.publicationStatus !== 'blocked' ||
      state.application.updatedAt !== request.expectedApplicationUpdatedAt)
  ) {
    throw new BusinessClaimPaymentApplicationError(
      'conflict',
      'The Business Claim application changed before canonical payment application.',
    );
  }

  let canonicalReceipt: BusinessClaimPaymentApplicationCommitReceipt;
  if (state.applicationEvent !== null && eventPayload !== null) {
    canonicalReceipt = canonicalReceiptFromEvent('replayed', state.applicationEvent, eventPayload);
  } else {
    try {
      canonicalReceipt = await backend.commitPaymentApplication({
        requestId: request.requestId,
        applicationId: state.application.applicationId,
        submissionId: state.application.submissionId,
        sourceDecisionEventId: execution.payload.sourceDecisionEventId,
        fieldApplicationEventId: execution.payload.fieldApplicationEventId,
        planId: execution.payload.planId,
        planCreatedAt: new Date(execution.payload.plannedAt),
        planInternalNote: JSON.stringify(execution.payload),
        draftSetHash: execution.payload.draftSetHash,
        expectedApplicationUpdatedAt: new Date(request.expectedApplicationUpdatedAt),
        target: state.target as NonNullable<BusinessClaimPaymentApplicationState['target']>,
        plannedClaims: execution.payload.plannedClaims,
        expectedExistingClaims: execution.expectedExistingClaims,
        items: execution.payload.items,
        finalClaimAssetSets,
        sourceRecord: {
          id: sourceRecordId,
          sourceId: sourceIdResult.data,
          externalId: `business-claim-payments:${state.submission.publicId}:${execution.payload.planId}`,
          rawPayload: execution.sourcePayload,
          observedAt: new Date(state.fieldApplicationEvent?.createdAt ?? appliedAt),
          fetchedAt: appliedAt,
          contentHash: sourceContentHash,
        },
        verificationEvents: verificationEvents.map((item) => ({
          eventId: item.verificationEventId,
          claimId: item.claimId,
          internalNote: `Applied approved Business Claim payment information from plan ${execution.payload.planId}.`,
        })),
        actorId: context.actorId,
        actorType: context.actorType,
        requestFingerprint,
        appliedAt,
      });
    } catch (error) {
      if (error instanceof SubmissionPersistenceError) mapCanonicalCommitError(error);
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
        receipt: { kind: 'submission_event', ids: [canonicalReceipt.applicationEventId] },
      },
      appliedAt,
    );
    return businessClaimPaymentApplicationReceiptSchema.parse({
      state: transition.state,
      applicationId: transition.applicationId,
      submissionId: state.application.submissionId,
      planId: canonicalReceipt.planId,
      applicationEventId: canonicalReceipt.applicationEventId,
      sourceRecordId: canonicalReceipt.sourceRecordId,
      createdClaimIds: canonicalReceipt.createdClaimIds,
      insertedClaimAssetRowIds: canonicalReceipt.insertedClaimAssetRowIds,
      alreadyPresentClaimAssetRowIds: canonicalReceipt.alreadyPresentClaimAssetRowIds,
      verificationEventIds: canonicalReceipt.verificationEventIds,
      applicationStatus: 'committed',
      publicationStatus: transition.toPublicationStatus,
      transitionEventId: transition.transitionEventId,
      appliedAt: transition.changedAt,
    });
  } catch (error) {
    mapLifecycleError(error);
  }
}
