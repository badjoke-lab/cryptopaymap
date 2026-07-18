import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { SuggestApplicationBindingContext } from './suggest-application-binding';

const subjectsSchema = z
  .array(z.string().trim().min(1).max(200))
  .min(1)
  .max(50)
  .superRefine((subjects, context) => {
    if (new Set(subjects).size !== subjects.length) {
      context.addIssue({
        code: 'custom',
        message: 'Suggest application-binding subjects must be unique.',
      });
    }
  });

export interface SuggestApplicationBindingAuthorizationEnvironment {
  CPM_ADMIN_SUGGEST_APPLICATION_BINDING_SUBJECTS?: string;
  [key: string]: unknown;
}

export interface SuggestApplicationBindingAuthorizationPolicy {
  subjects: ReadonlySet<string>;
}

export class SuggestApplicationBindingAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SuggestApplicationBindingAuthorizationError';
  }
}

export function readSuggestApplicationBindingAuthorizationPolicy(
  environment: SuggestApplicationBindingAuthorizationEnvironment,
): SuggestApplicationBindingAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_SUGGEST_APPLICATION_BINDING_SUBJECTS;
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new SuggestApplicationBindingAuthorizationError(
      'configuration',
      'Suggest application-binding authorization is not configured.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new SuggestApplicationBindingAuthorizationError(
      'configuration',
      'Suggest application-binding authorization is invalid.',
      { cause: error },
    );
  }
  const result = subjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new SuggestApplicationBindingAuthorizationError(
      'configuration',
      'Suggest application-binding authorization is invalid.',
    );
  }
  return { subjects: new Set(result.data) };
}

export function authorizeSuggestApplicationBinding(
  identity: AdminAccessIdentity,
  policy: SuggestApplicationBindingAuthorizationPolicy,
): SuggestApplicationBindingContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new SuggestApplicationBindingAuthorizationError(
      'denied',
      'The verified administration identity is not authorized to bind Suggest application receipts.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:suggest-application:bind'],
  };
}
