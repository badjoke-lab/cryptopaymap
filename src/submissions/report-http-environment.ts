import { z } from 'zod';
import { createDatabase } from '../db/client';
import { requiredDatabaseEnvironmentSchema } from '../schemas/environment';
import { createAbuseControlledSubmissionIntakeService } from './abuse-controlled-intake';
import { createSubmissionContactProtectorFromEnvironment } from './contact-protection-environment';
import { createDrizzleSubmissionPersistenceBackend } from './drizzle-persistence';
import {
  createDurableObjectSubmissionRateLimiter,
  type SubmissionRateLimitDurableObjectNamespace,
} from './durable-object-rate-limit';
import { createSubmissionRateLimitBucketDeriverFromEnvironment } from './rate-limit-bucket-environment';
import type { ReportHttpRuntime } from './report-http';
import { createReportSubmissionPrivateIntakeService } from './report-intake-service';
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

export type ReportHttpEnvironment = Readonly<
  Record<string, unknown> & {
    DATABASE_URL?: unknown;
    SUBMISSION_RATE_LIMIT_BUCKETS?: unknown;
    CPM_SUBMISSION_RATE_LIMIT_MAX_REQUESTS?: unknown;
    CPM_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS?: unknown;
  }
>;

export class ReportHttpEnvironmentConfigurationError extends Error {
  constructor() {
    super('Report HTTP environment configuration is unavailable.');
    this.name = 'ReportHttpEnvironmentConfigurationError';
  }
}

function isDurableObjectNamespace(
  value: unknown,
): value is SubmissionRateLimitDurableObjectNamespace {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.idFromName === 'function' && typeof candidate.get === 'function';
}

export function createReportHttpRuntimeFromEnvironment(
  environment: ReportHttpEnvironment,
): ReportHttpRuntime {
  try {
    const databaseEnvironment = requiredDatabaseEnvironmentSchema.parse({
      DATABASE_URL: environment.DATABASE_URL,
    });
    const rateLimitPolicy = rateLimitPolicySchema.parse({
      CPM_SUBMISSION_RATE_LIMIT_MAX_REQUESTS: environment.CPM_SUBMISSION_RATE_LIMIT_MAX_REQUESTS,
      CPM_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS:
        environment.CPM_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS,
    });
    if (!isDurableObjectNamespace(environment.SUBMISSION_RATE_LIMIT_BUCKETS)) {
      throw new ReportHttpEnvironmentConfigurationError();
    }

    const database = createDatabase(databaseEnvironment.DATABASE_URL);
    const privateIntake = createReportSubmissionPrivateIntakeService({
      persistence: createDrizzleSubmissionPersistenceBackend(database),
      statusSecrets: createSubmissionStatusSecretProviderFromEnvironment(environment),
      contactProtector: createSubmissionContactProtectorFromEnvironment(environment),
    });
    const turnstile = createSubmissionTurnstileConfigurationFromEnvironment(environment);

    return {
      bucketDeriver: createSubmissionRateLimitBucketDeriverFromEnvironment(environment),
      intake: createAbuseControlledSubmissionIntakeService({
        rateLimiter: createDurableObjectSubmissionRateLimiter(
          environment.SUBMISSION_RATE_LIMIT_BUCKETS,
          rateLimitPolicy,
        ),
        challengeVerifier: turnstile.verifier,
        intake: privateIntake,
      }),
    };
  } catch (error) {
    if (error instanceof ReportHttpEnvironmentConfigurationError) throw error;
    throw new ReportHttpEnvironmentConfigurationError();
  }
}
