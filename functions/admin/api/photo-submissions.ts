import { withAdminSecurityHeaders } from '../../../src/admin/access/config';
import {
  SubmissionReviewAuthorizationError,
  authorizeSubmissionReviewRead,
  readSubmissionReviewAuthorizationPolicy,
  type SubmissionReviewAuthorizationEnvironment,
} from '../../../src/admin/submissions/authorization';
import { createDrizzlePhotoSubmissionQueueBackend } from '../../../src/admin/submissions/drizzle-photo-parent-backend';
import {
  loadPhotoSubmissionQueue,
  parsePhotoSubmissionQueueQuery,
  PhotoParentReviewError,
  type PhotoSubmissionQueueQuery,
  type PhotoSubmissionQueueResponse,
} from '../../../src/admin/submissions/photo-parent';
import { readProtectedAdminIdentity } from '../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../src/schemas/environment';

interface PhotoQueueEnvironment extends SubmissionReviewAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface PhotoQueuePagesContext {
  request: Request;
  env: PhotoQueueEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type PhotoQueueLoader = (
  context: ReturnType<typeof authorizeSubmissionReviewRead>,
  query: PhotoSubmissionQueueQuery,
  environment: PhotoQueueEnvironment,
  asOf: Date,
) => Promise<PhotoSubmissionQueueResponse>;

export interface PhotoQueueHandlerDependencies {
  loadQueue?: PhotoQueueLoader;
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

async function loadQueueFromDatabase(
  context: ReturnType<typeof authorizeSubmissionReviewRead>,
  query: PhotoSubmissionQueueQuery,
  environment: PhotoQueueEnvironment,
  asOf: Date,
): Promise<PhotoSubmissionQueueResponse> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new PhotoParentReviewError(
      'backend_failure',
      'The Photos queue database is unavailable.',
    );
  }
  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return loadPhotoSubmissionQueue(
    context,
    createDrizzlePhotoSubmissionQueueBackend(database),
    query,
    asOf,
  );
}

export function createPhotoQueueHandler(dependencies: PhotoQueueHandlerDependencies = {}) {
  const loadQueue = dependencies.loadQueue ?? loadQueueFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: PhotoQueuePagesContext): Promise<Response> => {
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
        return jsonResponse(503, { error: 'photo_submission_queue_unavailable' });
      }
      return jsonResponse(403, { error: 'photo_submission_queue_denied' });
    }

    let query: PhotoSubmissionQueueQuery;
    try {
      query = parsePhotoSubmissionQueueQuery(new URL(pagesContext.request.url));
    } catch {
      return jsonResponse(400, { error: 'photo_submission_queue_invalid_query' });
    }

    try {
      return jsonResponse(200, await loadQueue(context, query, pagesContext.env, now()));
    } catch (error) {
      if (error instanceof PhotoParentReviewError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'photo_submission_queue_denied' });
        }
        if (error.code === 'invalid_query') {
          return jsonResponse(400, { error: 'photo_submission_queue_invalid_query' });
        }
      }
      return jsonResponse(503, { error: 'photo_submission_queue_unavailable' });
    }
  };
}

export const onRequestGet = createPhotoQueueHandler();
