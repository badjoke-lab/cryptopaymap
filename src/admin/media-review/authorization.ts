import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { MediaReviewMutationContext } from './decision';

export const mediaReviewAuthorizationEnvironmentSchema = z
  .object({
    CPM_ADMIN_MEDIA_REVIEW_ACTOR_IDS: z.string().optional(),
  })
  .passthrough();

export type MediaReviewAuthorizationEnvironment = z.infer<
  typeof mediaReviewAuthorizationEnvironmentSchema
>;

export const mediaReviewActorPolicySchema = z
  .object({
    configured: z.boolean(),
    allowedActorIds: z.set(z.string().trim().min(1).max(200)),
  })
  .strict();

export type MediaReviewActorPolicy = z.infer<typeof mediaReviewActorPolicySchema>;

export type MediaReviewAuthorizationErrorCode =
  | 'configuration'
  | 'identity_missing'
  | 'not_authorized'
  | 'invalid_request_id';

export class MediaReviewAuthorizationError extends Error {
  readonly code: MediaReviewAuthorizationErrorCode;

  constructor(code: MediaReviewAuthorizationErrorCode, message: string) {
    super(message);
    this.name = 'MediaReviewAuthorizationError';
    this.code = code;
  }
}

function parseActorIds(value: string | undefined): Set<string> {
  if (value === undefined || value.trim().length === 0) return new Set();
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new MediaReviewAuthorizationError(
      'configuration',
      'Media review actor IDs must be a JSON array.',
    );
  }
  const result = z.array(z.string().trim().min(1).max(200)).max(100).safeParse(parsed);
  if (!result.success) {
    throw new MediaReviewAuthorizationError('configuration', 'Media review actor IDs are invalid.');
  }
  return new Set(result.data);
}

export function readMediaReviewAuthorizationPolicy(
  environment: MediaReviewAuthorizationEnvironment,
): MediaReviewActorPolicy {
  const result = mediaReviewAuthorizationEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new MediaReviewAuthorizationError(
      'configuration',
      'Media review authorization environment is invalid.',
    );
  }
  const allowedActorIds = parseActorIds(result.data.CPM_ADMIN_MEDIA_REVIEW_ACTOR_IDS);
  return { configured: allowedActorIds.size > 0, allowedActorIds };
}

export function authorizeMediaReview(
  identity: AdminAccessIdentity | null,
  policy: MediaReviewActorPolicy,
  requestId: string | null,
): MediaReviewMutationContext {
  const policyResult = mediaReviewActorPolicySchema.safeParse(policy);
  if (!policyResult.success || !policyResult.data.configured) {
    throw new MediaReviewAuthorizationError('configuration', 'Media review is not configured.');
  }
  if (identity === null) {
    throw new MediaReviewAuthorizationError(
      'identity_missing',
      'A verified administration identity is required.',
    );
  }
  if (!policyResult.data.allowedActorIds.has(identity.actorId)) {
    throw new MediaReviewAuthorizationError(
      'not_authorized',
      'The verified identity is not authorized to review media.',
    );
  }
  const requestIdResult = z.uuid().safeParse(requestId);
  if (!requestIdResult.success) {
    throw new MediaReviewAuthorizationError(
      'invalid_request_id',
      'A valid Idempotency-Key UUID is required.',
    );
  }
  return {
    requestId: requestIdResult.data,
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['media:review'],
  };
}
