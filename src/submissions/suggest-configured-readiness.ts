import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { createDatabase } from '../db/client';
import { requiredDatabaseEnvironmentSchema } from '../schemas/environment';
import type { SubmissionRateLimitDurableObjectNamespace } from './durable-object-rate-limit';
import {
  createSuggestHttpRuntimeFromEnvironment,
  type SuggestHttpEnvironment,
} from './suggest-http-environment';

const durableObjectReadinessResponseSchema = z
  .object({ status: z.literal('ready') })
  .strict();

export const suggestReadinessTokenSchema = z.string().min(32).max(512).regex(/^\S+$/);

export type SuggestConfiguredReadinessEnvironment = SuggestHttpEnvironment &
  Readonly<{
    CPM_SUGGEST_READINESS_TOKEN?: unknown;
  }>;

export interface SuggestConfiguredReadinessProbes {
  probeDatabase?(databaseUrl: string): Promise<void>;
  probeRateLimitProvider?(namespace: SubmissionRateLimitDurableObjectNamespace): Promise<void>;
}

export class SuggestConfiguredReadinessError extends Error {
  constructor() {
    super('Suggest configured environment is unavailable.');
    this.name = 'SuggestConfiguredReadinessError';
  }
}

function isDurableObjectNamespace(
  value: unknown,
): value is SubmissionRateLimitDurableObjectNamespace {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.idFromName === 'function' && typeof candidate.get === 'function';
}

async function probeDatabase(databaseUrl: string): Promise<void> {
  const database = createDatabase(databaseUrl);
  await database.execute(sql`select 1 as ready`);
}

async function probeRateLimitProvider(
  namespace: SubmissionRateLimitDurableObjectNamespace,
): Promise<void> {
  const id = namespace.idFromName('configured-readiness-v1');
  const stub = namespace.get(id);
  const response = await stub.fetch(
    new Request('https://submission-rate-limit.internal/health', { method: 'GET' }),
  );
  if (!response.ok) throw new Error('Rate-limit provider readiness failed.');
  const parsed = durableObjectReadinessResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Rate-limit provider readiness response is invalid.');
}

export async function verifySuggestConfiguredReadiness(
  environment: SuggestConfiguredReadinessEnvironment,
  probes: SuggestConfiguredReadinessProbes = {},
): Promise<void> {
  try {
    createSuggestHttpRuntimeFromEnvironment(environment);
    const databaseEnvironment = requiredDatabaseEnvironmentSchema.parse({
      DATABASE_URL: environment.DATABASE_URL,
    });
    if (!isDurableObjectNamespace(environment.SUBMISSION_RATE_LIMIT_BUCKETS)) {
      throw new Error('Durable Object namespace binding is unavailable.');
    }

    await (probes.probeDatabase ?? probeDatabase)(databaseEnvironment.DATABASE_URL);
    await (probes.probeRateLimitProvider ?? probeRateLimitProvider)(
      environment.SUBMISSION_RATE_LIMIT_BUCKETS,
    );
  } catch {
    throw new SuggestConfiguredReadinessError();
  }
}
