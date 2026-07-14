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
        message: 'Business Claim verification execution subjects must be unique.',
      });
    }
  });

export interface BusinessClaimVerificationExecutionAuthorizationEnvironment {
  CPM_ADMIN_CLAIM_VERIFICATION_EXECUTE_SUBJECTS?: string;
  [key: string]: unknown;
}

export interface BusinessClaimVerificationExecutionAuthorizationPolicy {
  subjects: ReadonlySet<string>;
}

export interface BusinessClaimVerificationExecutionContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:claim-verification:execute'];
}

export class BusinessClaimVerificationExecutionAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BusinessClaimVerificationExecutionAuthorizationError';
  }
}

export function readBusinessClaimVerificationExecutionAuthorizationPolicy(
  environment: BusinessClaimVerificationExecutionAuthorizationEnvironment,
): BusinessClaimVerificationExecutionAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_CLAIM_VERIFICATION_EXECUTE_SUBJECTS;
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new BusinessClaimVerificationExecutionAuthorizationError(
      'configuration',
      'Business Claim verification execution authorization is not configured.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new BusinessClaimVerificationExecutionAuthorizationError(
      'configuration',
      'Business Claim verification execution authorization is invalid.',
      { cause: error },
    );
  }

  const result = subjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new BusinessClaimVerificationExecutionAuthorizationError(
      'configuration',
      'Business Claim verification execution authorization is invalid.',
    );
  }
  return { subjects: new Set(result.data) };
}

export function authorizeBusinessClaimVerificationExecution(
  identity: AdminAccessIdentity,
  policy: BusinessClaimVerificationExecutionAuthorizationPolicy,
): BusinessClaimVerificationExecutionContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new BusinessClaimVerificationExecutionAuthorizationError(
      'denied',
      'The verified administration identity is not authorized to execute Business Claim verification.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:claim-verification:execute'],
  };
}
