import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { EvidenceReviewMutationContext } from './decision';

export const evidenceReviewAuthorizationEnvironmentSchema = z
  .object({
    CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS: z.string().optional(),
  })
  .passthrough();

export type EvidenceReviewAuthorizationEnvironment = z.infer<
  typeof evidenceReviewAuthorizationEnvironmentSchema
>;

export interface EvidenceReviewAuthorizationPolicy {
  configured: boolean;
  allowedSubjects: ReadonlySet<string>;
}

export type EvidenceReviewAuthorizationErrorCode =
  | 'configuration'
  | 'identity_missing'
  | 'not_authorized'
  | 'invalid_request_id';

export class EvidenceReviewAuthorizationError extends Error {
  readonly code: EvidenceReviewAuthorizationErrorCode;

  constructor(code: EvidenceReviewAuthorizationErrorCode, message: string) {
    super(message);
    this.name = 'EvidenceReviewAuthorizationError';
    this.code = code;
  }
}

function parseSubjects(value: string | undefined): Set<string> {
  if (value === undefined || value.trim().length === 0) return new Set();
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new EvidenceReviewAuthorizationError(
      'configuration',
      'Evidence review subjects must be a JSON array.',
    );
  }
  const result = z.array(z.string().trim().min(1).max(200)).max(100).safeParse(parsed);
  if (!result.success) {
    throw new EvidenceReviewAuthorizationError(
      'configuration',
      'Evidence review subjects are invalid.',
    );
  }
  return new Set(result.data);
}

export function readEvidenceReviewAuthorizationPolicy(
  environment: EvidenceReviewAuthorizationEnvironment,
): EvidenceReviewAuthorizationPolicy {
  const result = evidenceReviewAuthorizationEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new EvidenceReviewAuthorizationError(
      'configuration',
      'Evidence review authorization environment is invalid.',
    );
  }
  const allowedSubjects = parseSubjects(result.data.CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS);
  return { configured: allowedSubjects.size > 0, allowedSubjects };
}

export function authorizeEvidenceReview(
  identity: AdminAccessIdentity | null,
  policy: EvidenceReviewAuthorizationPolicy,
  requestId: string | null,
): EvidenceReviewMutationContext {
  if (!policy.configured) {
    throw new EvidenceReviewAuthorizationError(
      'configuration',
      'Evidence review is not configured.',
    );
  }
  if (identity === null) {
    throw new EvidenceReviewAuthorizationError(
      'identity_missing',
      'A verified administration identity is required.',
    );
  }
  if (!policy.allowedSubjects.has(identity.subject)) {
    throw new EvidenceReviewAuthorizationError(
      'not_authorized',
      'The verified identity is not authorized to review Evidence.',
    );
  }
  const requestIdResult = z.uuid().safeParse(requestId);
  if (!requestIdResult.success) {
    throw new EvidenceReviewAuthorizationError(
      'invalid_request_id',
      'A valid Idempotency-Key UUID is required.',
    );
  }
  return {
    requestId: requestIdResult.data,
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['evidence:review'],
  };
}
