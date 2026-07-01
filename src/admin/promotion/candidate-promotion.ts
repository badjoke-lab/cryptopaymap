import { z } from 'zod';
import { acceptanceClaimInputSchema } from '../../schemas/acceptance-claims';
import { canonicalEntitySchema, canonicalLocationSchema } from '../../schemas/canonical-identity';
import { claimAssetInputSchema, claimAssetSetSchema } from '../../schemas/claim-assets';
import {
  normalizePromotionProvenanceAssignments,
  promotionProvenanceAssignmentsSchema,
  validateNewTargetProvenanceAssignments,
  type PromotionProvenanceAssignment,
} from './provenance-plan';

export const candidatePromotionCapabilityValues = ['candidate:promote'] as const;
export const candidatePromotionCapabilitySchema = z.enum(candidatePromotionCapabilityValues);

export const candidatePromotionMutationContextSchema = z
  .object({
    requestId: z.uuid(),
    actorId: z.string().trim().min(1).max(200),
    actorType: z.enum(['human', 'system']),
    capabilities: z.array(candidatePromotionCapabilitySchema).min(1),
  })
  .strict();

const entityDraftSchema = z.object({ id: z.uuid(), value: canonicalEntitySchema }).strict();
const locationDraftSchema = z.object({ id: z.uuid(), value: canonicalLocationSchema }).strict();
const claimDraftSchema = z.object({ id: z.uuid(), value: acceptanceClaimInputSchema }).strict();
const claimAssetDraftSchema = z.object({ id: z.uuid(), value: claimAssetInputSchema }).strict();

export const candidatePromotionInputSchema = z
  .object({
    candidateId: z.uuid(),
    expectedCandidateType: z.enum(['physical_place', 'online_service']),
    expectedCandidateUpdatedAt: z.iso.datetime({ offset: true }),
    promotedAt: z.iso.datetime({ offset: true }),
    entity: entityDraftSchema,
    location: locationDraftSchema.nullable(),
    claim: claimDraftSchema,
    claimAssets: z.array(claimAssetDraftSchema).min(1).max(100),
    sourceRecordIds: z.array(z.uuid()).min(1).max(100),
    provenanceAssignments: promotionProvenanceAssignmentsSchema.optional(),
  })
  .strict();

export type CandidatePromotionMutationContext = z.infer<
  typeof candidatePromotionMutationContextSchema
>;
export type CandidatePromotionInput = z.infer<typeof candidatePromotionInputSchema>;

export interface CandidatePromotionCommand {
  requestId: string;
  actorId: string;
  actorType: 'human' | 'system';
  candidateId: string;
  expectedCandidateType: 'physical_place' | 'online_service';
  expectedCandidateUpdatedAt: Date;
  promotedAt: Date;
  entity: CandidatePromotionInput['entity'];
  location: CandidatePromotionInput['location'];
  claim: CandidatePromotionInput['claim'];
  claimAssets: CandidatePromotionInput['claimAssets'];
  sourceRecordIds: string[];
  provenanceAssignments: PromotionProvenanceAssignment[];
  canonicalPath: string;
  requestFingerprint: string;
}

export interface CandidatePromotionReceipt {
  requestId: string;
  candidateId: string;
  entityId: string;
  locationId: string | null;
  claimId: string;
  claimAssetIds: string[];
  canonicalPath: string;
  claimStatus: 'candidate';
  visibility: 'hidden';
  promotedAt: string;
  state: 'committed' | 'replayed';
}

export interface CandidatePromotionBackend {
  commitPromotion(command: CandidatePromotionCommand): Promise<CandidatePromotionReceipt>;
}

export type CandidatePromotionErrorCode =
  | 'unauthorized'
  | 'invalid_promotion'
  | 'not_found'
  | 'conflict'
  | 'backend_failure';

export class CandidatePromotionError extends Error {
  readonly code: CandidatePromotionErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: CandidatePromotionErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CandidatePromotionError';
    this.code = code;
    this.issues = issues;
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

function validatePromotion(input: CandidatePromotionInput): string[] {
  const issues: string[] = [];
  if (Date.parse(input.promotedAt) < Date.parse(input.expectedCandidateUpdatedAt)) {
    issues.push('promotedAt cannot precede the reviewed Candidate version');
  }
  if (new Set(input.sourceRecordIds).size !== input.sourceRecordIds.length) {
    issues.push('sourceRecordIds must be unique');
  }
  if (new Set(input.claimAssets.map((row) => row.id)).size !== input.claimAssets.length) {
    issues.push('claim asset record IDs must be unique');
  }
  const claimAssetSet = claimAssetSetSchema.safeParse(input.claimAssets.map((row) => row.value));
  if (!claimAssetSet.success) {
    issues.push(...claimAssetSet.error.issues.map((issue) => issue.message));
  }

  const entity = input.entity.value;
  const claim = input.claim.value;
  if (entity.visibility !== 'hidden') issues.push('the promoted entity must remain hidden');
  if (input.location !== null && input.location.value.visibility !== 'hidden') {
    issues.push('the promoted location must remain hidden');
  }
  if (claim.claimStatus !== 'candidate' || claim.visibility !== 'hidden') {
    issues.push('promotion must create a hidden candidate claim');
  }
  if (
    claim.firstConfirmedAt !== null ||
    claim.lastConfirmedAt !== null ||
    claim.nextReviewAt !== null ||
    claim.endedAt !== null ||
    claim.endedReason !== null
  ) {
    issues.push('promotion cannot assign verification, review, or ending timestamps');
  }
  if (claim.entityId !== input.entity.id) issues.push('claim entityId must match the entity draft');

  if (input.expectedCandidateType === 'physical_place') {
    if (entity.entityType !== 'merchant')
      issues.push('physical Candidates require merchant entities');
    if (input.location === null) {
      issues.push('physical Candidates require a canonical location');
    } else if (claim.locationId !== input.location.id || claim.claimScope !== 'location_specific') {
      issues.push('physical Candidates require a location-specific claim');
    }
  } else {
    if (entity.entityType !== 'online_service') {
      issues.push('online Candidates require online-service entities');
    }
    if (
      input.location !== null ||
      claim.locationId !== null ||
      claim.claimScope !== 'online_service'
    ) {
      issues.push('online Candidates cannot create or reference a physical location');
    }
    if (entity.slug === null) issues.push('online Candidates require an entity slug');
  }

  if (claim.routeType === 'direct_wallet' && claim.processorId !== null) {
    issues.push('direct-wallet claims cannot reference a processor');
  }
  for (const row of input.claimAssets) {
    if (row.value.claimId !== input.claim.id) {
      issues.push('every claim asset must reference the promoted claim');
    }
  }

  issues.push(
    ...validateNewTargetProvenanceAssignments(input.provenanceAssignments, {
      sourceRecordIds: input.sourceRecordIds,
      entity: input.entity,
      location: input.location,
      claim: input.claim,
      claimAssets: input.claimAssets,
    }),
  );
  return issues;
}

function buildCommand(
  context: CandidatePromotionMutationContext,
  input: CandidatePromotionInput,
): CandidatePromotionCommand {
  const sourceRecordIds = [...input.sourceRecordIds].sort();
  const claimAssets = [...input.claimAssets].sort((left, right) => left.id.localeCompare(right.id));
  const provenanceAssignments = normalizePromotionProvenanceAssignments(
    input.provenanceAssignments,
  );
  const canonicalPath =
    input.expectedCandidateType === 'physical_place'
      ? `/place/${input.location?.value.slug ?? ''}`
      : `/service/${input.entity.value.slug ?? ''}`;
  const requestFingerprint = JSON.stringify(
    stable({
      requestId: context.requestId,
      actorId: context.actorId,
      actorType: context.actorType,
      ...input,
      sourceRecordIds,
      claimAssets,
      ...(provenanceAssignments.length > 0 ? { provenanceAssignments } : {}),
      canonicalPath,
    }),
  );
  return {
    requestId: context.requestId,
    actorId: context.actorId,
    actorType: context.actorType,
    candidateId: input.candidateId,
    expectedCandidateType: input.expectedCandidateType,
    expectedCandidateUpdatedAt: new Date(input.expectedCandidateUpdatedAt),
    promotedAt: new Date(input.promotedAt),
    entity: input.entity,
    location: input.location,
    claim: input.claim,
    claimAssets,
    sourceRecordIds,
    provenanceAssignments,
    canonicalPath,
    requestFingerprint,
  };
}

export function createCandidatePromotionService(backend: CandidatePromotionBackend) {
  return {
    async promote(
      context: CandidatePromotionMutationContext,
      input: CandidatePromotionInput,
    ): Promise<CandidatePromotionReceipt> {
      const contextResult = candidatePromotionMutationContextSchema.safeParse(context);
      if (!contextResult.success || !context.capabilities.includes('candidate:promote')) {
        throw new CandidatePromotionError(
          'unauthorized',
          'The actor is not authorized to promote Candidates.',
          contextResult.success
            ? []
            : contextResult.error.issues.map(
                (issue) => `${issue.path.join('.')}: ${issue.message}`,
              ),
        );
      }
      const inputResult = candidatePromotionInputSchema.safeParse(input);
      if (!inputResult.success) {
        throw new CandidatePromotionError(
          'invalid_promotion',
          'The Candidate promotion request is invalid.',
          inputResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        );
      }
      const issues = validatePromotion(inputResult.data);
      if (issues.length > 0) {
        throw new CandidatePromotionError(
          'invalid_promotion',
          'The Candidate promotion violates the canonical boundary.',
          issues,
        );
      }
      try {
        return await backend.commitPromotion(buildCommand(contextResult.data, inputResult.data));
      } catch (error) {
        if (error instanceof CandidatePromotionError) throw error;
        throw new CandidatePromotionError(
          'backend_failure',
          'The Candidate promotion was not committed.',
          [],
          { cause: error },
        );
      }
    },
  };
}
