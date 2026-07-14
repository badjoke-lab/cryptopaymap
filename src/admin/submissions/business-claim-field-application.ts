import { z } from 'zod';
import {
  businessClaimEntityFieldSchema,
  businessClaimLocationFieldSchema,
  type BusinessClaimReviewProjection,
} from '../../submissions/business-claim-contract';
import { parseBusinessClaimRelationshipDecisionEventPayload } from '../../submissions/business-claim-relationship-decision-contract';
import { businessClaimReviewProjectionSchema } from '../../submissions/business-claim-target-context';
import { suggestPaymentProposalSchema } from '../../submissions/suggest-contract';
import {
  canonicalEntitySchema,
  canonicalLocationSchema,
  type CanonicalEntityInput,
  type CanonicalLocationInput,
} from '../../schemas/canonical-identity';
import type { BusinessClaimFieldApplicationContext } from './business-claim-field-application-authorization';

const timestampSchema = z.iso.datetime({ offset: true });

function uniqueArray<T extends z.ZodType>(itemSchema: T, maximum: number) {
  return z
    .array(itemSchema)
    .max(maximum)
    .superRefine((values, context) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: 'custom', message: 'Decision values must be unique.' });
      }
    });
}

const entityFieldsSchema = uniqueArray(businessClaimEntityFieldSchema, 4);
const locationFieldsSchema = uniqueArray(businessClaimLocationFieldSchema, 14);
const paymentIndexesSchema = uniqueArray(z.number().int().min(0).max(19), 20);

export const businessClaimEntityFieldDecisionSchema = z
  .object({
    acceptedFields: entityFieldsSchema,
    rejectedFields: entityFieldsSchema,
  })
  .strict();

export const businessClaimLocationFieldDecisionSchema = z
  .object({
    acceptedFields: locationFieldsSchema,
    rejectedFields: locationFieldsSchema,
  })
  .strict();

export const businessClaimPaymentProposalDecisionSchema = z
  .object({
    acceptedIndexes: paymentIndexesSchema,
    rejectedIndexes: paymentIndexesSchema,
  })
  .strict();

export const businessClaimFieldApplicationRequestSchema = z
  .object({
    schemaVersion: z.literal('business-claim-field-application-v1'),
    requestId: z.uuid(),
    expectedSubmissionUpdatedAt: timestampSchema,
    expectedRelationshipDecisionId: z.uuid(),
    expectedEntityUpdatedAt: timestampSchema.nullable(),
    expectedLocationUpdatedAt: timestampSchema.nullable(),
    entityDecision: businessClaimEntityFieldDecisionSchema.nullable(),
    locationDecision: businessClaimLocationFieldDecisionSchema.nullable(),
    paymentDecision: businessClaimPaymentProposalDecisionSchema.nullable(),
  })
  .strict();

const entityApplicationSchema = z
  .object({
    expectedUpdatedAt: timestampSchema,
    acceptedFields: entityFieldsSchema,
    rejectedFields: entityFieldsSchema,
    before: canonicalEntitySchema,
    after: canonicalEntitySchema,
  })
  .strict();

const locationApplicationSchema = z
  .object({
    expectedUpdatedAt: timestampSchema,
    acceptedFields: locationFieldsSchema,
    rejectedFields: locationFieldsSchema,
    before: canonicalLocationSchema,
    after: canonicalLocationSchema,
  })
  .strict();

const paymentApplicationSchema = z
  .object({
    acceptedIndexes: paymentIndexesSchema,
    rejectedIndexes: paymentIndexesSchema,
    acceptedProposals: z.array(suggestPaymentProposalSchema).max(20),
  })
  .strict();

export const businessClaimFieldApplicationProjectionSchema = z
  .object({
    schemaVersion: z.literal('business-claim-field-application-projection-v1'),
    requestId: z.uuid(),
    requestFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    submissionId: z.uuid(),
    relationshipDecisionId: z.uuid(),
    targetType: z.enum(['entity', 'location']),
    targetId: z.uuid(),
    entityApplication: entityApplicationSchema.nullable(),
    locationApplication: locationApplicationSchema.nullable(),
    paymentApplication: paymentApplicationSchema.nullable(),
    hasAcceptedChanges: z.boolean(),
    generatedAt: timestampSchema,
  })
  .strict();

export type BusinessClaimFieldApplicationRequest = z.infer<
  typeof businessClaimFieldApplicationRequestSchema
>;
export type BusinessClaimFieldApplicationProjection = z.infer<
  typeof businessClaimFieldApplicationProjectionSchema
>;

export interface BusinessClaimFieldApplicationEventRecord {
  eventId: string;
  submissionId: string;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  reasonCode: string | null;
  internalNote: string | null;
  createdAt: string;
}

export interface BusinessClaimCanonicalEntityState {
  id: string;
  updatedAt: string;
  value: unknown;
}

export interface BusinessClaimCanonicalLocationState {
  id: string;
  updatedAt: string;
  value: unknown;
}

export interface BusinessClaimFieldApplicationState {
  submissionId: string;
  submissionType: string;
  workflowStatus: string;
  resolution: string | null;
  updatedAt: string;
  targetType: string | null;
  targetId: string | null;
  normalizedProjection: unknown;
  relationshipEvent: BusinessClaimFieldApplicationEventRecord | null;
  entityTarget: BusinessClaimCanonicalEntityState | null;
  locationTarget: BusinessClaimCanonicalLocationState | null;
}

export interface BusinessClaimFieldApplicationBackend {
  loadState(
    submissionId: string,
    relationshipDecisionId: string,
  ): Promise<BusinessClaimFieldApplicationState | null>;
}

export class BusinessClaimFieldApplicationError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'invalid_request'
      | 'not_found'
      | 'conflict'
      | 'invalid_claim'
      | 'invalid_relationship'
      | 'invalid_decision'
      | 'stale_target'
      | 'invalid_canonical'
      | 'no_op'
      | 'backend_failure',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BusinessClaimFieldApplicationError';
  }
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

async function sha256(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableJson(value)));
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`;
}

function assertPartition(
  proposed: readonly string[],
  accepted: readonly string[],
  rejected: readonly string[],
  label: string,
): void {
  const acceptedSet = new Set(accepted);
  const rejectedSet = new Set(rejected);
  if (accepted.some((value) => rejectedSet.has(value))) {
    throw new BusinessClaimFieldApplicationError(
      'invalid_decision',
      `${label} decisions must not accept and reject the same value.`,
    );
  }
  const combined = new Set([...accepted, ...rejected]);
  if (
    combined.size !== proposed.length ||
    proposed.some((value) => !combined.has(value)) ||
    [...combined].some((value) => !proposed.includes(value)) ||
    acceptedSet.size !== accepted.length ||
    rejectedSet.size !== rejected.length
  ) {
    throw new BusinessClaimFieldApplicationError(
      'invalid_decision',
      `${label} decisions must partition every submitted proposal exactly once.`,
    );
  }
}

function requireScope(
  projection: BusinessClaimReviewProjection,
  scope: 'entity_profile' | 'location_profile' | 'payment_information',
): void {
  if (!projection.requestedScopes.includes(scope)) {
    throw new BusinessClaimFieldApplicationError(
      'invalid_claim',
      `The Business Claim did not request the ${scope} scope.`,
    );
  }
}

function projectEntityApplication(
  projection: BusinessClaimReviewProjection,
  state: BusinessClaimFieldApplicationState,
  request: BusinessClaimFieldApplicationRequest,
): z.infer<typeof entityApplicationSchema> | null {
  const proposal = projection.proposedChanges.entity;
  const decision = request.entityDecision;
  if (proposal === null) {
    if (decision !== null || request.expectedEntityUpdatedAt !== null) {
      throw new BusinessClaimFieldApplicationError(
        'invalid_decision',
        'Entity application material was supplied without an Entity proposal.',
      );
    }
    return null;
  }
  requireScope(projection, 'entity_profile');
  if (decision === null || request.expectedEntityUpdatedAt === null || state.entityTarget === null) {
    throw new BusinessClaimFieldApplicationError(
      'invalid_decision',
      'Entity proposals require a complete field decision and exact Entity version.',
    );
  }
  if (
    projection.targetType !== 'entity' ||
    state.entityTarget.id !== projection.targetId ||
    state.entityTarget.updatedAt !== request.expectedEntityUpdatedAt
  ) {
    throw new BusinessClaimFieldApplicationError(
      'stale_target',
      'The canonical Entity target does not match the reviewed Claim version.',
    );
  }
  assertPartition(
    proposal.changedFields,
    decision.acceptedFields,
    decision.rejectedFields,
    'Entity field',
  );

  const beforeResult = canonicalEntitySchema.safeParse(state.entityTarget.value);
  if (!beforeResult.success) {
    throw new BusinessClaimFieldApplicationError(
      'invalid_canonical',
      'The canonical Entity state is invalid.',
    );
  }
  const afterCandidate: Record<string, unknown> = { ...beforeResult.data };
  for (const field of decision.acceptedFields) {
    if (stableJson(beforeResult.data[field]) === stableJson(proposal[field])) {
      throw new BusinessClaimFieldApplicationError(
        'no_op',
        `Accepted Entity field ${field} does not change canonical state.`,
      );
    }
    afterCandidate[field] = proposal[field];
  }
  const afterResult = canonicalEntitySchema.safeParse(afterCandidate);
  if (!afterResult.success) {
    throw new BusinessClaimFieldApplicationError(
      'invalid_canonical',
      'The accepted Entity fields do not produce valid canonical state.',
    );
  }
  return entityApplicationSchema.parse({
    expectedUpdatedAt: request.expectedEntityUpdatedAt,
    acceptedFields: decision.acceptedFields,
    rejectedFields: decision.rejectedFields,
    before: beforeResult.data,
    after: afterResult.data,
  });
}

function locationProposalValue(
  proposal: NonNullable<BusinessClaimReviewProjection['proposedChanges']['location']>,
  field: z.infer<typeof businessClaimLocationFieldSchema>,
): unknown {
  const value = proposal[field];
  if ((field === 'amenities' || field === 'socialLinks') && value === null) return [];
  return value;
}

function projectLocationApplication(
  projection: BusinessClaimReviewProjection,
  state: BusinessClaimFieldApplicationState,
  request: BusinessClaimFieldApplicationRequest,
): z.infer<typeof locationApplicationSchema> | null {
  const proposal = projection.proposedChanges.location;
  const decision = request.locationDecision;
  if (proposal === null) {
    if (decision !== null || request.expectedLocationUpdatedAt !== null) {
      throw new BusinessClaimFieldApplicationError(
        'invalid_decision',
        'Location application material was supplied without a Location proposal.',
      );
    }
    return null;
  }
  requireScope(projection, 'location_profile');
  if (
    decision === null ||
    request.expectedLocationUpdatedAt === null ||
    state.locationTarget === null
  ) {
    throw new BusinessClaimFieldApplicationError(
      'invalid_decision',
      'Location proposals require a complete field decision and exact Location version.',
    );
  }
  if (
    projection.targetType !== 'location' ||
    state.locationTarget.id !== projection.targetId ||
    state.locationTarget.updatedAt !== request.expectedLocationUpdatedAt
  ) {
    throw new BusinessClaimFieldApplicationError(
      'stale_target',
      'The canonical Location target does not match the reviewed Claim version.',
    );
  }
  assertPartition(
    proposal.changedFields,
    decision.acceptedFields,
    decision.rejectedFields,
    'Location field',
  );
  const latitudeAccepted = decision.acceptedFields.includes('latitude');
  const longitudeAccepted = decision.acceptedFields.includes('longitude');
  if (latitudeAccepted !== longitudeAccepted) {
    throw new BusinessClaimFieldApplicationError(
      'invalid_decision',
      'Latitude and longitude must receive the same field decision.',
    );
  }

  const beforeResult = canonicalLocationSchema.safeParse(state.locationTarget.value);
  if (!beforeResult.success) {
    throw new BusinessClaimFieldApplicationError(
      'invalid_canonical',
      'The canonical Location state is invalid.',
    );
  }
  const afterCandidate: Record<string, unknown> = { ...beforeResult.data };
  for (const field of decision.acceptedFields) {
    const proposedValue = locationProposalValue(proposal, field);
    if (stableJson(beforeResult.data[field]) === stableJson(proposedValue)) {
      throw new BusinessClaimFieldApplicationError(
        'no_op',
        `Accepted Location field ${field} does not change canonical state.`,
      );
    }
    afterCandidate[field] = proposedValue;
  }
  const afterResult = canonicalLocationSchema.safeParse(afterCandidate);
  if (!afterResult.success) {
    throw new BusinessClaimFieldApplicationError(
      'invalid_canonical',
      'The accepted Location fields do not produce valid canonical state.',
    );
  }
  return locationApplicationSchema.parse({
    expectedUpdatedAt: request.expectedLocationUpdatedAt,
    acceptedFields: decision.acceptedFields,
    rejectedFields: decision.rejectedFields,
    before: beforeResult.data,
    after: afterResult.data,
  });
}

function projectPaymentApplication(
  projection: BusinessClaimReviewProjection,
  request: BusinessClaimFieldApplicationRequest,
): z.infer<typeof paymentApplicationSchema> | null {
  const proposals = projection.proposedChanges.paymentProposals;
  const decision = request.paymentDecision;
  if (proposals === null) {
    if (decision !== null) {
      throw new BusinessClaimFieldApplicationError(
        'invalid_decision',
        'Payment decisions were supplied without payment proposals.',
      );
    }
    return null;
  }
  requireScope(projection, 'payment_information');
  if (decision === null) {
    throw new BusinessClaimFieldApplicationError(
      'invalid_decision',
      'Payment proposals require an explicit index decision.',
    );
  }
  const proposedIndexes = proposals.map((_, index) => String(index));
  assertPartition(
    proposedIndexes,
    decision.acceptedIndexes.map(String),
    decision.rejectedIndexes.map(String),
    'Payment proposal index',
  );
  return paymentApplicationSchema.parse({
    acceptedIndexes: decision.acceptedIndexes,
    rejectedIndexes: decision.rejectedIndexes,
    acceptedProposals: decision.acceptedIndexes.map((index) => proposals[index]),
  });
}

function assertApprovedRelationship(
  state: BusinessClaimFieldApplicationState,
  projection: BusinessClaimReviewProjection,
  relationshipDecisionId: string,
): void {
  const event = state.relationshipEvent;
  const payload = parseBusinessClaimRelationshipDecisionEventPayload(event?.internalNote ?? null);
  if (
    event === null ||
    event.eventId !== relationshipDecisionId ||
    event.submissionId !== state.submissionId ||
    event.fromStatus !== 'in_review' ||
    event.toStatus !== 'resolved' ||
    event.action !== 'business_claim_relationship_approved' ||
    event.reasonCode !== 'verified_authority_confirmed' ||
    payload === null ||
    payload.decision !== 'approve_relationship' ||
    payload.relationship === null ||
    payload.relationship.status !== 'active' ||
    payload.relationship.relationshipId !== relationshipDecisionId ||
    payload.targetType !== projection.targetType ||
    payload.targetId !== projection.targetId ||
    payload.claimantRole !== projection.claimantRole
  ) {
    throw new BusinessClaimFieldApplicationError(
      'invalid_relationship',
      'The approved representative relationship does not match the Business Claim.',
    );
  }
}

export async function projectBusinessClaimFieldApplication(
  context: BusinessClaimFieldApplicationContext,
  backend: BusinessClaimFieldApplicationBackend,
  submissionId: string,
  rawRequest: unknown,
  generatedAt = new Date(),
): Promise<BusinessClaimFieldApplicationProjection> {
  if (!context.capabilities.includes('submission:claim-fields:apply')) {
    throw new BusinessClaimFieldApplicationError(
      'unauthorized',
      'The actor is not authorized to apply Business Claim fields.',
    );
  }
  const submissionIdResult = z.uuid().safeParse(submissionId);
  const requestResult = businessClaimFieldApplicationRequestSchema.safeParse(rawRequest);
  if (!submissionIdResult.success || !requestResult.success || Number.isNaN(generatedAt.getTime())) {
    throw new BusinessClaimFieldApplicationError(
      'invalid_request',
      'The Business Claim field application request is invalid.',
    );
  }
  const request = requestResult.data;

  let state: BusinessClaimFieldApplicationState | null;
  try {
    state = await backend.loadState(
      submissionIdResult.data,
      request.expectedRelationshipDecisionId,
    );
  } catch (error) {
    throw new BusinessClaimFieldApplicationError(
      'backend_failure',
      'The Business Claim field application state could not be loaded.',
      { cause: error },
    );
  }
  if (state === null || state.submissionType !== 'claim') {
    throw new BusinessClaimFieldApplicationError('not_found', 'The Business Claim was not found.');
  }
  if (
    state.workflowStatus !== 'resolved' ||
    state.resolution !== 'approved' ||
    state.updatedAt !== request.expectedSubmissionUpdatedAt
  ) {
    throw new BusinessClaimFieldApplicationError(
      'conflict',
      'The Business Claim is not at the exact approved state reviewed by the applicant.',
    );
  }
  const projectionResult = businessClaimReviewProjectionSchema.safeParse(state.normalizedProjection);
  if (!projectionResult.success) {
    throw new BusinessClaimFieldApplicationError(
      'invalid_claim',
      'The stored Business Claim projection is invalid.',
    );
  }
  const projection = projectionResult.data;
  if (state.targetType !== projection.targetType || state.targetId !== projection.targetId) {
    throw new BusinessClaimFieldApplicationError(
      'invalid_claim',
      'The stored Business Claim target does not match its normalized projection.',
    );
  }
  assertApprovedRelationship(state, projection, request.expectedRelationshipDecisionId);

  const entityApplication = projectEntityApplication(projection, state, request);
  const locationApplication = projectLocationApplication(projection, state, request);
  const paymentApplication = projectPaymentApplication(projection, request);
  const hasAcceptedChanges =
    (entityApplication?.acceptedFields.length ?? 0) > 0 ||
    (locationApplication?.acceptedFields.length ?? 0) > 0 ||
    (paymentApplication?.acceptedIndexes.length ?? 0) > 0;

  const requestFingerprint = await sha256({
    submissionId: submissionIdResult.data,
    relationshipDecisionId: request.expectedRelationshipDecisionId,
    request,
    proposedChanges: projection.proposedChanges,
  });

  return businessClaimFieldApplicationProjectionSchema.parse({
    schemaVersion: 'business-claim-field-application-projection-v1',
    requestId: request.requestId,
    requestFingerprint,
    submissionId: submissionIdResult.data,
    relationshipDecisionId: request.expectedRelationshipDecisionId,
    targetType: projection.targetType,
    targetId: projection.targetId,
    entityApplication,
    locationApplication,
    paymentApplication,
    hasAcceptedChanges,
    generatedAt: generatedAt.toISOString(),
  });
}
