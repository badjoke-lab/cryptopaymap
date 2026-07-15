import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';

const subjectSchema = z.string().trim().min(1).max(200);
const subjectsSchema = z
  .array(subjectSchema)
  .min(1)
  .max(50)
  .superRefine((subjects, context) => {
    if (new Set(subjects).size !== subjects.length) {
      context.addIssue({
        code: 'custom',
        message: 'Review-entry subject identifiers must be unique.',
      });
    }
  });

export interface SubmissionReviewEntryAuthorizationEnvironment {
  CPM_ADMIN_SUBMISSION_REVIEW_ENTRY_SUBJECTS?: string;
  [key: string]: unknown;
}

export interface SubmissionReviewEntryAuthorizationPolicy {
  subjects: ReadonlySet<string>;
}

export interface SubmissionReviewEntryContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:review-entry'];
}

export class SubmissionReviewEntryAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SubmissionReviewEntryAuthorizationError';
  }
}

export function readSubmissionReviewEntryAuthorizationPolicy(
  environment: SubmissionReviewEntryAuthorizationEnvironment,
): SubmissionReviewEntryAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_SUBMISSION_REVIEW_ENTRY_SUBJECTS;
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new SubmissionReviewEntryAuthorizationError(
      'configuration',
      'Submission review-entry authorization is not configured.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new SubmissionReviewEntryAuthorizationError(
      'configuration',
      'Submission review-entry authorization is invalid.',
      { cause: error },
    );
  }
  const result = subjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new SubmissionReviewEntryAuthorizationError(
      'configuration',
      'Submission review-entry authorization is invalid.',
    );
  }
  return { subjects: new Set(result.data) };
}

export function authorizeSubmissionReviewEntry(
  identity: AdminAccessIdentity,
  policy: SubmissionReviewEntryAuthorizationPolicy,
): SubmissionReviewEntryContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new SubmissionReviewEntryAuthorizationError(
      'denied',
      'The verified administration identity is not authorized for Submission review entry.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:review-entry'],
  };
}
