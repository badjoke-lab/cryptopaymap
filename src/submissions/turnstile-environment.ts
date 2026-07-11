import { z } from 'zod';
import type { SubmissionChallengeVerifier } from './challenge-verification';
import { createTurnstileSiteverifyVerifier } from './turnstile-siteverify';

const nonWhitespaceTokenSchema = z.string().min(1).max(512).regex(/^\S+$/);
const hostnameSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/);
const actionSchema = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);

export const submissionTurnstileEnvironmentSchema = z
  .object({
    CPM_TURNSTILE_SECRET_KEY: nonWhitespaceTokenSchema,
    PUBLIC_TURNSTILE_SITE_KEY: nonWhitespaceTokenSchema,
    CPM_TURNSTILE_EXPECTED_HOSTNAME: hostnameSchema,
    CPM_TURNSTILE_EXPECTED_ACTION: actionSchema,
  })
  .strict();

export type SubmissionTurnstileEnvironment = Readonly<
  Record<string, unknown> & {
    CPM_TURNSTILE_SECRET_KEY?: unknown;
    PUBLIC_TURNSTILE_SITE_KEY?: unknown;
    CPM_TURNSTILE_EXPECTED_HOSTNAME?: unknown;
    CPM_TURNSTILE_EXPECTED_ACTION?: unknown;
  }
>;

export interface SubmissionTurnstileClientConfiguration {
  siteKey: string;
  action: string;
}

export interface SubmissionTurnstileConfiguration {
  verifier: SubmissionChallengeVerifier;
  client: SubmissionTurnstileClientConfiguration;
  expectedHostname: string;
}

export interface SubmissionTurnstileEnvironmentOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class SubmissionTurnstileConfigurationError extends Error {
  constructor() {
    super('Submission Turnstile configuration is unavailable.');
    this.name = 'SubmissionTurnstileConfigurationError';
  }
}

export function createSubmissionTurnstileConfigurationFromEnvironment(
  environment: SubmissionTurnstileEnvironment,
  options: SubmissionTurnstileEnvironmentOptions = {},
): SubmissionTurnstileConfiguration {
  const parsed = submissionTurnstileEnvironmentSchema.safeParse({
    CPM_TURNSTILE_SECRET_KEY: environment.CPM_TURNSTILE_SECRET_KEY,
    PUBLIC_TURNSTILE_SITE_KEY: environment.PUBLIC_TURNSTILE_SITE_KEY,
    CPM_TURNSTILE_EXPECTED_HOSTNAME: environment.CPM_TURNSTILE_EXPECTED_HOSTNAME,
    CPM_TURNSTILE_EXPECTED_ACTION: environment.CPM_TURNSTILE_EXPECTED_ACTION,
  });
  if (!parsed.success) throw new SubmissionTurnstileConfigurationError();

  try {
    const verifier = createTurnstileSiteverifyVerifier({
      secretKey: parsed.data.CPM_TURNSTILE_SECRET_KEY,
      expectedHostname: parsed.data.CPM_TURNSTILE_EXPECTED_HOSTNAME,
      expectedAction: parsed.data.CPM_TURNSTILE_EXPECTED_ACTION,
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    });

    return {
      verifier,
      client: {
        siteKey: parsed.data.PUBLIC_TURNSTILE_SITE_KEY,
        action: parsed.data.CPM_TURNSTILE_EXPECTED_ACTION,
      },
      expectedHostname: parsed.data.CPM_TURNSTILE_EXPECTED_HOSTNAME,
    };
  } catch {
    throw new SubmissionTurnstileConfigurationError();
  }
}
