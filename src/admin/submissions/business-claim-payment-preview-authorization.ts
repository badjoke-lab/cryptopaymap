import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { BusinessClaimPaymentPreviewReadContext } from './business-claim-payment-preview';

const subjectsSchema = z
  .array(z.string().trim().min(1).max(200))
  .min(1)
  .max(50)
  .superRefine((subjects, context) => {
    if (new Set(subjects).size !== subjects.length) {
      context.addIssue({
        code: 'custom',
        message: 'Business Claim payment preview subjects must be unique.',
      });
    }
  });

export interface BusinessClaimPaymentPreviewAuthorizationEnvironment {
  CPM_ADMIN_BUSINESS_CLAIM_PAYMENT_PREVIEW_SUBJECTS?: string;
  [key: string]: unknown;
}

export interface BusinessClaimPaymentPreviewAuthorizationPolicy {
  subjects: ReadonlySet<string>;
}

export class BusinessClaimPaymentPreviewAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BusinessClaimPaymentPreviewAuthorizationError';
  }
}

export function readBusinessClaimPaymentPreviewAuthorizationPolicy(
  environment: BusinessClaimPaymentPreviewAuthorizationEnvironment,
): BusinessClaimPaymentPreviewAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_BUSINESS_CLAIM_PAYMENT_PREVIEW_SUBJECTS;
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new BusinessClaimPaymentPreviewAuthorizationError(
      'configuration',
      'Business Claim payment preview authorization is not configured.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new BusinessClaimPaymentPreviewAuthorizationError(
      'configuration',
      'Business Claim payment preview authorization is invalid.',
      { cause: error },
    );
  }
  const result = subjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new BusinessClaimPaymentPreviewAuthorizationError(
      'configuration',
      'Business Claim payment preview authorization is invalid.',
    );
  }
  return { subjects: new Set(result.data) };
}

export function authorizeBusinessClaimPaymentPreviewRead(
  identity: AdminAccessIdentity,
  policy: BusinessClaimPaymentPreviewAuthorizationPolicy,
): BusinessClaimPaymentPreviewReadContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new BusinessClaimPaymentPreviewAuthorizationError(
      'denied',
      'The verified administration identity is not authorized to read Business Claim payment previews.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:business-claim-payment-preview:read'],
  };
}
