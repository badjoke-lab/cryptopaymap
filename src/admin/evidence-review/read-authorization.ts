import type { AdminAccessIdentity } from '../access/identity';
import {
  EvidenceReviewAuthorizationError,
  type EvidenceReviewAuthorizationPolicy,
} from './authorization';
import type { EvidenceReviewReadContext } from './workspace';

export function authorizeEvidenceReviewRead(
  identity: AdminAccessIdentity | null,
  policy: EvidenceReviewAuthorizationPolicy,
): EvidenceReviewReadContext {
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
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['evidence:review'],
  };
}
