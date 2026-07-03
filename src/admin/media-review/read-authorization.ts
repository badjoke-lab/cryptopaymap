import type { AdminAccessIdentity } from '../access/identity';
import { MediaReviewAuthorizationError, type MediaReviewActorPolicy } from './authorization';
import type { MediaReviewReadContext } from './workspace';

export function authorizeMediaReviewRead(
  identity: AdminAccessIdentity | null,
  policy: MediaReviewActorPolicy,
): MediaReviewReadContext {
  if (!policy.configured) {
    throw new MediaReviewAuthorizationError('configuration', 'Media review is not configured.');
  }
  if (identity === null) {
    throw new MediaReviewAuthorizationError(
      'identity_missing',
      'A verified administration identity is required.',
    );
  }
  if (!policy.allowedActorIds.has(identity.actorId)) {
    throw new MediaReviewAuthorizationError(
      'not_authorized',
      'The verified identity is not authorized to review media.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['media:review'],
  };
}
