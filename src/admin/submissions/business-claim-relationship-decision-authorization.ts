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
        message: 'Business Claim relationship decision subjects must be unique.',
      });
    }
  });

export interface BusinessClaimRelationshipDecisionAuthorizationEnvironment {
  CPM_ADMIN_CLAIM_RELATIONSHIP_DECISION_SUBJECTS?: string;
  [key: string]: unknown;
}

export interface BusinessClaimRelationshipDecisionAuthorizationPolicy {
  subjects: ReadonlySet<string>;
}

export interface BusinessClaimRelationshipDecisionContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:claim-relationship:decide'];
}

export class BusinessClaimRelationshipDecisionAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BusinessClaimRelationshipDecisionAuthorizationError';
  }
}

export function readBusinessClaimRelationshipDecisionAuthorizationPolicy(
  environment: BusinessClaimRelationshipDecisionAuthorizationEnvironment,
): BusinessClaimRelationshipDecisionAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_CLAIM_RELATIONSHIP_DECISION_SUBJECTS;
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new BusinessClaimRelationshipDecisionAuthorizationError(
      'configuration',
      'Business Claim relationship decision authorization is not configured.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new BusinessClaimRelationshipDecisionAuthorizationError(
      'configuration',
      'Business Claim relationship decision authorization is invalid.',
      { cause: error },
    );
  }

  const result = subjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new BusinessClaimRelationshipDecisionAuthorizationError(
      'configuration',
      'Business Claim relationship decision authorization is invalid.',
    );
  }
  return { subjects: new Set(result.data) };
}

export function authorizeBusinessClaimRelationshipDecision(
  identity: AdminAccessIdentity,
  policy: BusinessClaimRelationshipDecisionAuthorizationPolicy,
): BusinessClaimRelationshipDecisionContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new BusinessClaimRelationshipDecisionAuthorizationError(
      'denied',
      'The verified administration identity is not authorized to decide Business Claim representative relationships.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:claim-relationship:decide'],
  };
}
