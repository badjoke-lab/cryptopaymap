import { z } from 'zod';
import { createDatabase } from '../db/client';
import { requiredDatabaseEnvironmentSchema } from '../schemas/environment';
import { createAbuseControlledSubmissionIntakeService } from './abuse-controlled-intake';
import { createSubmissionContactProtectorFromEnvironment } from './contact-protection-environment';
import { createDrizzleSubmissionPersistenceBackend } from './drizzle-persistence';
import { createDrizzlePhotoUploadReservationPersistence } from './drizzle-photo-upload-reservations';
import {
  createDurableObjectSubmissionRateLimiter,
  type SubmissionRateLimitDurableObjectNamespace,
} from './durable-object-rate-limit';
import type {
  PhotoPrivateIntakeHttpRuntime,
  PhotoUploadAuthorizationHttpRuntime,
} from './photo-http';
import { createPhotoPrivateIntakeService } from './photo-intake-service';
import {
  createPhotoUploadAuthorizationService,
  type QuarantineUploadAuthorizer,
} from './photo-upload-authorization';
import { createSubmissionRateLimitBucketDeriverFromEnvironment } from './rate-limit-bucket-environment';
import {
  createR2PhotoUploadAuthorizerFromEnvironment,
  type R2PhotoUploadAuthorizerEnvironment,
} from './r2-photo-upload-authorizer';
import { createSubmissionStatusSecretProviderFromEnvironment } from './status-secret-environment';
import { createSubmissionTurnstileConfigurationFromEnvironment } from './turnstile-environment';

const positiveIntegerStringSchema = z.string().regex(/^[1-9][0-9]*$/);
const rateLimitPolicySchema = z
  .object({
    CPM_SUBMISSION_RATE_LIMIT_MAX_REQUESTS: positiveIntegerStringSchema,
    CPM_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS: positiveIntegerStringSchema,
  })
  .strict()
  .transform((value, context) => {
    const limit = Number(value.CPM_SUBMISSION_RATE_LIMIT_MAX_REQUESTS);
    const windowSeconds = Number(value.CPM_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      context.addIssue({ code: 'custom', message: 'Invalid request limit.' });
      return z.NEVER;
    }
    if (!Number.isSafeInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86_400) {
      context.addIssue({ code: 'custom', message: 'Invalid rate-limit window.' });
      return z.NEVER;
    }
    return { limit, windowMs: windowSeconds * 1_000 };
  });

export type PhotoHttpEnvironment = Readonly<
  R2PhotoUploadAuthorizerEnvironment &
    Record<string, unknown> & {
      DATABASE_URL?: unknown;
      SUBMISSION_RATE_LIMIT_BUCKETS?: unknown;
      CPM_SUBMISSION_RATE_LIMIT_MAX_REQUESTS?: unknown;
      CPM_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS?: unknown;
    }
>;

export interface PhotoUploadAuthorizationRuntimeDependencies {
  uploadAuthorizer?: QuarantineUploadAuthorizer;
}

export class PhotoHttpEnvironmentConfigurationError extends Error {
  constructor() {
    super('Photos HTTP environment configuration is unavailable.');
    this.name = 'PhotoHttpEnvironmentConfigurationError';
  }
}

function isDurableObjectNamespace(
  value: unknown,
): value is SubmissionRateLimitDurableObjectNamespace {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.idFromName === 'function' && typeof candidate.get === 'function';
}

function commonRuntime(environment: PhotoHttpEnvironment) {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.parse({
    DATABASE_URL: environment.DATABASE_URL,
  });
  const rateLimitPolicy = rateLimitPolicySchema.parse({
    CPM_SUBMISSION_RATE_LIMIT_MAX_REQUESTS: environment.CPM_SUBMISSION_RATE_LIMIT_MAX_REQUESTS,
    CPM_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS: environment.CPM_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS,
  });
  if (!isDurableObjectNamespace(environment.SUBMISSION_RATE_LIMIT_BUCKETS)) {
    throw new PhotoHttpEnvironmentConfigurationError();
  }

  const database = createDatabase(databaseEnvironment.DATABASE_URL);
  const turnstile = createSubmissionTurnstileConfigurationFromEnvironment(environment);
  return {
    database,
    bucketDeriver: createSubmissionRateLimitBucketDeriverFromEnvironment(environment),
    rateLimiter: createDurableObjectSubmissionRateLimiter(
      environment.SUBMISSION_RATE_LIMIT_BUCKETS,
      rateLimitPolicy,
    ),
    challengeVerifier: turnstile.verifier,
  };
}

export function createPhotoUploadAuthorizationHttpRuntimeFromEnvironment(
  environment: PhotoHttpEnvironment,
  dependencies: PhotoUploadAuthorizationRuntimeDependencies = {},
): PhotoUploadAuthorizationHttpRuntime {
  try {
    const common = commonRuntime(environment);
    const uploadAuthorizer =
      dependencies.uploadAuthorizer ?? createR2PhotoUploadAuthorizerFromEnvironment(environment);
    return {
      bucketDeriver: common.bucketDeriver,
      rateLimiter: common.rateLimiter,
      challengeVerifier: common.challengeVerifier,
      uploadAuthorizations: createPhotoUploadAuthorizationService({
        persistence: createDrizzlePhotoUploadReservationPersistence(common.database),
        authorizer: uploadAuthorizer,
      }),
    };
  } catch (error) {
    if (error instanceof PhotoHttpEnvironmentConfigurationError) throw error;
    throw new PhotoHttpEnvironmentConfigurationError();
  }
}

export function createPhotoPrivateIntakeHttpRuntimeFromEnvironment(
  environment: PhotoHttpEnvironment,
): PhotoPrivateIntakeHttpRuntime {
  try {
    const common = commonRuntime(environment);
    const privateIntake = createPhotoPrivateIntakeService({
      persistence: createDrizzleSubmissionPersistenceBackend(common.database),
      statusSecrets: createSubmissionStatusSecretProviderFromEnvironment(environment),
      contactProtector: createSubmissionContactProtectorFromEnvironment(environment),
    });
    return {
      bucketDeriver: common.bucketDeriver,
      intake: createAbuseControlledSubmissionIntakeService({
        rateLimiter: common.rateLimiter,
        challengeVerifier: common.challengeVerifier,
        intake: privateIntake,
      }),
    };
  } catch (error) {
    if (error instanceof PhotoHttpEnvironmentConfigurationError) throw error;
    throw new PhotoHttpEnvironmentConfigurationError();
  }
}
