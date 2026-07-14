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
        message: 'Business Claim verification preparation subjects must be unique.',
      });
    }
  });

export interface BusinessClaimVerificationAuthorizationEnvironment {
  CPM_ADMIN_CLAIM_VERIFICATION_PREPARE_SUBJECTS?: string;
  [key: string]: unknown;
}

export interface BusinessClaimVerificationAuthorizationPolicy {
  subjects: ReadonlySet<string>;
}

export interface BusinessClaimVerificationPreparationContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:claim-verification:prepare'];
}

export class BusinessClaimVerificationAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BusinessClaimVerificationAuthorizationError';
  }
}

export function readBusinessClaimVerificationAuthorizationPolicy(
  environment: BusinessClaimVerificationAuthorizationEnvironment,
): BusinessClaimVerificationAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_CLAIM_VERIFICATION_PREPARE_SUBJECTS;
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new BusinessClaimVerificationAuthorizationError(
      'configuration',
      'Business Claim verification preparation authorization is not configured.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new BusinessClaimVerificationAuthorizationError(
      'configuration',
      'Business Claim verification preparation authorization is invalid.',
      { cause: error },
    );
  }

  const result = subjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new BusinessClaimVerificationAuthorizationError(
      'configuration',
      'Business Claim verification preparation authorization is invalid.',
    );
  }
  return { subjects: new Set(result.data) };
}

export function authorizeBusinessClaimVerificationPreparation(
  identity: AdminAccessIdentity,
  policy: BusinessClaimVerificationAuthorizationPolicy,
): BusinessClaimVerificationPreparationContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new BusinessClaimVerificationAuthorizationError(
      'denied',
      'The verified administration identity is not authorized to prepare Business Claim verification requests.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:claim-verification:prepare'],
  };
}
