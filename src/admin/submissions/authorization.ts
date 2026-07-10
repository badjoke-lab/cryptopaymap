import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';

const submissionSubjectSchema = z.string().trim().min(1).max(200);
const submissionSubjectsSchema = z
  .array(submissionSubjectSchema)
  .min(1)
  .max(50)
  .superRefine((subjects, context) => {
    if (new Set(subjects).size !== subjects.length) {
      context.addIssue({
        code: 'custom',
        message: 'Submission reviewer subject identifiers must be unique.',
      });
    }
  });

export interface SubmissionReviewAuthorizationEnvironment {
  CPM_ADMIN_SUBMISSION_SUBJECTS?: string;
  [key: string]: unknown;
}

export interface SubmissionReviewAuthorizationPolicy {
  subjects: ReadonlySet<string>;
}

export interface SubmissionReviewContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:read'];
}

export class SubmissionReviewAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SubmissionReviewAuthorizationError';
  }
}

export function readSubmissionReviewAuthorizationPolicy(
  environment: SubmissionReviewAuthorizationEnvironment,
): SubmissionReviewAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_SUBMISSION_SUBJECTS;
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new SubmissionReviewAuthorizationError(
      'configuration',
      'Submission review authorization is not configured.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new SubmissionReviewAuthorizationError(
      'configuration',
      'Submission review authorization is invalid.',
      { cause: error },
    );
  }

  const result = submissionSubjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new SubmissionReviewAuthorizationError(
      'configuration',
      'Submission review authorization is invalid.',
    );
  }
  return { subjects: new Set(result.data) };
}

export function authorizeSubmissionReviewRead(
  identity: AdminAccessIdentity,
  policy: SubmissionReviewAuthorizationPolicy,
): SubmissionReviewContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new SubmissionReviewAuthorizationError(
      'denied',
      'The verified administration identity is not authorized for Submission review.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:read'],
  };
}
