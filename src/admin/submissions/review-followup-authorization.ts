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
        message: 'Review follow-up subject identifiers must be unique.',
      });
    }
  });

export interface SubmissionReviewFollowupAuthorizationEnvironment {
  CPM_ADMIN_SUBMISSION_REVIEW_FOLLOWUP_SUBJECTS?: string;
  [key: string]: unknown;
}

export interface SubmissionReviewFollowupAuthorizationPolicy {
  subjects: ReadonlySet<string>;
}

export interface SubmissionReviewFollowupContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:review-followup'];
}

export class SubmissionReviewFollowupAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SubmissionReviewFollowupAuthorizationError';
  }
}

export function readSubmissionReviewFollowupAuthorizationPolicy(
  environment: SubmissionReviewFollowupAuthorizationEnvironment,
): SubmissionReviewFollowupAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_SUBMISSION_REVIEW_FOLLOWUP_SUBJECTS;
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new SubmissionReviewFollowupAuthorizationError(
      'configuration',
      'Submission review follow-up authorization is not configured.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new SubmissionReviewFollowupAuthorizationError(
      'configuration',
      'Submission review follow-up authorization is invalid.',
      { cause: error },
    );
  }
  const result = subjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new SubmissionReviewFollowupAuthorizationError(
      'configuration',
      'Submission review follow-up authorization is invalid.',
    );
  }
  return { subjects: new Set(result.data) };
}

export function authorizeSubmissionReviewFollowup(
  identity: AdminAccessIdentity,
  policy: SubmissionReviewFollowupAuthorizationPolicy,
): SubmissionReviewFollowupContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new SubmissionReviewFollowupAuthorizationError(
      'denied',
      'The verified administration identity is not authorized for Submission review follow-up.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:review-followup'],
  };
}
