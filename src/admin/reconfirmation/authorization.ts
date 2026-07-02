import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { ReconfirmationExpirationContext } from './expiration';
import type { ReconfirmationReadContext } from './protected-workspace';

export const reconfirmationAuthorizationEnvironmentSchema = z
  .object({
    CPM_ADMIN_RECONFIRMATION_SUBJECTS: z.string().optional(),
  })
  .passthrough();

export type ReconfirmationAuthorizationEnvironment = z.infer<
  typeof reconfirmationAuthorizationEnvironmentSchema
>;

export interface ReconfirmationAuthorizationPolicy {
  configured: boolean;
  allowedSubjects: ReadonlySet<string>;
}

export type ReconfirmationAuthorizationErrorCode =
  | 'configuration'
  | 'identity_missing'
  | 'not_authorized'
  | 'invalid_request_id';

export class ReconfirmationAuthorizationError extends Error {
  readonly code: ReconfirmationAuthorizationErrorCode;

  constructor(code: ReconfirmationAuthorizationErrorCode, message: string) {
    super(message);
    this.name = 'ReconfirmationAuthorizationError';
    this.code = code;
  }
}

function parseSubjects(value: string | undefined): Set<string> {
  if (value === undefined || value.trim().length === 0) return new Set();
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ReconfirmationAuthorizationError(
      'configuration',
      'Reconfirmation subjects must be a JSON array.',
    );
  }
  const result = z.array(z.string().trim().min(1).max(200)).max(100).safeParse(parsed);
  if (!result.success) {
    throw new ReconfirmationAuthorizationError(
      'configuration',
      'Reconfirmation subjects are invalid.',
    );
  }
  return new Set(result.data);
}

export function readReconfirmationAuthorizationPolicy(
  environment: ReconfirmationAuthorizationEnvironment,
): ReconfirmationAuthorizationPolicy {
  const result = reconfirmationAuthorizationEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new ReconfirmationAuthorizationError(
      'configuration',
      'Reconfirmation authorization environment is invalid.',
    );
  }
  const allowedSubjects = parseSubjects(result.data.CPM_ADMIN_RECONFIRMATION_SUBJECTS);
  return { configured: allowedSubjects.size > 0, allowedSubjects };
}

function authorizeIdentity(
  identity: AdminAccessIdentity | null,
  policy: ReconfirmationAuthorizationPolicy,
): AdminAccessIdentity {
  if (!policy.configured) {
    throw new ReconfirmationAuthorizationError(
      'configuration',
      'Reconfirmation review is not configured.',
    );
  }
  if (identity === null) {
    throw new ReconfirmationAuthorizationError(
      'identity_missing',
      'A verified administration identity is required.',
    );
  }
  if (!policy.allowedSubjects.has(identity.subject)) {
    throw new ReconfirmationAuthorizationError(
      'not_authorized',
      'The verified identity is not authorized to review reconfirmation records.',
    );
  }
  return identity;
}

export function authorizeReconfirmationRead(
  identity: AdminAccessIdentity | null,
  policy: ReconfirmationAuthorizationPolicy,
): ReconfirmationReadContext {
  const actor = authorizeIdentity(identity, policy);
  return {
    actorId: actor.actorId,
    actorType: actor.actorType,
    capabilities: ['claim:recheck'],
  };
}

export function authorizeReconfirmationExpiration(
  identity: AdminAccessIdentity | null,
  policy: ReconfirmationAuthorizationPolicy,
  requestId: string | null,
): ReconfirmationExpirationContext {
  const actor = authorizeIdentity(identity, policy);
  const requestIdResult = z.uuid().safeParse(requestId);
  if (!requestIdResult.success) {
    throw new ReconfirmationAuthorizationError(
      'invalid_request_id',
      'A valid Idempotency-Key UUID is required.',
    );
  }
  return {
    requestId: requestIdResult.data,
    actorId: actor.actorId,
    actorType: 'system',
    capabilities: ['claim:expire'],
  };
}
