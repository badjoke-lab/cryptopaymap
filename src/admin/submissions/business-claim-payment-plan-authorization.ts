import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { BusinessClaimPaymentPlanContext } from './business-claim-payment-plan';

const subjectsSchema = z
  .array(z.string().trim().min(1).max(200))
  .min(1)
  .max(50)
  .superRefine((subjects, context) => {
    if (new Set(subjects).size !== subjects.length) {
      context.addIssue({
        code: 'custom',
        message: 'Business Claim payment plan subjects must be unique.',
      });
    }
  });

export interface BusinessClaimPaymentPlanAuthorizationEnvironment {
  CPM_ADMIN_BUSINESS_CLAIM_PAYMENT_PLAN_SUBJECTS?: string;
  [key: string]: unknown;
}

export interface BusinessClaimPaymentPlanAuthorizationPolicy {
  subjects: ReadonlySet<string>;
}

export class BusinessClaimPaymentPlanAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BusinessClaimPaymentPlanAuthorizationError';
  }
}

export function readBusinessClaimPaymentPlanAuthorizationPolicy(
  environment: BusinessClaimPaymentPlanAuthorizationEnvironment,
): BusinessClaimPaymentPlanAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_BUSINESS_CLAIM_PAYMENT_PLAN_SUBJECTS;
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new BusinessClaimPaymentPlanAuthorizationError(
      'configuration',
      'Business Claim payment plan authorization is not configured.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new BusinessClaimPaymentPlanAuthorizationError(
      'configuration',
      'Business Claim payment plan authorization is invalid.',
      { cause: error },
    );
  }
  const result = subjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new BusinessClaimPaymentPlanAuthorizationError(
      'configuration',
      'Business Claim payment plan authorization is invalid.',
    );
  }
  return { subjects: new Set(result.data) };
}

export function authorizeBusinessClaimPaymentPlan(
  identity: AdminAccessIdentity,
  policy: BusinessClaimPaymentPlanAuthorizationPolicy,
): BusinessClaimPaymentPlanContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new BusinessClaimPaymentPlanAuthorizationError(
      'denied',
      'The verified administration identity is not authorized to prepare Business Claim payment plans.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:business-claim-payment-plan:prepare'],
  };
}
