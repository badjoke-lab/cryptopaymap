import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { SubmissionApplicationRegistrationContext } from './application-registration';

const subjectsSchema = z
  .array(z.string().trim().min(1).max(200))
  .min(1)
  .max(50)
  .superRefine((subjects, context) => {
    if (new Set(subjects).size !== subjects.length) {
      context.addIssue({
        code: 'custom',
        message: 'Submission application-registration subjects must be unique.',
      });
    }
  });

export interface SubmissionApplicationRegistrationAuthorizationEnvironment {
  CPM_ADMIN_SUBMISSION_APPLICATION_REGISTRATION_SUBJECTS?: string;
  [key: string]: unknown;
}

export interface SubmissionApplicationRegistrationAuthorizationPolicy {
  subjects: ReadonlySet<string>;
}

export class SubmissionApplicationRegistrationAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SubmissionApplicationRegistrationAuthorizationError';
  }
}

export function readSubmissionApplicationRegistrationAuthorizationPolicy(
  environment: SubmissionApplicationRegistrationAuthorizationEnvironment,
): SubmissionApplicationRegistrationAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_SUBMISSION_APPLICATION_REGISTRATION_SUBJECTS;
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new SubmissionApplicationRegistrationAuthorizationError(
      'configuration',
      'Submission application-registration authorization is not configured.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new SubmissionApplicationRegistrationAuthorizationError(
      'configuration',
      'Submission application-registration authorization is invalid.',
      { cause: error },
    );
  }
  const result = subjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new SubmissionApplicationRegistrationAuthorizationError(
      'configuration',
      'Submission application-registration authorization is invalid.',
    );
  }
  return { subjects: new Set(result.data) };
}

export function authorizeSubmissionApplicationRegistration(
  identity: AdminAccessIdentity,
  policy: SubmissionApplicationRegistrationAuthorizationPolicy,
): SubmissionApplicationRegistrationContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new SubmissionApplicationRegistrationAuthorizationError(
      'denied',
      'The verified administration identity is not authorized for application registration.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:application:register'],
  };
}
