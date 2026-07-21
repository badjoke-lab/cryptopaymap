import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { BusinessClaimFieldProvenanceContext } from './business-claim-field-provenance';

const subjectsSchema = z
  .array(z.string().trim().min(1).max(200))
  .min(1)
  .max(50)
  .superRefine((subjects, context) => {
    if (new Set(subjects).size !== subjects.length) {
      context.addIssue({
        code: 'custom',
        message: 'Business Claim field provenance subjects must be unique.',
      });
    }
  });

export interface BusinessClaimFieldProvenanceAuthorizationEnvironment {
  CPM_ADMIN_BUSINESS_CLAIM_FIELD_PROVENANCE_SUBJECTS?: string;
  CPM_BUSINESS_CLAIM_SOURCE_ID?: string;
  [key: string]: unknown;
}

export interface BusinessClaimFieldProvenanceAuthorizationPolicy {
  subjects: ReadonlySet<string>;
  sourceId: string;
}

export class BusinessClaimFieldProvenanceAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BusinessClaimFieldProvenanceAuthorizationError';
  }
}

export function readBusinessClaimFieldProvenanceAuthorizationPolicy(
  environment: BusinessClaimFieldProvenanceAuthorizationEnvironment,
): BusinessClaimFieldProvenanceAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_BUSINESS_CLAIM_FIELD_PROVENANCE_SUBJECTS;
  const sourceId = environment.CPM_BUSINESS_CLAIM_SOURCE_ID;
  if (
    typeof serialized !== 'string' ||
    serialized.trim() === '' ||
    typeof sourceId !== 'string' ||
    !z.uuid().safeParse(sourceId).success
  ) {
    throw new BusinessClaimFieldProvenanceAuthorizationError(
      'configuration',
      'Business Claim field provenance authorization is not configured.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new BusinessClaimFieldProvenanceAuthorizationError(
      'configuration',
      'Business Claim field provenance authorization is invalid.',
      { cause: error },
    );
  }
  const result = subjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new BusinessClaimFieldProvenanceAuthorizationError(
      'configuration',
      'Business Claim field provenance authorization is invalid.',
    );
  }
  return { subjects: new Set(result.data), sourceId };
}

export function authorizeBusinessClaimFieldProvenance(
  identity: AdminAccessIdentity,
  policy: BusinessClaimFieldProvenanceAuthorizationPolicy,
): BusinessClaimFieldProvenanceContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new BusinessClaimFieldProvenanceAuthorizationError(
      'denied',
      'The verified administration identity is not authorized to complete field provenance.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:business-claim-field-provenance:complete'],
  };
}
