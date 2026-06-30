import { z } from 'zod';
import {
  CandidateDetailError,
  candidateDetailResponseSchema,
  loadCandidateDetail,
  type CandidateDetailBackend,
  type CandidateDetailContext,
} from '../candidates/detail';
import { candidatePromotionInputSchema } from './candidate-promotion';

const timestampSchema = z.iso.datetime({ offset: true });
const registryOptionSchema = z
  .object({
    id: z.uuid(),
    slug: z.string().trim().min(1).max(96),
    name: z.string().trim().min(1).max(160),
    label: z.string().trim().min(1).max(240),
  })
  .strict();
const processorOptionSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(160),
    websiteUrl: z.url().nullable(),
  })
  .strict();

export const candidatePromotionEligibilityIssueValues = [
  'unsupported_candidate_type',
  'candidate_status_not_promotable',
  'canonical_target_already_linked',
  'source_provenance_missing',
  'source_provenance_truncated',
  'duplicate_review_open',
] as const;
export const candidatePromotionEligibilityIssueSchema = z.enum(
  candidatePromotionEligibilityIssueValues,
);

export const candidatePromotionRegistryOptionsSchema = z
  .object({
    assets: z.array(registryOptionSchema).max(500),
    networks: z.array(registryOptionSchema).max(500),
    paymentMethods: z.array(registryOptionSchema).max(100),
    processors: z.array(processorOptionSchema).max(500),
  })
  .strict();

export const candidatePromotionWorkspaceResponseSchema = z
  .object({
    generatedAt: timestampSchema,
    detail: candidateDetailResponseSchema,
    eligible: z.boolean(),
    eligibilityIssues: z.array(candidatePromotionEligibilityIssueSchema).max(10),
    registries: candidatePromotionRegistryOptionsSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.eligible !== (value.eligibilityIssues.length === 0)) {
      context.addIssue({
        code: 'custom',
        path: ['eligible'],
        message: 'Promotion eligibility must match the issue list.',
      });
    }
  });

export const candidatePromotionEditorRequestSchema = candidatePromotionInputSchema.omit({
  candidateId: true,
  promotedAt: true,
});

export type CandidatePromotionRegistryOptions = z.infer<
  typeof candidatePromotionRegistryOptionsSchema
>;
export type CandidatePromotionWorkspaceResponse = z.infer<
  typeof candidatePromotionWorkspaceResponseSchema
>;
export type CandidatePromotionEditorRequest = z.infer<typeof candidatePromotionEditorRequestSchema>;

export interface CandidatePromotionRegistryBackend {
  loadRegistryOptions(): Promise<CandidatePromotionRegistryOptions>;
}

export type CandidatePromotionWorkspaceErrorCode =
  | 'unauthorized'
  | 'invalid_candidate_id'
  | 'not_found'
  | 'invalid_workspace'
  | 'backend_failure';

export class CandidatePromotionWorkspaceError extends Error {
  readonly code: CandidatePromotionWorkspaceErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: CandidatePromotionWorkspaceErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CandidatePromotionWorkspaceError';
    this.code = code;
    this.issues = issues;
  }
}

function eligibilityIssues(
  detail: z.infer<typeof candidateDetailResponseSchema>,
): Array<(typeof candidatePromotionEligibilityIssueValues)[number]> {
  const issues: Array<(typeof candidatePromotionEligibilityIssueValues)[number]> = [];
  if (!['physical_place', 'online_service'].includes(detail.candidate.candidateType)) {
    issues.push('unsupported_candidate_type');
  }
  if (!['new', 'triaged'].includes(detail.candidate.status)) {
    issues.push('candidate_status_not_promotable');
  }
  if (detail.candidate.linkedEntity || detail.candidate.linkedLocation) {
    issues.push('canonical_target_already_linked');
  }
  if (detail.sources.length === 0) issues.push('source_provenance_missing');
  if (detail.sourcesTruncated) issues.push('source_provenance_truncated');
  if (detail.candidate.duplicateGroupStatus === 'open') issues.push('duplicate_review_open');
  return issues;
}

export async function loadCandidatePromotionWorkspace(
  context: CandidateDetailContext,
  detailBackend: CandidateDetailBackend,
  registryBackend: CandidatePromotionRegistryBackend,
  candidateId: string,
  asOf = new Date(),
): Promise<CandidatePromotionWorkspaceResponse> {
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
      throw new CandidatePromotionWorkspaceError(code, error.message, error.issues, {
        cause: error,
      });
    }
    throw error;
  }

  let registries: CandidatePromotionRegistryOptions;
  try {
    registries = await registryBackend.loadRegistryOptions();
  } catch (error) {
    throw new CandidatePromotionWorkspaceError(
      'backend_failure',
      'The promotion registry options could not be loaded.',
      [],
      { cause: error },
    );
  }

  const issues = eligibilityIssues(detail);
  const result = candidatePromotionWorkspaceResponseSchema.safeParse({
    generatedAt: asOf.toISOString(),
    detail,
    eligible: issues.length === 0,
    eligibilityIssues: issues,
    registries,
  });
  if (!result.success) {
    throw new CandidatePromotionWorkspaceError(
      'invalid_workspace',
      'The Candidate promotion workspace response is invalid.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}
