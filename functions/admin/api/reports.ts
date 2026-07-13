import { withAdminSecurityHeaders } from '../../../src/admin/access/config';
import {
  SubmissionReviewAuthorizationError,
  authorizeSubmissionReviewRead,
  readSubmissionReviewAuthorizationPolicy,
  type SubmissionReviewAuthorizationEnvironment,
} from '../../../src/admin/submissions/authorization';
import { createDrizzleReportSubmissionQueueBackend } from '../../../src/admin/submissions/drizzle-report-submission-queue-backend';
import {
  ReportSubmissionQueueError,
  loadReportSubmissionQueue,
  parseReportSubmissionQueueQuery,
  type ReportSubmissionQueueQuery,
  type ReportSubmissionQueueResponse,
} from '../../../src/admin/submissions/report-queue';
import { readProtectedAdminIdentity } from '../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../src/schemas/environment';

interface ReportQueueEnvironment extends SubmissionReviewAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface ReportQueuePagesContext {
  request: Request;
  env: ReportQueueEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type ReportQueueLoader = (
  context: ReturnType<typeof authorizeSubmissionReviewRead>,
  query: ReportSubmissionQueueQuery,
  environment: ReportQueueEnvironment,
  asOf: Date,
) => Promise<ReportSubmissionQueueResponse>;

export interface ReportQueueHandlerDependencies {
  loadQueue?: ReportQueueLoader;
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

async function loadReportQueueFromDatabase(
  context: ReturnType<typeof authorizeSubmissionReviewRead>,
  query: ReportSubmissionQueueQuery,
  environment: ReportQueueEnvironment,
  asOf: Date,
): Promise<ReportSubmissionQueueResponse> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new ReportSubmissionQueueError(
      'backend_failure',
      'The report queue database is unavailable.',
    );
  }
  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return loadReportSubmissionQueue(
    context,
    createDrizzleReportSubmissionQueueBackend(database),
    query,
    asOf,
  );
}

export function createReportQueueHandler(dependencies: ReportQueueHandlerDependencies = {}) {
  const queueLoader = dependencies.loadQueue ?? loadReportQueueFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: ReportQueuePagesContext): Promise<Response> => {
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
        return jsonResponse(503, { error: 'report_queue_unavailable' });
      }
      return jsonResponse(403, { error: 'report_queue_denied' });
    }

    let query: ReportSubmissionQueueQuery;
    try {
      query = parseReportSubmissionQueueQuery(new URL(pagesContext.request.url));
    } catch {
      return jsonResponse(400, { error: 'report_queue_invalid_query' });
    }

    try {
      return jsonResponse(200, await queueLoader(context, query, pagesContext.env, now()));
    } catch (error) {
      if (error instanceof ReportSubmissionQueueError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'report_queue_denied' });
        }
        if (error.code === 'invalid_query') {
          return jsonResponse(400, { error: 'report_queue_invalid_query' });
        }
      }
      return jsonResponse(503, { error: 'report_queue_unavailable' });
    }
  };
}

export const onRequestGet = createReportQueueHandler();
