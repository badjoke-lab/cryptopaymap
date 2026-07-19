import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { ProblemClaimAssetReplacementPlanContext } from './problem-claim-asset-replacement-plan';

const subjectsSchema = z
  .array(z.string().trim().min(1).max(200))
  .min(1)
  .max(50)
  .superRefine((subjects, context) => {
    if (new Set(subjects).size !== subjects.length) {
      context.addIssue({
        code: 'custom',
        message: 'Claim Asset replacement plan subjects must be unique.',
      });
    }
  });

export interface ProblemClaimAssetReplacementPlanAuthorizationEnvironment {
  CPM_ADMIN_PROBLEM_CLAIM_ASSET_PLAN_SUBJECTS?: string;
  [key: string]: unknown;
}

export interface ProblemClaimAssetReplacementPlanAuthorizationPolicy {
  subjects: ReadonlySet<string>;
}

export class ProblemClaimAssetReplacementPlanAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProblemClaimAssetReplacementPlanAuthorizationError';
  }
}

export function readProblemClaimAssetReplacementPlanAuthorizationPolicy(
  environment: ProblemClaimAssetReplacementPlanAuthorizationEnvironment,
): ProblemClaimAssetReplacementPlanAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_PROBLEM_CLAIM_ASSET_PLAN_SUBJECTS;
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new ProblemClaimAssetReplacementPlanAuthorizationError(
      'configuration',
      'Claim Asset replacement plan authorization is not configured.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new ProblemClaimAssetReplacementPlanAuthorizationError(
      'configuration',
      'Claim Asset replacement plan authorization is invalid.',
      { cause: error },
    );
  }
  const result = subjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new ProblemClaimAssetReplacementPlanAuthorizationError(
      'configuration',
      'Claim Asset replacement plan authorization is invalid.',
    );
  }
  return { subjects: new Set(result.data) };
}

export function authorizeProblemClaimAssetReplacementPlan(
  identity: AdminAccessIdentity,
  policy: ProblemClaimAssetReplacementPlanAuthorizationPolicy,
): ProblemClaimAssetReplacementPlanContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new ProblemClaimAssetReplacementPlanAuthorizationError(
      'denied',
      'The verified administration identity is not authorized to prepare Claim Asset replacement plans.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:problem-claim-asset-plan:prepare'],
  };
}
