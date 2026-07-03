import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { ExportPublicationMutationContext } from './publication-contract';

export const exportPublicationAuthorizationEnvironmentSchema = z
  .object({
    CPM_ADMIN_EXPORT_PUBLISH_ACTOR_IDS: z.string().optional(),
  })
  .passthrough();

export type ExportPublicationAuthorizationEnvironment = z.infer<
  typeof exportPublicationAuthorizationEnvironmentSchema
>;

export const exportPublicationActorPolicySchema = z
  .object({
    configured: z.boolean(),
    allowedActorIds: z.set(z.string().trim().min(1).max(200)),
  })
  .strict();

export type ExportPublicationActorPolicy = z.infer<typeof exportPublicationActorPolicySchema>;

export type ExportPublicationAuthorizationErrorCode =
  | 'configuration'
  | 'identity_missing'
  | 'not_authorized'
  | 'invalid_request_id';

export class ExportPublicationAuthorizationError extends Error {
  readonly code: ExportPublicationAuthorizationErrorCode;

  constructor(code: ExportPublicationAuthorizationErrorCode, message: string) {
    super(message);
    this.name = 'ExportPublicationAuthorizationError';
    this.code = code;
  }
}

function parseActorIds(value: string | undefined): Set<string> {
  if (value === undefined || value.trim().length === 0) return new Set();
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ExportPublicationAuthorizationError(
      'configuration',
      'Export publication actor IDs must be a JSON array.',
    );
  }
  const result = z.array(z.string().trim().min(1).max(200)).max(100).safeParse(parsed);
  if (!result.success) {
    throw new ExportPublicationAuthorizationError(
      'configuration',
      'Export publication actor IDs are invalid.',
    );
  }
  return new Set(result.data);
}

export function readExportPublicationAuthorizationPolicy(
  environment: ExportPublicationAuthorizationEnvironment,
): ExportPublicationActorPolicy {
  const result = exportPublicationAuthorizationEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new ExportPublicationAuthorizationError(
      'configuration',
      'Export publication authorization environment is invalid.',
    );
  }
  const allowedActorIds = parseActorIds(result.data.CPM_ADMIN_EXPORT_PUBLISH_ACTOR_IDS);
  return { configured: allowedActorIds.size > 0, allowedActorIds };
}

export function authorizeExportPublication(
  identity: AdminAccessIdentity | null,
  policy: ExportPublicationActorPolicy,
  requestId: string | null,
): ExportPublicationMutationContext {
  const policyResult = exportPublicationActorPolicySchema.safeParse(policy);
  if (!policyResult.success || !policyResult.data.configured) {
    throw new ExportPublicationAuthorizationError(
      'configuration',
      'Export publication authorization is not configured.',
    );
  }
  if (identity === null) {
    throw new ExportPublicationAuthorizationError(
      'identity_missing',
      'A verified administration identity is required.',
    );
  }
  if (!policyResult.data.allowedActorIds.has(identity.actorId)) {
    throw new ExportPublicationAuthorizationError(
      'not_authorized',
      'The verified identity is not authorized to publish exports.',
    );
  }
  const requestIdResult = z.uuid().safeParse(requestId);
  if (!requestIdResult.success) {
    throw new ExportPublicationAuthorizationError(
      'invalid_request_id',
      'A valid Idempotency-Key UUID is required.',
    );
  }
  return {
    requestId: requestIdResult.data,
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['export:publish'],
  };
}
