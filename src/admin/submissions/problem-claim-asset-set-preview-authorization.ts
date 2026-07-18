import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { ProblemClaimAssetSetPreviewReadContext } from './problem-claim-asset-set-preview';

const subjectsSchema = z
  .array(z.string().trim().min(1).max(200))
  .min(1)
  .max(50)
  .superRefine((subjects, context) => {
    if (new Set(subjects).size !== subjects.length) {
      context.addIssue({ code: 'custom', message: 'Claim Asset preview subjects must be unique.' });
    }
  });

export interface ProblemClaimAssetSetPreviewAuthorizationEnvironment {
  CPM_ADMIN_PROBLEM_CLAIM_ASSET_PREVIEW_SUBJECTS?: string;
  [key: string]: unknown;
}

export interface ProblemClaimAssetSetPreviewAuthorizationPolicy {
  subjects: ReadonlySet<string>;
}

export class ProblemClaimAssetSetPreviewAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProblemClaimAssetSetPreviewAuthorizationError';
  }
}

export function readProblemClaimAssetSetPreviewAuthorizationPolicy(
  environment: ProblemClaimAssetSetPreviewAuthorizationEnvironment,
): ProblemClaimAssetSetPreviewAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_PROBLEM_CLAIM_ASSET_PREVIEW_SUBJECTS;
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new ProblemClaimAssetSetPreviewAuthorizationError(
      'configuration',
      'Claim Asset preview authorization is not configured.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new ProblemClaimAssetSetPreviewAuthorizationError(
      'configuration',
      'Claim Asset preview authorization is invalid.',
      { cause: error },
    );
  }
  const result = subjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new ProblemClaimAssetSetPreviewAuthorizationError(
      'configuration',
      'Claim Asset preview authorization is invalid.',
    );
  }
  return { subjects: new Set(result.data) };
}

export function authorizeProblemClaimAssetSetPreviewRead(
  identity: AdminAccessIdentity,
  policy: ProblemClaimAssetSetPreviewAuthorizationPolicy,
): ProblemClaimAssetSetPreviewReadContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new ProblemClaimAssetSetPreviewAuthorizationError(
      'denied',
      'The verified administration identity is not authorized to read Claim Asset previews.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:problem-claim-asset-preview:read'],
  };
}
