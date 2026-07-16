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
        message: 'Terminal-resolution subject identifiers must be unique.',
      });
    }
  });

export interface SubmissionTerminalResolutionAuthorizationEnvironment {
  CPM_ADMIN_SUBMISSION_TERMINAL_RESOLUTION_SUBJECTS?: string;
  [key: string]: unknown;
}

export interface SubmissionTerminalResolutionAuthorizationPolicy {
  subjects: ReadonlySet<string>;
}

export interface SubmissionTerminalResolutionContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:terminal-resolution'];
}

export class SubmissionTerminalResolutionAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SubmissionTerminalResolutionAuthorizationError';
  }
}

export function readSubmissionTerminalResolutionAuthorizationPolicy(
  environment: SubmissionTerminalResolutionAuthorizationEnvironment,
): SubmissionTerminalResolutionAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_SUBMISSION_TERMINAL_RESOLUTION_SUBJECTS;
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new SubmissionTerminalResolutionAuthorizationError(
      'configuration',
      'Submission terminal-resolution authorization is not configured.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new SubmissionTerminalResolutionAuthorizationError(
      'configuration',
      'Submission terminal-resolution authorization is invalid.',
      { cause: error },
    );
  }
  const result = subjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new SubmissionTerminalResolutionAuthorizationError(
      'configuration',
      'Submission terminal-resolution authorization is invalid.',
    );
  }
  return { subjects: new Set(result.data) };
}

export function authorizeSubmissionTerminalResolution(
  identity: AdminAccessIdentity,
  policy: SubmissionTerminalResolutionAuthorizationPolicy,
): SubmissionTerminalResolutionContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new SubmissionTerminalResolutionAuthorizationError(
      'denied',
      'The verified administration identity is not authorized for Submission terminal resolution.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:terminal-resolution'],
  };
}
