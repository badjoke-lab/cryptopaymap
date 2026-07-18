import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { ProblemClaimInstructionCorrectionApplicationContext } from './problem-claim-instruction-correction-application';

const subjectsSchema = z
  .array(z.string().trim().min(1).max(200))
  .min(1)
  .max(50)
  .superRefine((subjects, context) => {
    if (new Set(subjects).size !== subjects.length) {
      context.addIssue({
        code: 'custom',
        message: 'Problem Claim instruction correction subjects must be unique.',
      });
    }
  });

export interface ProblemClaimInstructionCorrectionAuthorizationEnvironment {
  CPM_ADMIN_PROBLEM_CLAIM_INSTRUCTION_CORRECTION_SUBJECTS?: string;
  [key: string]: unknown;
}

export interface ProblemClaimInstructionCorrectionAuthorizationPolicy {
  subjects: ReadonlySet<string>;
}

export class ProblemClaimInstructionCorrectionAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProblemClaimInstructionCorrectionAuthorizationError';
  }
}

export function readProblemClaimInstructionCorrectionAuthorizationPolicy(
  environment: ProblemClaimInstructionCorrectionAuthorizationEnvironment,
): ProblemClaimInstructionCorrectionAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_PROBLEM_CLAIM_INSTRUCTION_CORRECTION_SUBJECTS;
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new ProblemClaimInstructionCorrectionAuthorizationError(
      'configuration',
      'Problem Claim instruction correction authorization is not configured.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new ProblemClaimInstructionCorrectionAuthorizationError(
      'configuration',
      'Problem Claim instruction correction authorization is invalid.',
      { cause: error },
    );
  }
  const result = subjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new ProblemClaimInstructionCorrectionAuthorizationError(
      'configuration',
      'Problem Claim instruction correction authorization is invalid.',
    );
  }
  return { subjects: new Set(result.data) };
}

export function authorizeProblemClaimInstructionCorrectionApplication(
  identity: AdminAccessIdentity,
  policy: ProblemClaimInstructionCorrectionAuthorizationPolicy,
): ProblemClaimInstructionCorrectionApplicationContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new ProblemClaimInstructionCorrectionAuthorizationError(
      'denied',
      'The verified administration identity is not authorized to apply Claim instruction corrections.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:problem-claim-instructions:apply'],
  };
}
