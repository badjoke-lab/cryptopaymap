import { z } from 'zod';
import { createDatabase } from '../../db/client';
import { requiredDatabaseEnvironmentSchema } from '../../schemas/environment';
import { createDrizzleScheduledReconfirmationBackend } from './drizzle-scheduled-backend';
import {
  ScheduledReconfirmationError,
  type ScheduledReconfirmationBackend,
  type ScheduledReconfirmationRunReceipt,
} from './scheduled-contract';
import { scheduledReconfirmationRunId } from './scheduled-request-id';
import { createScheduledReconfirmationService } from './scheduled-run';

export const scheduledReconfirmationInvocationSchema = z
  .object({
    scheduledTime: z.number().finite().nonnegative(),
  })
  .strict();

export type ScheduledReconfirmationInvocation = z.infer<
  typeof scheduledReconfirmationInvocationSchema
>;

export interface ScheduledReconfirmationEnvironment {
  DATABASE_URL?: string;
}

type ScheduledReconfirmationBackendFactory = (
  databaseUrl: string,
) => ScheduledReconfirmationBackend;
type ScheduledReconfirmationRunIdFactory = (effectiveAt: string) => Promise<string>;

export interface ScheduledReconfirmationBoundaryDependencies {
  createBackend?: ScheduledReconfirmationBackendFactory;
  createRunId?: ScheduledReconfirmationRunIdFactory;
}

function createProductionBackend(databaseUrl: string): ScheduledReconfirmationBackend {
  return createDrizzleScheduledReconfirmationBackend(createDatabase(databaseUrl));
}

export function createScheduledReconfirmationBoundary(
  dependencies: ScheduledReconfirmationBoundaryDependencies = {},
) {
  const createBackend = dependencies.createBackend ?? createProductionBackend;
  const createRunId = dependencies.createRunId ?? scheduledReconfirmationRunId;

  return async (
    invocation: ScheduledReconfirmationInvocation,
    environment: ScheduledReconfirmationEnvironment,
  ): Promise<ScheduledReconfirmationRunReceipt> => {
    const invocationResult = scheduledReconfirmationInvocationSchema.safeParse(invocation);
    if (!invocationResult.success) {
      throw new ScheduledReconfirmationError(
        'invalid_run',
        'The scheduled reconfirmation invocation was invalid.',
        invocationResult.error.issues.map(
          (issue) => `${issue.path.join('.')}: ${issue.message}`,
        ),
      );
    }

    const effectiveAt = new Date(invocationResult.data.scheduledTime);
    if (Number.isNaN(effectiveAt.getTime())) {
      throw new ScheduledReconfirmationError(
        'invalid_run',
        'The scheduled reconfirmation time was invalid.',
      );
    }

    const environmentResult = requiredDatabaseEnvironmentSchema.safeParse({
      DATABASE_URL:
        typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
    });
    if (!environmentResult.success) {
      throw new ScheduledReconfirmationError(
        'backend_failure',
        'The scheduled reconfirmation database is unavailable.',
      );
    }

    let backend: ScheduledReconfirmationBackend;
    try {
      backend = createBackend(environmentResult.data.DATABASE_URL);
    } catch (error) {
      throw new ScheduledReconfirmationError(
        'backend_failure',
        'The scheduled reconfirmation backend could not be created.',
        [],
        { cause: error },
      );
    }

    const effectiveAtIso = effectiveAt.toISOString();
    let runId: string;
    try {
      runId = await createRunId(effectiveAtIso);
    } catch (error) {
      throw new ScheduledReconfirmationError(
        'backend_failure',
        'The scheduled reconfirmation run ID could not be derived.',
        [],
        { cause: error },
      );
    }

    return createScheduledReconfirmationService(backend).run(
      {
        runId,
        actorId: 'system:reconfirmation-scheduler',
        actorType: 'system',
        capabilities: ['claim:expire'],
      },
      {
        effectiveAt: effectiveAtIso,
        limit: 50,
        publicSummary: 'The review window expired before reconfirmation.',
        internalNote: 'Applied by the scheduled reconfirmation boundary.',
      },
    );
  };
}

export const runScheduledReconfirmation = createScheduledReconfirmationBoundary();
