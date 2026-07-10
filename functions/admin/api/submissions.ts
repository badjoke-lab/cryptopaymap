import { withAdminSecurityHeaders } from '../../../src/admin/access/config';
import {
  SubmissionReviewAuthorizationError,
  authorizeSubmissionReviewRead,
  readSubmissionReviewAuthorizationPolicy,
  type SubmissionReviewAuthorizationEnvironment,
} from '../../../src/admin/submissions/authorization';
import { createDrizzleSuggestSubmissionQueueBackend } from '../../../src/admin/submissions/drizzle-suggest-submission-queue-backend';
import {
  SuggestSubmissionQueueError,
  loadSuggestSubmissionQueue,
  parseSuggestSubmissionQueueQuery,
  type SuggestSubmissionQueueQuery,
  type SuggestSubmissionQueueResponse,
} from '../../../src/admin/submissions/queue';
import { readProtectedAdminIdentity } from '../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../src/schemas/environment';

interface SubmissionQueueEnvironment extends SubmissionReviewAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface SubmissionQueuePagesContext {
  request: Request;
  env: SubmissionQueueEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type SubmissionQueueLoader = (
  context: ReturnType<typeof authorizeSubmissionReviewRead>,
  query: SuggestSubmissionQueueQuery,
  environment: SubmissionQueueEnvironment,
  asOf: Date,
) => Promise<SuggestSubmissionQueueResponse>;

export interface SubmissionQueueHandlerDependencies {
  loadQueue?: SubmissionQueueLoader;
  now?: () => Date;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return withAdminSecurityHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }),
  );
}

async function loadSubmissionQueueFromDatabase(
  context: ReturnType<typeof authorizeSubmissionReviewRead>,
  query: SuggestSubmissionQueueQuery,
  environment: SubmissionQueueEnvironment,
  asOf: Date,
): Promise<SuggestSubmissionQueueResponse> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new SuggestSubmissionQueueError(
      'backend_failure',
      'The Submission queue database is unavailable.',
    );
  }
  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return loadSuggestSubmissionQueue(
    context,
    createDrizzleSuggestSubmissionQueueBackend(database),
    query,
    asOf,
  );
}

export function createSubmissionQueueHandler(
  dependencies: SubmissionQueueHandlerDependencies = {},
) {
  const queueLoader = dependencies.loadQueue ?? loadSubmissionQueueFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: SubmissionQueuePagesContext): Promise<Response> => {
    let context: ReturnType<typeof authorizeSubmissionReviewRead>;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readSubmissionReviewAuthorizationPolicy(pagesContext.env);
      context = authorizeSubmissionReviewRead(identity, policy);
    } catch (error) {
      if (
        error instanceof SubmissionReviewAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'submission_queue_unavailable' });
      }
      return jsonResponse(403, { error: 'submission_queue_denied' });
    }

    let query: SuggestSubmissionQueueQuery;
    try {
      query = parseSuggestSubmissionQueueQuery(new URL(pagesContext.request.url));
    } catch {
      return jsonResponse(400, { error: 'submission_queue_invalid_query' });
    }

    try {
      return jsonResponse(200, await queueLoader(context, query, pagesContext.env, now()));
    } catch (error) {
      if (error instanceof SuggestSubmissionQueueError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'submission_queue_denied' });
        }
        if (error.code === 'invalid_query') {
          return jsonResponse(400, { error: 'submission_queue_invalid_query' });
        }
      }
      return jsonResponse(503, { error: 'submission_queue_unavailable' });
    }
  };
}

export const onRequestGet = createSubmissionQueueHandler();
