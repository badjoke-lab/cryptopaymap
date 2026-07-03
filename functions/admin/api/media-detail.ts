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
  loadMediaReviewDetail,
  type MediaReviewDetailResponse,
  type MediaReviewReadContext,
} from '../../../src/admin/media-review/workspace';
import { readProtectedAdminIdentity } from '../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../src/schemas/environment';

interface MediaDetailEnvironment extends MediaReviewAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface MediaDetailPagesContext {
  request: Request;
  env: MediaDetailEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type DetailLoader = (
  context: MediaReviewReadContext,
  mediaAssetId: string,
  environment: MediaDetailEnvironment,
  asOf: Date,
) => Promise<MediaReviewDetailResponse>;

export interface MediaDetailHandlerDependencies {
  loadDetail?: DetailLoader;
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

function databaseUrl(environment: MediaDetailEnvironment): string {
  const result = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!result.success) {
    throw new MediaReviewWorkspaceError(
      'backend_failure',
      'The Media review database is unavailable.',
    );
  }
  return result.data.DATABASE_URL;
}

async function loadDetailFromDatabase(
  context: MediaReviewReadContext,
  mediaAssetId: string,
  environment: MediaDetailEnvironment,
  asOf: Date,
) {
  return loadMediaReviewDetail(
    context,
    createDrizzleMediaReviewWorkspaceBackend(createDatabase(databaseUrl(environment))),
    mediaAssetId,
    asOf,
  );
}

function mediaAssetIdFromRequest(request: Request): string | null {
  return new URL(request.url).searchParams.get('mediaAssetId');
}

export function createMediaDetailGetHandler(
  dependencies: MediaDetailHandlerDependencies = {},
) {
  const detailLoader = dependencies.loadDetail ?? loadDetailFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: MediaDetailPagesContext): Promise<Response> => {
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
        return jsonResponse(503, { error: 'media_detail_unavailable' });
      }
      return jsonResponse(403, { error: 'media_detail_denied' });
    }

    const mediaAssetId = mediaAssetIdFromRequest(pagesContext.request);
    if (mediaAssetId === null) {
      return jsonResponse(400, { error: 'media_detail_invalid_id' });
    }

    try {
      return jsonResponse(
        200,
        await detailLoader(context, mediaAssetId, pagesContext.env, now()),
      );
    } catch (error) {
      if (error instanceof MediaReviewWorkspaceError) {
        if (error.code === 'invalid_media_id') {
          return jsonResponse(400, { error: 'media_detail_invalid_id' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'media_detail_not_found' });
        }
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'media_detail_denied' });
        }
      }
      return jsonResponse(503, { error: 'media_detail_unavailable' });
    }
  };
}

export const onRequestGet = createMediaDetailGetHandler();
