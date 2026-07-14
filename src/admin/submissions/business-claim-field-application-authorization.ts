import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';

const subjectsSchema = z
  .array(z.string().trim().min(1).max(200))
  .min(1)
  .max(50)
  .superRefine((subjects, context) => {
    if (new Set(subjects).size !== subjects.length) {
      context.addIssue({ code: 'custom', message: 'Claim field applicants must be unique.' });
    }
  });

export interface BusinessClaimFieldApplicationAuthorizationEnvironment {
  CPM_ADMIN_CLAIM_FIELD_APPLICATION_SUBJECTS?: string;
  [key: string]: unknown;
}

export interface BusinessClaimFieldApplicationAuthorizationPolicy {
  subjects: ReadonlySet<string>;
}

export interface BusinessClaimFieldApplicationContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:claim-fields:apply'];
}

export class BusinessClaimFieldApplicationAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BusinessClaimFieldApplicationAuthorizationError';
  }
}

export function readBusinessClaimFieldApplicationAuthorizationPolicy(
  environment: BusinessClaimFieldApplicationAuthorizationEnvironment,
): BusinessClaimFieldApplicationAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_CLAIM_FIELD_APPLICATION_SUBJECTS;
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new BusinessClaimFieldApplicationAuthorizationError(
      'configuration',
      'Business Claim field application authorization is not configured.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new BusinessClaimFieldApplicationAuthorizationError(
      'configuration',
      'Business Claim field application authorization is invalid.',
      { cause: error },
    );
  }

  const result = subjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new BusinessClaimFieldApplicationAuthorizationError(
      'configuration',
      'Business Claim field application authorization is invalid.',
    );
  }
  return { subjects: new Set(result.data) };
}

export function authorizeBusinessClaimFieldApplication(
  identity: AdminAccessIdentity,
  policy: BusinessClaimFieldApplicationAuthorizationPolicy,
): BusinessClaimFieldApplicationContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new BusinessClaimFieldApplicationAuthorizationError(
      'denied',
      'The verified administration identity is not authorized to apply Business Claim fields.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:claim-fields:apply'],
  };
}
