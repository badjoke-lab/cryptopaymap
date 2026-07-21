import { z } from 'zod';
import { parseBusinessClaimFieldApplicationEventPayload } from '../../submissions/business-claim-field-application-persistence-contract';
import {
  businessClaimFieldProvenanceReceiptSchema,
  businessClaimFieldProvenanceRequestSchema,
  businessClaimFieldProvenanceSourcePayloadSchema,
  parseBusinessClaimFieldProvenanceEventPayload,
  type BusinessClaimFieldProvenanceEventPayload,
  type BusinessClaimFieldProvenanceReceipt,
  type BusinessClaimFieldProvenanceRequest,
  type BusinessClaimFieldProvenanceSourcePayload,
} from '../../submissions/business-claim-field-provenance-contract';
import { SubmissionPersistenceError } from '../../submissions/persistence';

export interface BusinessClaimFieldProvenanceContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:business-claim-field-provenance:complete'];
}

export interface BusinessClaimFieldProvenanceEventRecord {
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

export interface BusinessClaimFieldProvenanceLinkState {
  linkId: string;
  subjectType: string;
  subjectId: string;
  fieldPath: string | null;
  sourceRecordId: string;
  provenanceRole: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export interface BusinessClaimFieldProvenanceState {
  submission: {
    submissionId: string;
    publicId: string;
    submissionType: string;
    targetType: string | null;
    targetId: string | null;
    workflowStatus: string;
    resolution: string | null;
  };
  fieldApplicationEvent: BusinessClaimFieldProvenanceEventRecord | null;
  requestEvent: BusinessClaimFieldProvenanceEventRecord | null;
  completionEvent: BusinessClaimFieldProvenanceEventRecord | null;
  target: {
    targetType: 'entity' | 'location';
    targetId: string;
    updatedAt: string;
    deletedAt: string | null;
    value: Record<string, unknown>;
  } | null;
  sourceRecord: {
    sourceRecordId: string;
    sourceId: string;
    externalId: string | null;
    contentHash: string | null;
  } | null;
  provenanceLinks: BusinessClaimFieldProvenanceLinkState[];
}

export interface BusinessClaimFieldProvenanceSourceRecordCommand {
  id: string;
  sourceId: string;
  externalId: string;
  rawPayload: BusinessClaimFieldProvenanceSourcePayload;
  observedAt: Date;
  fetchedAt: Date;
  contentHash: string;
}

export interface BusinessClaimFieldProvenanceCommitCommand {
  requestId: string;
  submissionId: string;
  fieldApplicationEventId: string;
  fieldApplicationInternalNote: string;
  relationshipDecisionId: string;
  targetType: 'entity' | 'location';
  targetId: string;
  expectedTargetUpdatedAt: Date;
  fieldPaths: string[];
  expectedOpenProvenance: BusinessClaimFieldProvenanceLinkState[];
  sourceRecord: BusinessClaimFieldProvenanceSourceRecordCommand;
  actorId: string;
  actorType: 'human' | 'system';
  requestFingerprint: string;
  fieldAppliedAt: Date;
  completedAt: Date;
}

export interface BusinessClaimFieldProvenanceCommitReceipt {
  state: 'committed' | 'replayed';
  completionEventId: string;
  sourceRecordId: string;
  completedAt: string;
}

export interface BusinessClaimFieldProvenanceBackend {
  readState(
    submissionId: string,
    fieldApplicationEventId: string,
    requestId: string,
    sourceRecordId: string,
  ): Promise<BusinessClaimFieldProvenanceState | null>;
  commitFieldProvenance(
    command: BusinessClaimFieldProvenanceCommitCommand,
  ): Promise<BusinessClaimFieldProvenanceCommitReceipt>;
}

export class BusinessClaimFieldProvenanceError extends Error {
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
    this.name = 'BusinessClaimFieldProvenanceError';
  }
}

interface FieldPlan {
  fieldPath: string;
  beforeValue: unknown;
  appliedValue: unknown;
}

interface CompletionPlan {
  request: BusinessClaimFieldProvenanceRequest;
  submissionId: string;
  publicId: string;
  fieldApplicationEventId: string;
  fieldApplicationInternalNote: string;
  relationshipDecisionId: string;
  targetType: 'entity' | 'location';
  targetId: string;
  fieldAppliedAt: string;
  fields: FieldPlan[];
  sourcePayload: BusinessClaimFieldProvenanceSourcePayload;
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

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
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

function orderedLinks(links: BusinessClaimFieldProvenanceLinkState[]) {
  return [...links].sort((left, right) => left.linkId.localeCompare(right.linkId));
}

function buildPlan(
  state: BusinessClaimFieldProvenanceState,
  request: BusinessClaimFieldProvenanceRequest,
): CompletionPlan {
  const event = state.fieldApplicationEvent;
  const payload = parseBusinessClaimFieldApplicationEventPayload(event?.internalNote ?? null);
  if (
    state.submission.submissionType !== 'claim' ||
    state.submission.workflowStatus !== 'resolved' ||
    state.submission.resolution !== 'approved' ||
    event === null ||
    event.eventId !== request.expectedFieldApplicationEventId ||
    event.submissionId !== state.submission.submissionId ||
    event.fromStatus !== null ||
    event.toStatus !== 'resolved' ||
    event.action !== 'business_claim_fields_applied' ||
    event.reasonCode !== 'field_decisions_committed' ||
    payload === null ||
    payload.projection.submissionId !== state.submission.submissionId ||
    payload.projection.requestId !== event.eventId ||
    payload.projection.targetType !== state.submission.targetType ||
    payload.projection.targetId !== state.submission.targetId ||
    payload.appliedAt !== event.createdAt
  ) {
    throw new BusinessClaimFieldProvenanceError(
      'ineligible',
      'The durable Business Claim field application is not eligible for provenance completion.',
    );
  }

  const targetType = payload.projection.targetType;
  const application =
    targetType === 'entity'
      ? payload.projection.entityApplication
      : payload.projection.locationApplication;
  const otherApplication =
    targetType === 'entity'
      ? payload.projection.locationApplication
      : payload.projection.entityApplication;
  if (
    application === null ||
    otherApplication !== null ||
    application.acceptedFields.length === 0 ||
    state.target === null ||
    state.target.targetType !== targetType ||
    state.target.targetId !== payload.projection.targetId ||
    state.target.deletedAt !== null ||
    state.target.updatedAt !== request.expectedTargetUpdatedAt
  ) {
    throw new BusinessClaimFieldProvenanceError(
      'ineligible',
      'The canonical target does not match the exact H2 field application.',
    );
  }

  const beforeValues = application.before as unknown as Record<string, unknown>;
  const afterValues = application.after as unknown as Record<string, unknown>;
  const fields = [...application.acceptedFields]
    .sort((left, right) => left.localeCompare(right))
    .map((fieldPath) => ({
      fieldPath,
      beforeValue: beforeValues[fieldPath],
      appliedValue: afterValues[fieldPath],
    }));
  for (const field of fields) {
    if (!sameValue(state.target.value[field.fieldPath], field.appliedValue)) {
      throw new BusinessClaimFieldProvenanceError(
        'conflict',
        'An H2-applied canonical field no longer has the exact applied value.',
      );
    }
  }

  const sourcePayload = businessClaimFieldProvenanceSourcePayloadSchema.parse({
    schemaVersion: 'business-claim-field-provenance-source-v1',
    submissionReference: state.submission.publicId,
    fieldApplicationEventId: event.eventId,
    relationshipDecisionId: payload.projection.relationshipDecisionId,
    target: { targetType, targetId: payload.projection.targetId },
    fields,
    fieldAppliedAt: payload.appliedAt,
  });

  return {
    request,
    submissionId: state.submission.submissionId,
    publicId: state.submission.publicId,
    fieldApplicationEventId: event.eventId,
    fieldApplicationInternalNote: event.internalNote as string,
    relationshipDecisionId: payload.projection.relationshipDecisionId,
    targetType,
    targetId: payload.projection.targetId,
    fieldAppliedAt: payload.appliedAt,
    fields,
    sourcePayload,
  };
}

function receiptFromEvent(
  state: 'committed' | 'replayed',
  event: BusinessClaimFieldProvenanceEventRecord,
  payload: BusinessClaimFieldProvenanceEventPayload,
): BusinessClaimFieldProvenanceReceipt {
  return businessClaimFieldProvenanceReceiptSchema.parse({
    state,
    submissionId: payload.submissionId,
    requestId: event.eventId,
    fieldApplicationEventId: payload.fieldApplicationEventId,
    sourceRecordId: payload.sourceRecordId,
    targetType: payload.target.targetType,
    targetId: payload.target.targetId,
    fieldPaths: payload.fieldPaths,
    completedAt: payload.completedAt,
  });
}

function verifyReplay(
  context: BusinessClaimFieldProvenanceContext,
  state: BusinessClaimFieldProvenanceState,
  plan: CompletionPlan,
  sourceId: string,
  sourceRecordId: string,
  sourceContentHash: string,
  requestFingerprint: string,
): BusinessClaimFieldProvenanceReceipt {
  const event = state.requestEvent;
  const payload = parseBusinessClaimFieldProvenanceEventPayload(event?.internalNote ?? null);
  const expectedPaths = plan.fields.map((field) => field.fieldPath);
  if (
    event === null ||
    event.eventId !== plan.request.requestId ||
    event.submissionId !== plan.submissionId ||
    event.fromStatus !== null ||
    event.toStatus !== 'resolved' ||
    event.action !== 'business_claim_field_provenance_completed' ||
    event.reasonCode !== 'field_provenance_completed' ||
    event.actorId !== context.actorId ||
    event.actorType !== (context.actorType === 'human' ? 'reviewer' : 'system') ||
    payload === null ||
    payload.requestFingerprint !== requestFingerprint ||
    payload.submissionId !== plan.submissionId ||
    payload.fieldApplicationEventId !== plan.fieldApplicationEventId ||
    payload.relationshipDecisionId !== plan.relationshipDecisionId ||
    payload.sourceRecordId !== sourceRecordId ||
    payload.target.targetType !== plan.targetType ||
    payload.target.targetId !== plan.targetId ||
    JSON.stringify(payload.fieldPaths) !== JSON.stringify(expectedPaths) ||
    payload.expectedTargetUpdatedAt !== plan.request.expectedTargetUpdatedAt ||
    payload.fieldAppliedAt !== plan.fieldAppliedAt ||
    payload.completedAt !== event.createdAt ||
    state.sourceRecord === null ||
    state.sourceRecord.sourceRecordId !== sourceRecordId ||
    state.sourceRecord.sourceId !== sourceId ||
    state.sourceRecord.externalId !==
      `business-claim-fields:${plan.publicId}:${plan.fieldApplicationEventId}` ||
    state.sourceRecord.contentHash !== sourceContentHash
  ) {
    throw new BusinessClaimFieldProvenanceError(
      'idempotency_conflict',
      'The field provenance request UUID was already used for different content.',
    );
  }

  for (const fieldPath of expectedPaths) {
    const matching = state.provenanceLinks.filter(
      (link) =>
        link.subjectType === plan.targetType &&
        link.subjectId === plan.targetId &&
        link.fieldPath === fieldPath &&
        link.sourceRecordId === sourceRecordId &&
        link.provenanceRole === 'correction' &&
        link.effectiveFrom === plan.fieldAppliedAt,
    );
    if (matching.length !== 1) {
      throw new BusinessClaimFieldProvenanceError(
        'conflict',
        'The durable field provenance receipt is missing an exact provenance link.',
      );
    }
  }
  return receiptFromEvent('replayed', event, payload);
}

function mapCommitError(error: unknown): never {
  if (error instanceof SubmissionPersistenceError) {
    if (error.code === 'conflict') {
      throw new BusinessClaimFieldProvenanceError(
        'conflict',
        'The H2 event, target, source, or provenance set changed before commit.',
        { cause: error },
      );
    }
  }
  throw new BusinessClaimFieldProvenanceError(
    'backend_failure',
    'The Business Claim field provenance could not be completed.',
    { cause: error },
  );
}

export async function completeBusinessClaimFieldProvenance(
  context: BusinessClaimFieldProvenanceContext,
  backend: BusinessClaimFieldProvenanceBackend,
  submissionId: string,
  sourceId: string,
  rawRequest: unknown,
  completedAt = new Date(),
): Promise<BusinessClaimFieldProvenanceReceipt> {
  if (!context.capabilities.includes('submission:business-claim-field-provenance:complete')) {
    throw new BusinessClaimFieldProvenanceError(
      'unauthorized',
      'The actor is not authorized to complete Business Claim field provenance.',
    );
  }
  const submissionIdResult = z.uuid().safeParse(submissionId);
  const sourceIdResult = z.uuid().safeParse(sourceId);
  const requestResult = businessClaimFieldProvenanceRequestSchema.safeParse(rawRequest);
  if (
    !submissionIdResult.success ||
    !sourceIdResult.success ||
    !requestResult.success ||
    Number.isNaN(completedAt.getTime())
  ) {
    throw new BusinessClaimFieldProvenanceError(
      'invalid_request',
      'The Business Claim field provenance request is invalid.',
    );
  }
  const request = requestResult.data;
  const sourceRecordId = await deterministicUuid(
    `business-claim-field-provenance-source:${request.expectedFieldApplicationEventId}`,
  );

  let state: BusinessClaimFieldProvenanceState | null;
  try {
    state = await backend.readState(
      submissionIdResult.data,
      request.expectedFieldApplicationEventId,
      request.requestId,
      sourceRecordId,
    );
  } catch (error) {
    throw new BusinessClaimFieldProvenanceError(
      'backend_failure',
      'The Business Claim field provenance state could not be loaded.',
      { cause: error },
    );
  }
  if (state === null) {
    throw new BusinessClaimFieldProvenanceError(
      'not_found',
      'The Business Claim field application was not found.',
    );
  }

  const plan = buildPlan(state, request);
  const sourceContentHash = await sha256(plan.sourcePayload);
  const requestFingerprint = await sha256({
    schemaVersion: 'business-claim-field-provenance-command-v1',
    request,
    actorId: context.actorId,
    actorType: context.actorType,
    sourceId: sourceIdResult.data,
    sourceRecordId,
    sourcePayload: plan.sourcePayload,
  });

  if (state.requestEvent !== null) {
    return verifyReplay(
      context,
      state,
      plan,
      sourceIdResult.data,
      sourceRecordId,
      sourceContentHash,
      requestFingerprint,
    );
  }
  if (state.completionEvent !== null) {
    throw new BusinessClaimFieldProvenanceError(
      'conflict',
      'The H2 field application already has a provenance completion receipt.',
    );
  }
  if (state.sourceRecord !== null) {
    throw new BusinessClaimFieldProvenanceError(
      'conflict',
      'The deterministic field provenance Source Record already exists without its receipt.',
    );
  }

  const fieldPaths = plan.fields.map((field) => field.fieldPath);
  const openLinks = orderedLinks(
    state.provenanceLinks.filter(
      (link) =>
        link.fieldPath !== null && fieldPaths.includes(link.fieldPath) && link.effectiveTo === null,
    ),
  );
  if (openLinks.some((link) => link.provenanceRole === 'correction')) {
    throw new BusinessClaimFieldProvenanceError(
      'conflict',
      'A current correction provenance owner already exists for an H2-applied field.',
    );
  }
  const fieldAppliedTime = new Date(plan.fieldAppliedAt).getTime();
  if (
    openLinks.some(
      (link) =>
        link.effectiveFrom !== null && new Date(link.effectiveFrom).getTime() > fieldAppliedTime,
    )
  ) {
    throw new BusinessClaimFieldProvenanceError(
      'conflict',
      'A current provenance link starts after the H2 field application.',
    );
  }

  let commitReceipt: BusinessClaimFieldProvenanceCommitReceipt;
  try {
    commitReceipt = await backend.commitFieldProvenance({
      requestId: request.requestId,
      submissionId: plan.submissionId,
      fieldApplicationEventId: plan.fieldApplicationEventId,
      fieldApplicationInternalNote: plan.fieldApplicationInternalNote,
      relationshipDecisionId: plan.relationshipDecisionId,
      targetType: plan.targetType,
      targetId: plan.targetId,
      expectedTargetUpdatedAt: new Date(request.expectedTargetUpdatedAt),
      fieldPaths,
      expectedOpenProvenance: openLinks,
      sourceRecord: {
        id: sourceRecordId,
        sourceId: sourceIdResult.data,
        externalId: `business-claim-fields:${plan.publicId}:${plan.fieldApplicationEventId}`,
        rawPayload: plan.sourcePayload,
        observedAt: new Date(plan.fieldAppliedAt),
        fetchedAt: completedAt,
        contentHash: sourceContentHash,
      },
      actorId: context.actorId,
      actorType: context.actorType,
      requestFingerprint,
      fieldAppliedAt: new Date(plan.fieldAppliedAt),
      completedAt,
    });
  } catch (error) {
    mapCommitError(error);
  }

  return businessClaimFieldProvenanceReceiptSchema.parse({
    state: commitReceipt.state,
    submissionId: plan.submissionId,
    requestId: commitReceipt.completionEventId,
    fieldApplicationEventId: plan.fieldApplicationEventId,
    sourceRecordId: commitReceipt.sourceRecordId,
    targetType: plan.targetType,
    targetId: plan.targetId,
    fieldPaths,
    completedAt: commitReceipt.completedAt,
  });
}
