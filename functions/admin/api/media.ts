import { withAdminSecurityHeaders } from '../../../src/admin/access/config';
import {
  MediaReviewAuthorizationError,
  readMediaReviewAuthorizationPolicy,
  type MediaReviewAuthorizationEnvironment,
} from '../../../src/admin/media-review/authorization';
import { createDrizzleMediaReviewWorkspaceBackend } from '../../../src/admin/media-review/drizzle-workspace-backend';
import { authorizeMediaReviewRead } from '../../../src/admin/media-review/read-authorization';
import {
  MediaReviewWorkspaceError,
  loadMediaReviewQueue,
  parseMediaReviewQueueQuery,
  type MediaReviewQueueResponse,
  type MediaReviewReadContext,
} from '../../../src/admin/media-review/workspace';
import { readProtectedAdminIdentity } from '../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../src/schemas/environment';

interface MediaQueueEnvironment extends MediaReviewAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface MediaQueuePagesContext {
  request: Request;
  env: MediaQueueEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type QueueLoader = (
  context: MediaReviewReadContext,
  requestUrl: URL,
  environment: MediaQueueEnvironment,
  asOf: Date,
) => Promise<MediaReviewQueueResponse>;

export interface MediaQueueHandlerDependencies {
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
  context: MediaReviewReadContext,
  requestUrl: URL,
  environment: MediaQueueEnvironment,
  asOf: Date,
) {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new MediaReviewWorkspaceError(
      'backend_failure',
      'The Media review database is unavailable.',
    );
  }
  return loadMediaReviewQueue(
    context,
    createDrizzleMediaReviewWorkspaceBackend(
      createDatabase(databaseEnvironment.data.DATABASE_URL),
    ),
    parseMediaReviewQueueQuery(requestUrl),
    asOf,
  );
}

export function createMediaQueueHandler(dependencies: MediaQueueHandlerDependencies = {}) {
  const queueLoader = dependencies.loadQueue ?? loadQueueFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: MediaQueuePagesContext): Promise<Response> => {
    let context: MediaReviewReadContext;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      context = authorizeMediaReviewRead(
        identity,
        readMediaReviewAuthorizationPolicy(pagesContext.env),
      );
    } catch (error) {
      if (
        error instanceof MediaReviewAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'media_queue_unavailable' });
      }
      return jsonResponse(403, { error: 'media_queue_denied' });
    }

    try {
      const queue = await queueLoader(
        context,
        new URL(pagesContext.request.url),
        pagesContext.env,
        now(),
      );
      return jsonResponse(200, queue);
    } catch (error) {
      if (error instanceof MediaReviewWorkspaceError) {
        if (error.code === 'invalid_query') {
          return jsonResponse(400, { error: 'media_queue_invalid_query' });
        }
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'media_queue_denied' });
        }
      }
      return jsonResponse(503, { error: 'media_queue_unavailable' });
    }
  };
}

export const onRequestGet = createMediaQueueHandler();
