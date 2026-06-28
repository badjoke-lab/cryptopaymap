import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { CandidateQueueContext } from './queue';

const candidateSubjectSchema = z.string().trim().min(1).max(200);
const candidateSubjectsSchema = z
  .array(candidateSubjectSchema)
  .min(1)
  .max(50)
  .superRefine((subjects, context) => {
    if (new Set(subjects).size !== subjects.length) {
      context.addIssue({
        code: 'custom',
        message: 'Candidate queue subject identifiers must be unique.',
      });
    }
  });

export interface CandidateQueueAuthorizationEnvironment {
  CPM_ADMIN_CANDIDATE_SUBJECTS?: string;
  [key: string]: unknown;
}

export interface CandidateQueueAuthorizationPolicy {
  subjects: ReadonlySet<string>;
}

export type CandidateQueueAuthorizationErrorCode = 'configuration' | 'denied';

export class CandidateQueueAuthorizationError extends Error {
  readonly code: CandidateQueueAuthorizationErrorCode;

  constructor(code: CandidateQueueAuthorizationErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CandidateQueueAuthorizationError';
    this.code = code;
  }
}

export function readCandidateQueueAuthorizationPolicy(
  environment: CandidateQueueAuthorizationEnvironment,
): CandidateQueueAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_CANDIDATE_SUBJECTS;
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new CandidateQueueAuthorizationError(
      'configuration',
      'Candidate queue authorization is not configured.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new CandidateQueueAuthorizationError(
      'configuration',
      'Candidate queue authorization is invalid.',
      { cause: error },
    );
  }

  const result = candidateSubjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new CandidateQueueAuthorizationError(
      'configuration',
      'Candidate queue authorization is invalid.',
    );
  }

  return { subjects: new Set(result.data) };
}

export function authorizeCandidateQueueRead(
  identity: AdminAccessIdentity,
  policy: CandidateQueueAuthorizationPolicy,
): CandidateQueueContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new CandidateQueueAuthorizationError(
      'denied',
      'The verified administration identity is not authorized for Candidate queue access.',
    );
  }

  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['candidate:read'],
  };
}
