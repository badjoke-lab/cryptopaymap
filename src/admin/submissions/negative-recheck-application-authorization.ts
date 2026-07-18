import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { NegativeRecheckApplicationReadContext } from './negative-recheck-application';

const subjectsSchema = z
  .array(z.string().trim().min(1).max(200))
  .min(1)
  .max(50)
  .superRefine((subjects, context) => {
    if (new Set(subjects).size !== subjects.length) {
      context.addIssue({
        code: 'custom',
        message: 'Negative recheck application subjects must be unique.',
      });
    }
  });

export interface NegativeRecheckApplicationAuthorizationEnvironment {
  CPM_ADMIN_NEGATIVE_RECHECK_APPLICATION_SUBJECTS?: string;
  [key: string]: unknown;
}

export interface NegativeRecheckApplicationAuthorizationPolicy {
  subjects: ReadonlySet<string>;
}

export class NegativeRecheckApplicationAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NegativeRecheckApplicationAuthorizationError';
  }
}

export function readNegativeRecheckApplicationAuthorizationPolicy(
  environment: NegativeRecheckApplicationAuthorizationEnvironment,
): NegativeRecheckApplicationAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_NEGATIVE_RECHECK_APPLICATION_SUBJECTS;
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new NegativeRecheckApplicationAuthorizationError(
      'configuration',
      'Negative recheck application authorization is not configured.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new NegativeRecheckApplicationAuthorizationError(
      'configuration',
      'Negative recheck application authorization is invalid.',
      { cause: error },
    );
  }
  const result = subjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new NegativeRecheckApplicationAuthorizationError(
      'configuration',
      'Negative recheck application authorization is invalid.',
    );
  }
  return { subjects: new Set(result.data) };
}

export function authorizeNegativeRecheckApplicationRead(
  identity: AdminAccessIdentity,
  policy: NegativeRecheckApplicationAuthorizationPolicy,
): NegativeRecheckApplicationReadContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new NegativeRecheckApplicationAuthorizationError(
      'denied',
      'The verified administration identity is not authorized to read negative recheck application state.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:negative-recheck-application:read'],
  };
}
