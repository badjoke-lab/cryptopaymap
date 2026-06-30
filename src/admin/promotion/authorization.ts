import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { CandidatePromotionMutationContext } from './candidate-promotion';

export const candidatePromotionAuthorizationEnvironmentSchema = z
  .object({
    CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS: z.string().optional(),
  })
  .passthrough();

export type CandidatePromotionAuthorizationEnvironment = z.infer<
  typeof candidatePromotionAuthorizationEnvironmentSchema
>;

export interface CandidatePromotionAuthorizationPolicy {
  configured: boolean;
  allowedSubjects: ReadonlySet<string>;
}

export type CandidatePromotionAuthorizationErrorCode =
  | 'configuration'
  | 'identity_missing'
  | 'not_authorized'
  | 'invalid_request_id';

export class CandidatePromotionAuthorizationError extends Error {
  readonly code: CandidatePromotionAuthorizationErrorCode;

  constructor(code: CandidatePromotionAuthorizationErrorCode, message: string) {
    super(message);
    this.name = 'CandidatePromotionAuthorizationError';
    this.code = code;
  }
}

function parseSubjects(value: string | undefined): Set<string> {
  if (value === undefined || value.trim().length === 0) return new Set();

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new CandidatePromotionAuthorizationError(
      'configuration',
      'Candidate promotion subjects must be a JSON array.',
    );
  }

  const result = z.array(z.string().trim().min(1).max(200)).max(100).safeParse(parsed);
  if (!result.success) {
    throw new CandidatePromotionAuthorizationError(
      'configuration',
      'Candidate promotion subjects are invalid.',
    );
  }
  return new Set(result.data);
}

export function readCandidatePromotionAuthorizationPolicy(
  environment: CandidatePromotionAuthorizationEnvironment,
): CandidatePromotionAuthorizationPolicy {
  const result = candidatePromotionAuthorizationEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new CandidatePromotionAuthorizationError(
      'configuration',
      'Candidate promotion authorization environment is invalid.',
    );
  }
  const allowedSubjects = parseSubjects(result.data.CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS);
  return { configured: allowedSubjects.size > 0, allowedSubjects };
}

export function authorizeCandidatePromotion(
  identity: AdminAccessIdentity | null,
  policy: CandidatePromotionAuthorizationPolicy,
  requestId: string | null,
): CandidatePromotionMutationContext {
  if (!policy.configured) {
    throw new CandidatePromotionAuthorizationError(
      'configuration',
      'Candidate promotion is not configured.',
    );
  }
  if (identity === null) {
    throw new CandidatePromotionAuthorizationError(
      'identity_missing',
      'A verified administration identity is required.',
    );
  }
  if (!policy.allowedSubjects.has(identity.subject)) {
    throw new CandidatePromotionAuthorizationError(
      'not_authorized',
      'The verified identity is not authorized to promote Candidates.',
    );
  }
  const requestIdResult = z.uuid().safeParse(requestId);
  if (!requestIdResult.success) {
    throw new CandidatePromotionAuthorizationError(
      'invalid_request_id',
      'A valid Idempotency-Key UUID is required.',
    );
  }

  return {
    requestId: requestIdResult.data,
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['candidate:promote'],
  };
}
