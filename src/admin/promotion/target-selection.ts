import { z } from 'zod';
import {
  CandidateDetailError,
  candidateDetailResponseSchema,
  loadCandidateDetail,
  type CandidateDetailBackend,
  type CandidateDetailContext,
} from '../candidates/detail';

const timestampSchema = z.iso.datetime({ offset: true });
const httpUrlSchema = z
  .url()
  .max(2_048)
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol));

export const canonicalTargetSearchQuerySchema = z
  .object({
    query: z.string().trim().min(2).max(160),
    limit: z.number().int().min(1).max(25).default(10),
  })
  .strict();

const canonicalTargetClaimSchema = z
  .object({
    id: z.uuid(),
    claimScope: z.enum([
      'location_specific',
      'brand_region',
      'brand_global',
      'online_service',
      'platform_capability',
    ]),
    routeType: z.enum(['direct_wallet', 'processor_checkout']),
    claimStatus: z.enum(['candidate', 'confirmed', 'stale', 'ended', 'rejected']),
    visibility: z.enum(['public', 'hidden', 'temporarily_hidden']),
    howToPay: z.string().trim().min(1).max(2_000).nullable(),
    updatedAt: timestampSchema,
  })
  .strict();

const canonicalTargetEntitySchema = z
  .object({
    id: z.uuid(),
    entityType: z.enum(['merchant', 'online_service']),
    name: z.string().trim().min(1).max(160),
    slug: z.string().trim().min(1).max(64).nullable(),
    websiteUrl: httpUrlSchema.nullable(),
    countryCode: z.string().length(2).nullable(),
    entityStatus: z.enum(['active', 'unknown']),
    visibility: z.enum(['public', 'hidden', 'temporarily_hidden']),
    updatedAt: timestampSchema,
  })
  .strict();

const canonicalTargetLocationSchema = z
  .object({
    id: z.uuid(),
    entityId: z.uuid(),
    name: z.string().trim().min(1).max(160).nullable(),
    slug: z.string().trim().min(1).max(64),
    addressLine: z.string().trim().min(1).max(500).nullable(),
    locality: z.string().trim().min(1).max(120).nullable(),
    region: z.string().trim().min(1).max(120).nullable(),
    postalCode: z.string().trim().min(1).max(32).nullable(),
    countryCode: z.string().length(2),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    locationStatus: z.enum(['active', 'temporarily_closed', 'unknown']),
    visibility: z.enum(['public', 'hidden', 'temporarily_hidden']),
    websiteUrl: httpUrlSchema.nullable(),
    updatedAt: timestampSchema,
  })
  .strict();

export const candidateCanonicalTargetOptionSchema = z
  .object({
    canonicalPath: z
      .string()
      .trim()
      .regex(/^\/(place|service)\/[^/?#]+$/),
    entity: canonicalTargetEntitySchema,
    location: canonicalTargetLocationSchema.nullable(),
    existingClaims: z.array(canonicalTargetClaimSchema).max(100),
    expectedClaimIds: z.array(z.uuid()).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const physical = value.entity.entityType === 'merchant';
    if (physical !== (value.location !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['location'],
        message: 'Merchant targets require a Location and online-service targets cannot include one.',
      });
    }
    const expectedPath =
      value.location === null
        ? value.entity.slug === null
          ? null
          : `/service/${value.entity.slug}`
        : `/place/${value.location.slug}`;
    if (expectedPath === null || value.canonicalPath !== expectedPath) {
      context.addIssue({
        code: 'custom',
        path: ['canonicalPath'],
        message: 'Canonical target path does not match the selected identity.',
      });
    }
    const claimIds = value.existingClaims.map((claim) => claim.id).sort();
    const expectedClaimIds = [...value.expectedClaimIds].sort();
    if (JSON.stringify(claimIds) !== JSON.stringify(expectedClaimIds)) {
      context.addIssue({
        code: 'custom',
        path: ['expectedClaimIds'],
        message: 'Expected Claim IDs must match the returned target Claim set.',
      });
    }
  });

export const candidateCanonicalTargetSearchResponseSchema = z
  .object({
    generatedAt: timestampSchema,
    detail: candidateDetailResponseSchema,
    query: z.string().trim().min(2).max(160),
    targets: z.array(candidateCanonicalTargetOptionSchema).max(25),
  })
  .strict();

export type CanonicalTargetSearchQuery = z.infer<typeof canonicalTargetSearchQuerySchema>;
export type CandidateCanonicalTargetOption = z.infer<
  typeof candidateCanonicalTargetOptionSchema
>;
export type CandidateCanonicalTargetSearchResponse = z.infer<
  typeof candidateCanonicalTargetSearchResponseSchema
>;

export interface CandidateCanonicalTargetSearchBackend {
  searchTargets(
    candidateType: 'physical_place' | 'online_service',
    query: string,
    limit: number,
  ): Promise<CandidateCanonicalTargetOption[]>;
}

export type CandidateCanonicalTargetSearchErrorCode =
  | 'unauthorized'
  | 'invalid_candidate_id'
  | 'invalid_query'
  | 'not_found'
  | 'candidate_not_eligible'
  | 'invalid_response'
  | 'backend_failure';

export class CandidateCanonicalTargetSearchError extends Error {
  readonly code: CandidateCanonicalTargetSearchErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: CandidateCanonicalTargetSearchErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CandidateCanonicalTargetSearchError';
    this.code = code;
    this.issues = issues;
  }
}

function assertCandidateEligible(detail: z.infer<typeof candidateDetailResponseSchema>): void {
  const candidate = detail.candidate;
  if (
    !['physical_place', 'online_service'].includes(candidate.candidateType) ||
    !['new', 'triaged'].includes(candidate.status) ||
    candidate.linkedEntity ||
    candidate.linkedLocation ||
    detail.sources.length === 0 ||
    detail.sourcesTruncated ||
    candidate.duplicateGroupStatus === 'open'
  ) {
    throw new CandidateCanonicalTargetSearchError(
      'candidate_not_eligible',
      'The Candidate is not eligible for canonical target selection.',
    );
  }
}

export async function searchCandidateCanonicalTargets(
  context: CandidateDetailContext,
  detailBackend: CandidateDetailBackend,
  targetBackend: CandidateCanonicalTargetSearchBackend,
  candidateId: string,
  input: CanonicalTargetSearchQuery,
  asOf = new Date(),
): Promise<CandidateCanonicalTargetSearchResponse> {
  const queryResult = canonicalTargetSearchQuerySchema.safeParse(input);
  if (!queryResult.success) {
    throw new CandidateCanonicalTargetSearchError(
      'invalid_query',
      'The canonical target search query is invalid.',
      queryResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  let detail: z.infer<typeof candidateDetailResponseSchema>;
  try {
    detail = await loadCandidateDetail(context, detailBackend, candidateId, asOf);
  } catch (error) {
    if (error instanceof CandidateDetailError) {
      const code =
        error.code === 'unauthorized'
          ? 'unauthorized'
          : error.code === 'invalid_candidate_id'
            ? 'invalid_candidate_id'
            : error.code === 'not_found'
              ? 'not_found'
              : 'backend_failure';
      throw new CandidateCanonicalTargetSearchError(code, error.message, error.issues, {
        cause: error,
      });
    }
    throw error;
  }

  assertCandidateEligible(detail);
  const candidateType = detail.candidate.candidateType;
  if (candidateType !== 'physical_place' && candidateType !== 'online_service') {
    throw new CandidateCanonicalTargetSearchError(
      'candidate_not_eligible',
      'The Candidate type cannot select a canonical target.',
    );
  }

  let targets: CandidateCanonicalTargetOption[];
  try {
    targets = await targetBackend.searchTargets(
      candidateType,
      queryResult.data.query,
      queryResult.data.limit,
    );
  } catch (error) {
    throw new CandidateCanonicalTargetSearchError(
      'backend_failure',
      'Canonical target search could not be completed.',
      [],
      { cause: error },
    );
  }

  const result = candidateCanonicalTargetSearchResponseSchema.safeParse({
    generatedAt: asOf.toISOString(),
    detail,
    query: queryResult.data.query,
    targets,
  });
  if (!result.success) {
    throw new CandidateCanonicalTargetSearchError(
      'invalid_response',
      'Canonical target search returned an invalid protected response.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}
