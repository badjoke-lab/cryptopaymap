import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type {
  SubmissionApplicationLifecycleReadContext,
  SubmissionApplicationLifecycleTransitionContext,
} from './application-lifecycle';

const subjectsSchema = z
  .array(z.string().trim().min(1).max(200))
  .min(1)
  .max(50)
  .superRefine((subjects, context) => {
    if (new Set(subjects).size !== subjects.length) {
      context.addIssue({
        code: 'custom',
        message: 'Submission application lifecycle subjects must be unique.',
      });
    }
  });

export interface SubmissionApplicationLifecycleAuthorizationEnvironment {
  CPM_ADMIN_SUBMISSION_APPLICATION_READ_SUBJECTS?: string;
  CPM_ADMIN_SUBMISSION_APPLICATION_TRANSITION_SUBJECTS?: string;
  [key: string]: unknown;
}

export interface SubmissionApplicationLifecycleAuthorizationPolicy {
  readSubjects: ReadonlySet<string>;
  transitionSubjects: ReadonlySet<string>;
}

export class SubmissionApplicationLifecycleAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SubmissionApplicationLifecycleAuthorizationError';
  }
}

function parseSubjects(serialized: string | undefined, label: string): ReadonlySet<string> {
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new SubmissionApplicationLifecycleAuthorizationError(
      'configuration',
      `${label} authorization is not configured.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new SubmissionApplicationLifecycleAuthorizationError(
      'configuration',
      `${label} authorization is invalid.`,
      { cause: error },
    );
  }
  const result = subjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new SubmissionApplicationLifecycleAuthorizationError(
      'configuration',
      `${label} authorization is invalid.`,
    );
  }
  return new Set(result.data);
}

export function readSubmissionApplicationLifecycleAuthorizationPolicy(
  environment: SubmissionApplicationLifecycleAuthorizationEnvironment,
): SubmissionApplicationLifecycleAuthorizationPolicy {
  return {
    readSubjects: parseSubjects(
      environment.CPM_ADMIN_SUBMISSION_APPLICATION_READ_SUBJECTS,
      'Submission application read',
    ),
    transitionSubjects: parseSubjects(
      environment.CPM_ADMIN_SUBMISSION_APPLICATION_TRANSITION_SUBJECTS,
      'Submission application transition',
    ),
  };
}

export function authorizeSubmissionApplicationLifecycleRead(
  identity: AdminAccessIdentity,
  policy: SubmissionApplicationLifecycleAuthorizationPolicy,
): SubmissionApplicationLifecycleReadContext {
  if (!policy.readSubjects.has(identity.subject)) {
    throw new SubmissionApplicationLifecycleAuthorizationError(
      'denied',
      'The verified administration identity is not authorized to read application lifecycle state.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:application:read'],
  };
}

export function authorizeSubmissionApplicationLifecycleTransition(
  identity: AdminAccessIdentity,
  policy: SubmissionApplicationLifecycleAuthorizationPolicy,
): SubmissionApplicationLifecycleTransitionContext {
  if (!policy.transitionSubjects.has(identity.subject)) {
    throw new SubmissionApplicationLifecycleAuthorizationError(
      'denied',
      'The verified administration identity is not authorized to transition application lifecycle state.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:application:transition'],
  };
}
