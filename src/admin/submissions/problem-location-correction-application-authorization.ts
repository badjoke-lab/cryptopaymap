import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { ProblemLocationCorrectionApplicationContext } from './problem-location-correction-application';

const subjectsSchema = z
  .array(z.string().trim().min(1).max(200))
  .min(1)
  .max(50)
  .superRefine((subjects, context) => {
    if (new Set(subjects).size !== subjects.length) {
      context.addIssue({
        code: 'custom',
        message: 'Problem Location correction application subjects must be unique.',
      });
    }
  });

export interface ProblemLocationCorrectionApplicationAuthorizationEnvironment {
  CPM_ADMIN_PROBLEM_LOCATION_CORRECTION_SUBJECTS?: string;
  [key: string]: unknown;
}

export interface ProblemLocationCorrectionApplicationAuthorizationPolicy {
  subjects: ReadonlySet<string>;
}

export class ProblemLocationCorrectionApplicationAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProblemLocationCorrectionApplicationAuthorizationError';
  }
}

export function readProblemLocationCorrectionApplicationAuthorizationPolicy(
  environment: ProblemLocationCorrectionApplicationAuthorizationEnvironment,
): ProblemLocationCorrectionApplicationAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_PROBLEM_LOCATION_CORRECTION_SUBJECTS;
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new ProblemLocationCorrectionApplicationAuthorizationError(
      'configuration',
      'Problem Location correction application authorization is not configured.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new ProblemLocationCorrectionApplicationAuthorizationError(
      'configuration',
      'Problem Location correction application authorization is invalid.',
      { cause: error },
    );
  }
  const result = subjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new ProblemLocationCorrectionApplicationAuthorizationError(
      'configuration',
      'Problem Location correction application authorization is invalid.',
    );
  }
  return { subjects: new Set(result.data) };
}

export function authorizeProblemLocationCorrectionApplication(
  identity: AdminAccessIdentity,
  policy: ProblemLocationCorrectionApplicationAuthorizationPolicy,
): ProblemLocationCorrectionApplicationContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new ProblemLocationCorrectionApplicationAuthorizationError(
      'denied',
      'The verified administration identity is not authorized to apply problem Location corrections.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:problem-location-correction:apply'],
  };
}
