import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { LocationCorrectionMutationContext } from './decision';
import type { LocationCorrectionReadContext } from './workspace';

export const locationCorrectionAuthorizationEnvironmentSchema = z
  .object({
    CPM_ADMIN_LOCATION_CORRECT_SUBJECTS: z.string().optional(),
  })
  .passthrough();

export type LocationCorrectionAuthorizationEnvironment = z.infer<
  typeof locationCorrectionAuthorizationEnvironmentSchema
>;

export interface LocationCorrectionAuthorizationPolicy {
  configured: boolean;
  allowedSubjects: ReadonlySet<string>;
}

export type LocationCorrectionAuthorizationErrorCode =
  | 'configuration'
  | 'identity_missing'
  | 'not_authorized'
  | 'invalid_request_id';

export class LocationCorrectionAuthorizationError extends Error {
  readonly code: LocationCorrectionAuthorizationErrorCode;

  constructor(code: LocationCorrectionAuthorizationErrorCode, message: string) {
    super(message);
    this.name = 'LocationCorrectionAuthorizationError';
    this.code = code;
  }
}

function parseSubjects(value: string | undefined): Set<string> {
  if (value === undefined || value.trim().length === 0) return new Set();
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new LocationCorrectionAuthorizationError(
      'configuration',
      'Location correction subjects must be a JSON array.',
    );
  }
  const result = z.array(z.string().trim().min(1).max(200)).max(100).safeParse(parsed);
  if (!result.success) {
    throw new LocationCorrectionAuthorizationError(
      'configuration',
      'Location correction subjects are invalid.',
    );
  }
  return new Set(result.data);
}

export function readLocationCorrectionAuthorizationPolicy(
  environment: LocationCorrectionAuthorizationEnvironment,
): LocationCorrectionAuthorizationPolicy {
  const result = locationCorrectionAuthorizationEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new LocationCorrectionAuthorizationError(
      'configuration',
      'Location correction authorization environment is invalid.',
    );
  }
  const allowedSubjects = parseSubjects(result.data.CPM_ADMIN_LOCATION_CORRECT_SUBJECTS);
  return { configured: allowedSubjects.size > 0, allowedSubjects };
}

function assertAuthorized(
  identity: AdminAccessIdentity | null,
  policy: LocationCorrectionAuthorizationPolicy,
): AdminAccessIdentity {
  if (!policy.configured) {
    throw new LocationCorrectionAuthorizationError(
      'configuration',
      'Location correction is not configured.',
    );
  }
  if (identity === null) {
    throw new LocationCorrectionAuthorizationError(
      'identity_missing',
      'A verified administration identity is required.',
    );
  }
  if (!policy.allowedSubjects.has(identity.subject)) {
    throw new LocationCorrectionAuthorizationError(
      'not_authorized',
      'The verified identity is not authorized to correct Location profiles.',
    );
  }
  return identity;
}

export function authorizeLocationCorrectionRead(
  identity: AdminAccessIdentity | null,
  policy: LocationCorrectionAuthorizationPolicy,
): LocationCorrectionReadContext {
  const authorized = assertAuthorized(identity, policy);
  return {
    actorId: authorized.actorId,
    actorType: authorized.actorType,
    capabilities: ['location:correct'],
  };
}

export function authorizeLocationCorrection(
  identity: AdminAccessIdentity | null,
  policy: LocationCorrectionAuthorizationPolicy,
  requestId: string | null,
): LocationCorrectionMutationContext {
  const authorized = assertAuthorized(identity, policy);
  const requestIdResult = z.uuid().safeParse(requestId);
  if (!requestIdResult.success) {
    throw new LocationCorrectionAuthorizationError(
      'invalid_request_id',
      'A valid Idempotency-Key UUID is required.',
    );
  }
  return {
    requestId: requestIdResult.data,
    actorId: authorized.actorId,
    actorType: authorized.actorType,
    capabilities: ['location:correct'],
  };
}
