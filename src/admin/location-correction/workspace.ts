import { z } from 'zod';
import {
  CandidateDetailError,
  candidateDetailResponseSchema,
  loadCandidateDetail,
  type CandidateDetailBackend,
} from '../candidates/detail';

const timestampSchema = z.iso.datetime({ offset: true });
const nullableText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable();
const httpsUrlSchema = z
  .url()
  .max(2_048)
  .refine((value) => new URL(value).protocol === 'https:');

export const locationCorrectionReadContextSchema = z
  .object({
    actorId: z.string().trim().min(1).max(200),
    actorType: z.enum(['human', 'system']),
    capabilities: z.array(z.literal('location:correct')).min(1),
  })
  .strict();

const canonicalSocialLinkSchema = z
  .object({
    platform: z.string().trim().min(1).max(80),
    url: httpsUrlSchema,
    handle: z.string().trim().min(1).max(160).nullable(),
  })
  .strict();

export const locationCorrectionTargetSchema = z
  .object({
    id: z.uuid(),
    entityId: z.uuid(),
    canonicalPath: z.string().regex(/^\/place\/[^/?#]+$/),
    name: z.string().trim().min(1).max(160),
    addressLine: nullableText(500),
    locality: nullableText(120),
    region: nullableText(120),
    postalCode: nullableText(32),
    countryCode: z.string().length(2),
    websiteUrl: httpsUrlSchema.nullable(),
    phone: nullableText(64),
    description: nullableText(5_000),
    openingHours: nullableText(2_000),
    amenities: z.array(z.string().trim().min(1).max(80)).max(100),
    socialLinks: z.array(canonicalSocialLinkSchema).max(30),
    visibility: z.enum(['public', 'hidden', 'temporarily_hidden']),
    locationStatus: z.enum(['active', 'temporarily_closed', 'closed', 'unknown']),
    updatedAt: timestampSchema,
  })
  .strict();

export const locationCorrectionWorkspaceResponseSchema = z
  .object({
    generatedAt: timestampSchema,
    candidate: candidateDetailResponseSchema,
    location: locationCorrectionTargetSchema,
    eligible: z.boolean(),
    eligibilityIssues: z.array(
      z.enum([
        'candidate_type_unsupported',
        'candidate_status_unsupported',
        'candidate_sources_missing',
        'candidate_sources_truncated',
        'candidate_duplicate_review_open',
      ]),
    ),
  })
  .strict();

export type LocationCorrectionReadContext = z.infer<typeof locationCorrectionReadContextSchema>;
export type LocationCorrectionTarget = z.infer<typeof locationCorrectionTargetSchema>;
export type LocationCorrectionWorkspaceResponse = z.infer<
  typeof locationCorrectionWorkspaceResponseSchema
>;

export interface LocationCorrectionWorkspaceBackend {
  loadLocation(locationId: string): Promise<LocationCorrectionTarget | null>;
}

export type LocationCorrectionWorkspaceErrorCode =
  | 'unauthorized'
  | 'invalid_candidate_id'
  | 'invalid_location_id'
  | 'not_found'
  | 'invalid_response'
  | 'backend_failure';

export class LocationCorrectionWorkspaceError extends Error {
  readonly code: LocationCorrectionWorkspaceErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: LocationCorrectionWorkspaceErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'LocationCorrectionWorkspaceError';
    this.code = code;
    this.issues = issues;
  }
}

function authorize(context: LocationCorrectionReadContext) {
  const result = locationCorrectionReadContextSchema.safeParse(context);
  if (!result.success || !context.capabilities.includes('location:correct')) {
    throw new LocationCorrectionWorkspaceError(
      'unauthorized',
      'The actor is not authorized to read Location correction data.',
      result.success
        ? []
        : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
}

function eligibilityIssues(
  candidate: z.infer<typeof candidateDetailResponseSchema>,
): LocationCorrectionWorkspaceResponse['eligibilityIssues'] {
  const issues: LocationCorrectionWorkspaceResponse['eligibilityIssues'] = [];
  if (candidate.candidate.candidateType !== 'physical_place') {
    issues.push('candidate_type_unsupported');
  }
  if (!['new', 'triaged'].includes(candidate.candidate.status)) {
    issues.push('candidate_status_unsupported');
  }
  if (candidate.sources.length === 0) issues.push('candidate_sources_missing');
  if (candidate.sourcesTruncated) issues.push('candidate_sources_truncated');
  if (candidate.candidate.duplicateGroupStatus === 'open') {
    issues.push('candidate_duplicate_review_open');
  }
  return issues;
}

export async function loadLocationCorrectionWorkspace(
  context: LocationCorrectionReadContext,
  candidateBackend: CandidateDetailBackend,
  locationBackend: LocationCorrectionWorkspaceBackend,
  candidateId: string,
  locationId: string,
  asOf = new Date(),
): Promise<LocationCorrectionWorkspaceResponse> {
  authorize(context);
  const candidateIdResult = z.uuid().safeParse(candidateId);
  if (!candidateIdResult.success) {
    throw new LocationCorrectionWorkspaceError(
      'invalid_candidate_id',
      'The Candidate identifier is invalid.',
    );
  }
  const locationIdResult = z.uuid().safeParse(locationId);
  if (!locationIdResult.success) {
    throw new LocationCorrectionWorkspaceError(
      'invalid_location_id',
      'The Location identifier is invalid.',
    );
  }

  try {
    const [candidate, location] = await Promise.all([
      loadCandidateDetail(
        {
          actorId: context.actorId,
          actorType: context.actorType,
          capabilities: ['candidate:read'],
        },
        candidateBackend,
        candidateIdResult.data,
        asOf,
      ),
      locationBackend.loadLocation(locationIdResult.data),
    ]);
    if (location === null) {
      throw new LocationCorrectionWorkspaceError(
        'not_found',
        'The canonical Location was not found.',
      );
    }
    const issues = eligibilityIssues(candidate);
    const result = locationCorrectionWorkspaceResponseSchema.safeParse({
      generatedAt: asOf.toISOString(),
      candidate,
      location,
      eligible: issues.length === 0,
      eligibilityIssues: issues,
    });
    if (!result.success) {
      throw new LocationCorrectionWorkspaceError(
        'invalid_response',
        'Location correction workspace data failed protected response validation.',
        result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      );
    }
    return result.data;
  } catch (error) {
    if (error instanceof LocationCorrectionWorkspaceError) throw error;
    if (error instanceof CandidateDetailError) {
      const code =
        error.code === 'invalid_candidate_id'
          ? 'invalid_candidate_id'
          : error.code === 'not_found'
            ? 'not_found'
            : error.code === 'unauthorized'
              ? 'unauthorized'
              : 'backend_failure';
      throw new LocationCorrectionWorkspaceError(code, error.message, error.issues, {
        cause: error,
      });
    }
    throw new LocationCorrectionWorkspaceError(
      'backend_failure',
      'The Location correction workspace could not be loaded.',
      [],
      { cause: error },
    );
  }
}
