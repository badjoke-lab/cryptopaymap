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
        message: 'Photos parent-resolution subject identifiers must be unique.',
      });
    }
  });

export interface PhotoParentResolutionAuthorizationEnvironment {
  CPM_ADMIN_PHOTO_PARENT_RESOLUTION_SUBJECTS?: string;
  [key: string]: unknown;
}

export interface PhotoParentResolutionAuthorizationPolicy {
  subjects: ReadonlySet<string>;
}

export interface PhotoParentResolutionContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:photos:resolve'];
}

export class PhotoParentResolutionAuthorizationError extends Error {
  constructor(
    readonly code: 'configuration' | 'denied',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PhotoParentResolutionAuthorizationError';
  }
}

export function readPhotoParentResolutionAuthorizationPolicy(
  environment: PhotoParentResolutionAuthorizationEnvironment,
): PhotoParentResolutionAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_PHOTO_PARENT_RESOLUTION_SUBJECTS;
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new PhotoParentResolutionAuthorizationError(
      'configuration',
      'Photos parent-resolution authorization is not configured.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new PhotoParentResolutionAuthorizationError(
      'configuration',
      'Photos parent-resolution authorization is invalid.',
      { cause: error },
    );
  }
  const result = subjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new PhotoParentResolutionAuthorizationError(
      'configuration',
      'Photos parent-resolution authorization is invalid.',
    );
  }
  return { subjects: new Set(result.data) };
}

export function authorizePhotoParentResolution(
  identity: AdminAccessIdentity,
  policy: PhotoParentResolutionAuthorizationPolicy,
): PhotoParentResolutionContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new PhotoParentResolutionAuthorizationError(
      'denied',
      'The verified administration identity is not authorized for Photos parent resolution.',
    );
  }
  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['submission:photos:resolve'],
  };
}
