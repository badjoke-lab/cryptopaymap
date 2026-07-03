import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { ExportReleaseMutationContext } from './decision';

export const exportReleaseAuthorizationEnvironmentSchema = z
  .object({
    CPM_ADMIN_EXPORT_RELEASE_ACTOR_IDS: z.string().optional(),
  })
  .passthrough();

export type ExportReleaseAuthorizationEnvironment = z.infer<
  typeof exportReleaseAuthorizationEnvironmentSchema
>;

export const exportReleaseActorPolicySchema = z
  .object({
    configured: z.boolean(),
    allowedActorIds: z.set(z.string().trim().min(1).max(200)),
  })
  .strict();

export type ExportReleaseActorPolicy = z.infer<typeof exportReleaseActorPolicySchema>;

export type ExportReleaseAuthorizationErrorCode =
  | 'configuration'
  | 'identity_missing'
  | 'not_authorized'
  | 'invalid_request_id';

export class ExportReleaseAuthorizationError extends Error {
  readonly code: ExportReleaseAuthorizationErrorCode;

  constructor(code: ExportReleaseAuthorizationErrorCode, message: string) {
    super(message);
    this.name = 'ExportReleaseAuthorizationError';
    this.code = code;
  }
}

function parseActorIds(value: string | undefined): Set<string> {
  if (value === undefined || value.trim().length === 0) return new Set();

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ExportReleaseAuthorizationError(
      'configuration',
      'Export release actor IDs must be a JSON array.',
    );
  }

  const result = z.array(z.string().trim().min(1).max(200)).max(100).safeParse(parsed);
  if (!result.success) {
    throw new ExportReleaseAuthorizationError(
      'configuration',
      'Export release actor IDs are invalid.',
    );
  }
  return new Set(result.data);
}

export function readExportReleaseAuthorizationPolicy(
  environment: ExportReleaseAuthorizationEnvironment,
): ExportReleaseActorPolicy {
  const result = exportReleaseAuthorizationEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new ExportReleaseAuthorizationError(
      'configuration',
      'Export release authorization environment is invalid.',
    );
  }

  const allowedActorIds = parseActorIds(result.data.CPM_ADMIN_EXPORT_RELEASE_ACTOR_IDS);
  return { configured: allowedActorIds.size > 0, allowedActorIds };
}

export function authorizeExportRelease(
  identity: AdminAccessIdentity | null,
  policy: ExportReleaseActorPolicy,
  requestId: string | null,
): ExportReleaseMutationContext {
  const policyResult = exportReleaseActorPolicySchema.safeParse(policy);
  if (!policyResult.success || !policyResult.data.configured) {
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
  if (!policyResult.data.allowedActorIds.has(identity.actorId)) {
    throw new ExportReleaseAuthorizationError(
      'not_authorized',
      'The verified identity is not authorized to release exports.',
    );
  }

  const requestIdResult = z.uuid().safeParse(requestId);
  if (!requestIdResult.success) {
    throw new ExportReleaseAuthorizationError(
      'invalid_request_id',
      'A valid Idempotency-Key UUID is required.',
    );
  }

  return {
    requestId: requestIdResult.data,
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['export:release'],
  };
}
