import { withAdminSecurityHeaders } from '../../../src/admin/access/config';
import {
  ReconfirmationAuthorizationError,
  authorizeReconfirmationRead,
  readReconfirmationAuthorizationPolicy,
  type ReconfirmationAuthorizationEnvironment,
} from '../../../src/admin/reconfirmation/authorization';
import { createDrizzleProtectedReconfirmationWorkspaceBackend } from '../../../src/admin/reconfirmation/drizzle-protected-workspace-backend';
import {
  ReconfirmationWorkspaceError,
  loadProtectedReconfirmationQueue,
  parseProtectedReconfirmationQueueQuery,
  type ProtectedReconfirmationQueueResponse,
  type ReconfirmationReadContext,
} from '../../../src/admin/reconfirmation/protected-workspace';
import { readProtectedAdminIdentity } from '../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../src/schemas/environment';

interface ReconfirmationQueueEnvironment extends ReconfirmationAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface ReconfirmationQueuePagesContext {
  request: Request;
  env: ReconfirmationQueueEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type QueueLoader = (
  context: ReconfirmationReadContext,
  requestUrl: URL,
  environment: ReconfirmationQueueEnvironment,
  asOf: Date,
) => Promise<ProtectedReconfirmationQueueResponse>;

export interface ReconfirmationQueueHandlerDependencies {
  loadQueue?: QueueLoader;
  now?: () => Date;
}

function jsonResponse(status: number, body: unknown): Response {
  return withAdminSecurityHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }),
  );
}

async function loadQueueFromDatabase(
  context: ReconfirmationReadContext,
  requestUrl: URL,
  environment: ReconfirmationQueueEnvironment,
  asOf: Date,
) {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new ReconfirmationWorkspaceError(
      'backend_failure',
      'The reconfirmation database is unavailable.',
    );
  }
  return loadProtectedReconfirmationQueue(
    context,
    createDrizzleProtectedReconfirmationWorkspaceBackend(
      createDatabase(databaseEnvironment.data.DATABASE_URL),
    ),
    parseProtectedReconfirmationQueueQuery(requestUrl),
    asOf,
  );
}

export function createReconfirmationQueueHandler(
  dependencies: ReconfirmationQueueHandlerDependencies = {},
) {
  const queueLoader = dependencies.loadQueue ?? loadQueueFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: ReconfirmationQueuePagesContext): Promise<Response> => {
    let context: ReconfirmationReadContext;
    try {
      context = authorizeReconfirmationRead(
        readProtectedAdminIdentity(pagesContext.data.adminIdentity),
        readReconfirmationAuthorizationPolicy(pagesContext.env),
      );
    } catch (error) {
      if (
        error instanceof ReconfirmationAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'reconfirmation_queue_unavailable' });
      }
      return jsonResponse(403, { error: 'reconfirmation_queue_denied' });
    }

    try {
      return jsonResponse(
        200,
        await queueLoader(
          context,
          new URL(pagesContext.request.url),
          pagesContext.env,
          now(),
        ),
      );
    } catch (error) {
      if (error instanceof ReconfirmationWorkspaceError) {
        if (error.code === 'invalid_query') {
          return jsonResponse(400, { error: 'reconfirmation_queue_invalid_query' });
        }
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'reconfirmation_queue_denied' });
        }
      }
      return jsonResponse(503, { error: 'reconfirmation_queue_unavailable' });
    }
  };
}

export const onRequestGet = createReconfirmationQueueHandler();
