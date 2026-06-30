import { z } from 'zod';
import { acceptanceClaimInputSchema } from '../../schemas/acceptance-claims';
import { claimAssetInputSchema, claimAssetSetSchema } from '../../schemas/claim-assets';
import {
  CandidatePromotionError,
  candidatePromotionMutationContextSchema,
  type CandidatePromotionMutationContext,
  type CandidatePromotionReceipt,
} from './candidate-promotion';

const targetSchema = z
  .object({
    entityId: z.uuid(),
    expectedEntityUpdatedAt: z.iso.datetime({ offset: true }),
    locationId: z.uuid().nullable(),
    expectedLocationUpdatedAt: z.iso.datetime({ offset: true }).nullable(),
    expectedCanonicalPath: z
      .string()
      .trim()
      .regex(/^\/(place|service)\/[^/?#]+$/),
    expectedClaimIds: z.array(z.uuid()).max(100),
  })
  .strict();
const claimDraftSchema = z.object({ id: z.uuid(), value: acceptanceClaimInputSchema }).strict();
const claimAssetDraftSchema = z.object({ id: z.uuid(), value: claimAssetInputSchema }).strict();

export const candidateExistingTargetLinkInputSchema = z
  .object({
    candidateId: z.uuid(),
    expectedCandidateType: z.enum(['physical_place', 'online_service']),
    expectedCandidateUpdatedAt: z.iso.datetime({ offset: true }),
    linkedAt: z.iso.datetime({ offset: true }),
    target: targetSchema,
    claim: claimDraftSchema,
    claimAssets: z.array(claimAssetDraftSchema).min(1).max(100),
    sourceRecordIds: z.array(z.uuid()).min(1).max(100),
  })
  .strict();

export type CandidateExistingTargetLinkInput = z.infer<
  typeof candidateExistingTargetLinkInputSchema
>;

export interface CandidateExistingTargetLinkCommand {
  requestId: string;
  actorId: string;
  actorType: 'human' | 'system';
  candidateId: string;
  expectedCandidateType: 'physical_place' | 'online_service';
  expectedCandidateUpdatedAt: Date;
  linkedAt: Date;
  target: {
    entityId: string;
    expectedEntityUpdatedAt: Date;
    locationId: string | null;
    expectedLocationUpdatedAt: Date | null;
    expectedCanonicalPath: string;
    expectedClaimIds: string[];
  };
  claim: CandidateExistingTargetLinkInput['claim'];
  claimAssets: CandidateExistingTargetLinkInput['claimAssets'];
  sourceRecordIds: string[];
  requestFingerprint: string;
}

export interface CandidateExistingTargetLinkBackend {
  commitExistingTargetLink(
    command: CandidateExistingTargetLinkCommand,
  ): Promise<CandidatePromotionReceipt>;
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

function validateLink(input: CandidateExistingTargetLinkInput): string[] {
  const issues: string[] = [];
  const linkedAt = Date.parse(input.linkedAt);
  if (linkedAt < Date.parse(input.expectedCandidateUpdatedAt)) {
    issues.push('linkedAt cannot precede the reviewed Candidate version');
  }
  if (linkedAt < Date.parse(input.target.expectedEntityUpdatedAt)) {
    issues.push('linkedAt cannot precede the reviewed Entity version');
  }
  if (
    input.target.expectedLocationUpdatedAt !== null &&
    linkedAt < Date.parse(input.target.expectedLocationUpdatedAt)
  ) {
    issues.push('linkedAt cannot precede the reviewed Location version');
  }
  if (new Set(input.sourceRecordIds).size !== input.sourceRecordIds.length) {
    issues.push('sourceRecordIds must be unique');
  }
  if (new Set(input.target.expectedClaimIds).size !== input.target.expectedClaimIds.length) {
    issues.push('expectedClaimIds must be unique');
  }
  if (new Set(input.claimAssets.map((row) => row.id)).size !== input.claimAssets.length) {
    issues.push('claim asset record IDs must be unique');
  }

  const claimAssetSet = claimAssetSetSchema.safeParse(input.claimAssets.map((row) => row.value));
  if (!claimAssetSet.success) {
    issues.push(...claimAssetSet.error.issues.map((issue) => issue.message));
  }

  const claim = input.claim.value;
  if (claim.claimStatus !== 'candidate' || claim.visibility !== 'hidden') {
    issues.push('existing-target linking must create a hidden candidate claim');
  }
  if (
    claim.firstConfirmedAt !== null ||
    claim.lastConfirmedAt !== null ||
    claim.nextReviewAt !== null ||
    claim.endedAt !== null ||
    claim.endedReason !== null
  ) {
    issues.push('existing-target linking cannot assign verification, review, or ending timestamps');
  }
  if (claim.entityId !== input.target.entityId) {
    issues.push('claim entityId must match the selected canonical Entity');
  }

  if (input.expectedCandidateType === 'physical_place') {
    if (
      input.target.locationId === null ||
      input.target.expectedLocationUpdatedAt === null ||
      !input.target.expectedCanonicalPath.startsWith('/place/')
    ) {
      issues.push('physical Candidates require a versioned canonical Location target');
    }
    if (claim.locationId !== input.target.locationId || claim.claimScope !== 'location_specific') {
      issues.push('physical Candidates require a location-specific claim on the selected target');
    }
  } else {
    if (
      input.target.locationId !== null ||
      input.target.expectedLocationUpdatedAt !== null ||
      !input.target.expectedCanonicalPath.startsWith('/service/')
    ) {
      issues.push('online Candidates require an Entity-only canonical target');
    }
    if (claim.locationId !== null || claim.claimScope !== 'online_service') {
      issues.push('online Candidates require an online-service claim');
    }
  }

  if (claim.routeType === 'direct_wallet' && claim.processorId !== null) {
    issues.push('direct-wallet claims cannot reference a processor');
  }
  for (const row of input.claimAssets) {
    if (row.value.claimId !== input.claim.id) {
      issues.push('every claim asset must reference the new candidate claim');
    }
  }
  return issues;
}

function buildCommand(
  context: CandidatePromotionMutationContext,
  input: CandidateExistingTargetLinkInput,
): CandidateExistingTargetLinkCommand {
  const sourceRecordIds = [...input.sourceRecordIds].sort();
  const expectedClaimIds = [...input.target.expectedClaimIds].sort();
  const claimAssets = [...input.claimAssets].sort((left, right) => left.id.localeCompare(right.id));
  const requestFingerprint = JSON.stringify(
    stable({
      operation: 'link_existing_target',
      requestId: context.requestId,
      actorId: context.actorId,
      actorType: context.actorType,
      ...input,
      target: { ...input.target, expectedClaimIds },
      sourceRecordIds,
      claimAssets,
    }),
  );

  return {
    requestId: context.requestId,
    actorId: context.actorId,
    actorType: context.actorType,
    candidateId: input.candidateId,
    expectedCandidateType: input.expectedCandidateType,
    expectedCandidateUpdatedAt: new Date(input.expectedCandidateUpdatedAt),
    linkedAt: new Date(input.linkedAt),
    target: {
      entityId: input.target.entityId,
      expectedEntityUpdatedAt: new Date(input.target.expectedEntityUpdatedAt),
      locationId: input.target.locationId,
      expectedLocationUpdatedAt:
        input.target.expectedLocationUpdatedAt === null
          ? null
          : new Date(input.target.expectedLocationUpdatedAt),
      expectedCanonicalPath: input.target.expectedCanonicalPath,
      expectedClaimIds,
    },
    claim: input.claim,
    claimAssets,
    sourceRecordIds,
    requestFingerprint,
  };
}

export function createCandidateExistingTargetLinkService(
  backend: CandidateExistingTargetLinkBackend,
) {
  return {
    async link(
      context: CandidatePromotionMutationContext,
      input: CandidateExistingTargetLinkInput,
    ): Promise<CandidatePromotionReceipt> {
      const contextResult = candidatePromotionMutationContextSchema.safeParse(context);
      if (!contextResult.success || !context.capabilities.includes('candidate:promote')) {
        throw new CandidatePromotionError(
          'unauthorized',
          'The actor is not authorized to link Candidates to canonical targets.',
          contextResult.success
            ? []
            : contextResult.error.issues.map(
                (issue) => `${issue.path.join('.')}: ${issue.message}`,
              ),
        );
      }

      const inputResult = candidateExistingTargetLinkInputSchema.safeParse(input);
      if (!inputResult.success) {
        throw new CandidatePromotionError(
          'invalid_promotion',
          'The existing-target link request is invalid.',
          inputResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        );
      }
      const issues = validateLink(inputResult.data);
      if (issues.length > 0) {
        throw new CandidatePromotionError(
          'invalid_promotion',
          'The existing-target link violates the canonical boundary.',
          issues,
        );
      }

      try {
        return await backend.commitExistingTargetLink(
          buildCommand(contextResult.data, inputResult.data),
        );
      } catch (error) {
        if (error instanceof CandidatePromotionError) throw error;
        throw new CandidatePromotionError(
          'backend_failure',
          'The existing-target link was not committed.',
          [],
          { cause: error },
        );
      }
    },
  };
}
