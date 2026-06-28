import { z } from 'zod';
import type { ProtectedAdminIdentity } from '../dashboard/identity-context';
import type { CandidateDuplicateMutationContext } from './duplicate-decision';

export const candidateDuplicateAuthorizationEnvironmentSchema = z
  .object({
    CPM_ADMIN_CANDIDATE_RESOLVE_SUBJECTS: z.string().optional(),
  })
  .passthrough();

export type CandidateDuplicateAuthorizationEnvironment = z.infer<
  typeof candidateDuplicateAuthorizationEnvironmentSchema
>;

export interface CandidateDuplicateAuthorizationPolicy {
  configured: boolean;
  allowedSubjects: ReadonlySet<string>;
}

export type CandidateDuplicateAuthorizationErrorCode =
  | 'configuration'
  | 'identity_missing'
  | 'not_authorized'
  | 'invalid_request_id';

export class CandidateDuplicateAuthorizationError extends Error {
  readonly code: CandidateDuplicateAuthorizationErrorCode;

  constructor(code: CandidateDuplicateAuthorizationErrorCode, message: string) {
    super(message);
    this.name = 'CandidateDuplicateAuthorizationError';
    this.code = code;
  }
}

function parseSubjects(value: string | undefined): Set<string> {
  if (value === undefined || value.trim().length === 0) return new Set();

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new CandidateDuplicateAuthorizationError(
      'configuration',
      'Candidate duplicate resolve subjects must be a JSON array.',
    );
  }

  const result = z.array(z.string().trim().min(1).max(200)).max(100).safeParse(parsed);
  if (!result.success) {
    throw new CandidateDuplicateAuthorizationError(
      'configuration',
      'Candidate duplicate resolve subjects are invalid.',
    );
  }
  return new Set(result.data);
}

export function readCandidateDuplicateAuthorizationPolicy(
  environment: CandidateDuplicateAuthorizationEnvironment,
): CandidateDuplicateAuthorizationPolicy {
  const result = candidateDuplicateAuthorizationEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new CandidateDuplicateAuthorizationError(
      'configuration',
      'Candidate duplicate authorization environment is invalid.',
    );
  }
  const allowedSubjects = parseSubjects(result.data.CPM_ADMIN_CANDIDATE_RESOLVE_SUBJECTS);
  return {
    configured: allowedSubjects.size > 0,
    allowedSubjects,
  };
}

export function authorizeCandidateDuplicateResolve(
  identity: ProtectedAdminIdentity | null,
  policy: CandidateDuplicateAuthorizationPolicy,
  requestId: string | null,
): CandidateDuplicateMutationContext {
  if (!policy.configured) {
    throw new CandidateDuplicateAuthorizationError(
      'configuration',
      'Candidate duplicate resolution is not configured.',
    );
  }
  if (identity === null) {
    throw new CandidateDuplicateAuthorizationError(
      'identity_missing',
      'A verified administration identity is required.',
    );
  }
  if (!policy.allowedSubjects.has(identity.subject)) {
    throw new CandidateDuplicateAuthorizationError(
      'not_authorized',
      'The verified identity is not authorized to resolve Candidate duplicates.',
    );
  }
  const requestIdResult = z.uuid().safeParse(requestId);
  if (!requestIdResult.success) {
    throw new CandidateDuplicateAuthorizationError(
      'invalid_request_id',
      'A valid Idempotency-Key UUID is required.',
    );
  }

  return {
    requestId: requestIdResult.data,
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['candidate:resolve'],
  };
}
