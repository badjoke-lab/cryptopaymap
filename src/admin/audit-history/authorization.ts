import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { AuditHistoryReadContext } from './contract';

export const auditHistoryAuthorizationEnvironmentSchema = z
  .object({
    CPM_ADMIN_AUDIT_READ_ACTOR_IDS: z.string().optional(),
  })
  .passthrough();

export type AuditHistoryAuthorizationEnvironment = z.infer<
  typeof auditHistoryAuthorizationEnvironmentSchema
>;

export const auditHistoryActorPolicySchema = z
  .object({
    configured: z.boolean(),
    allowedActorIds: z.set(z.string().trim().min(1).max(200)),
  })
  .strict();

export type AuditHistoryActorPolicy = z.infer<typeof auditHistoryActorPolicySchema>;

export type AuditHistoryAuthorizationErrorCode =
  | 'configuration'
  | 'identity_missing'
  | 'not_authorized';

export class AuditHistoryAuthorizationError extends Error {
  readonly code: AuditHistoryAuthorizationErrorCode;

  constructor(code: AuditHistoryAuthorizationErrorCode, message: string) {
    super(message);
    this.name = 'AuditHistoryAuthorizationError';
    this.code = code;
  }
}

function parseActorIds(value: string | undefined): Set<string> {
  if (value === undefined || value.trim().length === 0) return new Set();

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new AuditHistoryAuthorizationError(
      'configuration',
      'Audit history actor IDs must be a JSON array.',
    );
  }

  const result = z.array(z.string().trim().min(1).max(200)).max(100).safeParse(parsed);
  if (!result.success) {
    throw new AuditHistoryAuthorizationError(
      'configuration',
      'Audit history actor IDs are invalid.',
    );
  }
  return new Set(result.data);
}

export function readAuditHistoryAuthorizationPolicy(
  environment: AuditHistoryAuthorizationEnvironment,
): AuditHistoryActorPolicy {
  const result = auditHistoryAuthorizationEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new AuditHistoryAuthorizationError(
      'configuration',
      'Audit history authorization environment is invalid.',
    );
  }

  const allowedActorIds = parseActorIds(result.data.CPM_ADMIN_AUDIT_READ_ACTOR_IDS);
  return { configured: allowedActorIds.size > 0, allowedActorIds };
}

export function authorizeAuditHistoryRead(
  identity: AdminAccessIdentity | null,
  policy: AuditHistoryActorPolicy,
): AuditHistoryReadContext {
  const policyResult = auditHistoryActorPolicySchema.safeParse(policy);
  if (!policyResult.success || !policyResult.data.configured) {
    throw new AuditHistoryAuthorizationError(
      'configuration',
      'Audit history authorization is not configured.',
    );
  }
  if (identity === null) {
    throw new AuditHistoryAuthorizationError(
      'identity_missing',
      'A verified administration identity is required.',
    );
  }
  if (!policyResult.data.allowedActorIds.has(identity.actorId)) {
    throw new AuditHistoryAuthorizationError(
      'not_authorized',
      'The verified identity is not authorized to read audit history.',
    );
  }

  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['audit:read'],
  };
}
