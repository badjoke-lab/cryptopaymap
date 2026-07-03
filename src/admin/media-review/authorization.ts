import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { MediaReviewMutationContext } from './decision';

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
