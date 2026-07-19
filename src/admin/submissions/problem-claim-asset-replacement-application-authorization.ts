import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { ProblemClaimAssetReplacementApplicationContext } from './problem-claim-asset-replacement-application';

const subjectsSchema = z
  .array(z.string().trim().min(1).max(200))
  .min(1)
  .max(50)
  .superRefine((subjects, context) => {
    if (new Set(subjects).size !== subjects.length) {
      context.addIssue({
        code: 'custom',
        message: 'Claim Asset replacement application subjects must be unique.',
      });
    }
  });

export interface ProblemClaimAssetReplacementApplicationAuthorizationEnvironment {
  CPM_ADMIN_PROBLEM_CLAIM_ASSET_APPLY_SUBJECTS?: string;
  CPM_PROBLEM_REPORT_SOURCE_ID?: string;
  [key: string]: unknown;
}

export interface ProblemClaimAssetReplacementApplicationAuthorizationPolicy {
  subjects: ReadonlySet<string>;
  sourceId: string;
}

export class ProblemClaimAssetReplacementApplicationAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProblemClaimAssetReplacementApplicationAuthorizationError';
  }
}

export function readProblemClaimAssetReplacementApplicationAuthorizationPolicy(
  environment: ProblemClaimAssetReplacementApplicationAuthorizationEnvironment,
): ProblemClaimAssetReplacementApplicationAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_PROBLEM_CLAIM_ASSET_APPLY_SUBJECTS;
  const sourceId = environment.CPM_PROBLEM_REPORT_SOURCE_ID;
  if (
    typeof serialized !== 'string' ||
    serialized.trim() === '' ||
    typeof sourceId !== 'string' ||
    !z.uuid().safeParse(sourceId).success
  ) {
    throw new ProblemClaimAssetReplacementApplicationAuthorizationError(
      'configuration',
      'Claim Asset replacement application authorization is not configured.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new ProblemClaimAssetReplacementApplicationAuthorizationError(
      'configuration',
      'Claim Asset replacement application authorization is invalid.',
      { cause: error },
    );
  }
  const result = subjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new ProblemClaimAssetReplacementApplicationAuthorizationError(
      'configuration',
      'Claim Asset replacement application authorization is invalid.',
    );
  }
  return { subjects: new Set(result.data), sourceId };
}

export function authorizeProblemClaimAssetReplacementApplication(
  identity: AdminAccessIdentity,
  policy: ProblemClaimAssetReplacementApplicationAuthorizationPolicy,
): ProblemClaimAssetReplacementApplicationContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new ProblemClaimAssetReplacementApplicationAuthorizationError(
      'denied',
      'The verified administration identity is not authorized to apply Claim Asset replacements.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:problem-claim-assets:apply'],
  };
}
