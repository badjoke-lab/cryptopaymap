import type { AdminAccessIdentity } from '../access/identity';
import { ExportReleaseAuthorizationError, type ExportReleaseActorPolicy } from './authorization';
import type { ExportReleaseReadContext } from './workspace';

export function authorizeExportReleaseRead(
  identity: AdminAccessIdentity | null,
  policy: ExportReleaseActorPolicy,
): ExportReleaseReadContext {
  if (!policy.configured) {
    throw new ExportReleaseAuthorizationError(
      'configuration',
      'Export release authorization is not configured.',
    );
  }
  if (identity === null) {
    throw new ExportReleaseAuthorizationError(
      'identity_missing',
      'A verified administration identity is required.',
    );
  }
  if (!policy.allowedActorIds.has(identity.actorId)) {
    throw new ExportReleaseAuthorizationError(
      'not_authorized',
      'The verified identity is not authorized to read export releases.',
    );
  }

  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['export:release'],
  };
}
