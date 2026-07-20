import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { BusinessClaimPaymentApplicationContext } from './business-claim-payment-application';

const subjectsSchema = z
  .array(z.string().trim().min(1).max(200))
  .min(1)
  .max(50)
  .superRefine((subjects, context) => {
    if (new Set(subjects).size !== subjects.length) {
      context.addIssue({
        code: 'custom',
        message: 'Business Claim payment application subjects must be unique.',
      });
    }
  });

export interface BusinessClaimPaymentApplicationAuthorizationEnvironment {
  CPM_ADMIN_BUSINESS_CLAIM_PAYMENT_APPLY_SUBJECTS?: string;
  CPM_BUSINESS_CLAIM_SOURCE_ID?: string;
  [key: string]: unknown;
}

export interface BusinessClaimPaymentApplicationAuthorizationPolicy {
  subjects: ReadonlySet<string>;
  sourceId: string;
}

export class BusinessClaimPaymentApplicationAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BusinessClaimPaymentApplicationAuthorizationError';
  }
}

export function readBusinessClaimPaymentApplicationAuthorizationPolicy(
  environment: BusinessClaimPaymentApplicationAuthorizationEnvironment,
): BusinessClaimPaymentApplicationAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_BUSINESS_CLAIM_PAYMENT_APPLY_SUBJECTS;
  const sourceId = environment.CPM_BUSINESS_CLAIM_SOURCE_ID;
  if (
    typeof serialized !== 'string' ||
    serialized.trim() === '' ||
    typeof sourceId !== 'string' ||
    !z.uuid().safeParse(sourceId).success
  ) {
    throw new BusinessClaimPaymentApplicationAuthorizationError(
      'configuration',
      'Business Claim payment application authorization is not configured.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new BusinessClaimPaymentApplicationAuthorizationError(
      'configuration',
      'Business Claim payment application authorization is invalid.',
      { cause: error },
    );
  }
  const result = subjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new BusinessClaimPaymentApplicationAuthorizationError(
      'configuration',
      'Business Claim payment application authorization is invalid.',
    );
  }
  return { subjects: new Set(result.data), sourceId };
}

export function authorizeBusinessClaimPaymentApplication(
  identity: AdminAccessIdentity,
  policy: BusinessClaimPaymentApplicationAuthorizationPolicy,
): BusinessClaimPaymentApplicationContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new BusinessClaimPaymentApplicationAuthorizationError(
      'denied',
      'The verified administration identity is not authorized to apply Business Claim payments.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:business-claim-payments:apply'],
  };
}
