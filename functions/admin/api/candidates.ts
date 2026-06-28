import { withAdminSecurityHeaders } from '../../../src/admin/access/config';
import {
  CandidateQueueAuthorizationError,
  authorizeCandidateQueueRead,
  readCandidateQueueAuthorizationPolicy,
  type CandidateQueueAuthorizationEnvironment,
} from '../../../src/admin/candidates/authorization';
import { createDrizzleCandidateQueueBackend } from '../../../src/admin/candidates/drizzle-candidate-queue-backend';
import {
  CandidateQueueError,
  loadCandidateQueue,
  parseCandidateQueueQuery,
  type CandidateQueueContext,
  type CandidateQueueQuery,
  type CandidateQueueResponse,
} from '../../../src/admin/candidates/queue';
import { readProtectedAdminIdentity } from '../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../src/schemas/environment';

interface CandidateQueueEnvironment extends CandidateQueueAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface CandidateQueuePagesContext {
  request: Request;
  env: CandidateQueueEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type CandidateQueueLoader = (
  context: CandidateQueueContext,
  query: CandidateQueueQuery,
  environment: CandidateQueueEnvironment,
  asOf: Date,
) => Promise<CandidateQueueResponse>;

export interface CandidateQueueHandlerDependencies {
  loadQueue?: CandidateQueueLoader;
  now?: () => Date;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return withAdminSecurityHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    }),
  );
}

async function loadCandidateQueueFromDatabase(
  context: CandidateQueueContext,
  query: CandidateQueueQuery,
  environment: CandidateQueueEnvironment,
  asOf: Date,
): Promise<CandidateQueueResponse> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new CandidateQueueError(
      'backend_failure',
      'The Candidate queue database is unavailable.',
    );
  }

  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return loadCandidateQueue(
    context,
    createDrizzleCandidateQueueBackend(database),
    query,
    asOf,
  );
}

export function createCandidateQueueHandler(
  dependencies: CandidateQueueHandlerDependencies = {},
) {
  const queueLoader = dependencies.loadQueue ?? loadCandidateQueueFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: CandidateQueuePagesContext): Promise<Response> => {
    let candidateContext: CandidateQueueContext;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readCandidateQueueAuthorizationPolicy(pagesContext.env);
      candidateContext = authorizeCandidateQueueRead(identity, policy);
    } catch (error) {
      if (
        error instanceof CandidateQueueAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'candidate_queue_unavailable' });
      }
      return jsonResponse(403, { error: 'candidate_queue_denied' });
    }

    let query: CandidateQueueQuery;
    try {
      query = parseCandidateQueueQuery(new URL(pagesContext.request.url));
    } catch (error) {
      if (error instanceof CandidateQueueError && error.code === 'invalid_query') {
        return jsonResponse(400, { error: 'candidate_queue_invalid_query' });
      }
      return jsonResponse(400, { error: 'candidate_queue_invalid_query' });
    }

    try {
      const page = await queueLoader(candidateContext, query, pagesContext.env, now());
      return jsonResponse(200, page);
    } catch (error) {
      if (error instanceof CandidateQueueError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'candidate_queue_denied' });
        }
        if (error.code === 'invalid_query') {
          return jsonResponse(400, { error: 'candidate_queue_invalid_query' });
        }
      }
      return jsonResponse(503, { error: 'candidate_queue_unavailable' });
    }
  };
}

export const onRequestGet = createCandidateQueueHandler();
