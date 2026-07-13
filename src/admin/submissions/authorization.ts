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
  CPM_ADMIN_SUBMISSION_TRANSITION_SUBJECTS?: string;
  CPM_ADMIN_SUBMISSION_CANDIDATE_SUBJECTS?: string;
  CPM_ADMIN_PAYMENT_EVIDENCE_SUBJECTS?: string;
  CPM_ADMIN_NEGATIVE_EVIDENCE_SUBJECTS?: string;
  CPM_ADMIN_PROBLEM_DECISION_SUBJECTS?: string;
  CPM_ADMIN_URGENT_VISIBILITY_SUBJECTS?: string;
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

export interface SubmissionTransitionContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:transition'];
}

export interface SubmissionCandidateCreateContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:candidate:create'];
}

export interface PaymentReportEvidenceDecisionContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:payment-evidence:decide'];
}

export interface NegativeReportEvidenceDecisionContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:negative-evidence:decide'];
}

export type ProblemReportMutationCapability =
  | 'submission:problem:decide'
  | 'submission:urgent-visibility:decide';

export interface ProblemReportMutationContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ProblemReportMutationCapability[];
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

function readSubjectPolicy(
  serialized: string | undefined,
  capabilityLabel: string,
): SubmissionReviewAuthorizationPolicy {
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new SubmissionReviewAuthorizationError(
      'configuration',
      `${capabilityLabel} authorization is not configured.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new SubmissionReviewAuthorizationError(
      'configuration',
      `${capabilityLabel} authorization is invalid.`,
      { cause: error },
    );
  }

  const result = submissionSubjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new SubmissionReviewAuthorizationError(
      'configuration',
      `${capabilityLabel} authorization is invalid.`,
    );
  }
  return { subjects: new Set(result.data) };
}

export function readSubmissionReviewAuthorizationPolicy(
  environment: SubmissionReviewAuthorizationEnvironment,
): SubmissionReviewAuthorizationPolicy {
  return readSubjectPolicy(environment.CPM_ADMIN_SUBMISSION_SUBJECTS, 'Submission review');
}

export function readSubmissionTransitionAuthorizationPolicy(
  environment: SubmissionReviewAuthorizationEnvironment,
): SubmissionReviewAuthorizationPolicy {
  return readSubjectPolicy(
    environment.CPM_ADMIN_SUBMISSION_TRANSITION_SUBJECTS,
    'Submission transition',
  );
}

export function readSubmissionCandidateAuthorizationPolicy(
  environment: SubmissionReviewAuthorizationEnvironment,
): SubmissionReviewAuthorizationPolicy {
  return readSubjectPolicy(
    environment.CPM_ADMIN_SUBMISSION_CANDIDATE_SUBJECTS,
    'Submission Candidate creation',
  );
}

export function readPaymentReportEvidenceAuthorizationPolicy(
  environment: SubmissionReviewAuthorizationEnvironment,
): SubmissionReviewAuthorizationPolicy {
  return readSubjectPolicy(
    environment.CPM_ADMIN_PAYMENT_EVIDENCE_SUBJECTS,
    'Positive payment Evidence decision',
  );
}

export function readNegativeReportEvidenceAuthorizationPolicy(
  environment: SubmissionReviewAuthorizationEnvironment,
): SubmissionReviewAuthorizationPolicy {
  return readSubjectPolicy(
    environment.CPM_ADMIN_NEGATIVE_EVIDENCE_SUBJECTS,
    'Negative report Evidence decision',
  );
}

export function readProblemReportDecisionAuthorizationPolicy(
  environment: SubmissionReviewAuthorizationEnvironment,
): SubmissionReviewAuthorizationPolicy {
  return readSubjectPolicy(
    environment.CPM_ADMIN_PROBLEM_DECISION_SUBJECTS,
    'Problem report decision',
  );
}

export function readUrgentVisibilityAuthorizationPolicy(
  environment: SubmissionReviewAuthorizationEnvironment,
): SubmissionReviewAuthorizationPolicy {
  return readSubjectPolicy(
    environment.CPM_ADMIN_URGENT_VISIBILITY_SUBJECTS,
    'Urgent visibility decision',
  );
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

export function authorizeSubmissionTransition(
  identity: AdminAccessIdentity,
  policy: SubmissionReviewAuthorizationPolicy,
): SubmissionTransitionContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new SubmissionReviewAuthorizationError(
      'denied',
      'The verified administration identity is not authorized for Submission transitions.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:transition'],
  };
}

export function authorizeSubmissionCandidateCreate(
  identity: AdminAccessIdentity,
  policy: SubmissionReviewAuthorizationPolicy,
): SubmissionCandidateCreateContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new SubmissionReviewAuthorizationError(
      'denied',
      'The verified administration identity is not authorized to create Candidates from Submissions.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:candidate:create'],
  };
}

export function authorizePaymentReportEvidenceDecision(
  identity: AdminAccessIdentity,
  policy: SubmissionReviewAuthorizationPolicy,
): PaymentReportEvidenceDecisionContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new SubmissionReviewAuthorizationError(
      'denied',
      'The verified administration identity is not authorized to decide positive payment Evidence.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:payment-evidence:decide'],
  };
}

export function authorizeNegativeReportEvidenceDecision(
  identity: AdminAccessIdentity,
  policy: SubmissionReviewAuthorizationPolicy,
): NegativeReportEvidenceDecisionContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new SubmissionReviewAuthorizationError(
      'denied',
      'The verified administration identity is not authorized to decide negative report Evidence.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:negative-evidence:decide'],
  };
}

export function authorizeProblemReportMutation(
  identity: AdminAccessIdentity,
  problemPolicy: SubmissionReviewAuthorizationPolicy,
  urgentPolicy: SubmissionReviewAuthorizationPolicy,
): ProblemReportMutationContext {
  const capabilities: ProblemReportMutationCapability[] = [];
  if (problemPolicy.subjects.has(identity.subject)) {
    capabilities.push('submission:problem:decide');
  }
  if (urgentPolicy.subjects.has(identity.subject)) {
    capabilities.push('submission:urgent-visibility:decide');
  }
  if (capabilities.length === 0) {
    throw new SubmissionReviewAuthorizationError(
      'denied',
      'The verified administration identity is not authorized for problem report decisions.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities,
  };
}
