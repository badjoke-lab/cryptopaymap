import { and, eq, isNull } from 'drizzle-orm';
import { withAdminSecurityHeaders } from '../../../src/admin/access/config';
import {
  MediaReviewAuthorizationError,
  readMediaReviewAuthorizationPolicy,
  type MediaReviewAuthorizationEnvironment,
} from '../../../src/admin/media-review/authorization';
import type { R2BucketLike } from '../../../src/admin/media-review/r2-storage';
import { authorizeMediaReviewRead } from '../../../src/admin/media-review/read-authorization';
import { readProtectedAdminIdentity } from '../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../src/db/client';
import { mediaAssets, mediaFiles } from '../../../src/db/schema';
import { requiredDatabaseEnvironmentSchema } from '../../../src/schemas/environment';

interface MediaFileEnvironment extends MediaReviewAuthorizationEnvironment {
  DATABASE_URL?: string;
  CPM_MEDIA_PRIVATE_BUCKET?: R2BucketLike;
  CPM_MEDIA_PUBLIC_BUCKET?: R2BucketLike;
}

interface MediaFilePagesContext {
  request: Request;
  env: MediaFileEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

function jsonResponse(status: number, body: unknown): Response {
  return withAdminSecurityHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }),
  );
}

function databaseUrl(environment: MediaFileEnvironment): string | null {
  const result = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  return result.success ? result.data.DATABASE_URL : null;
}

export function createMediaFileGetHandler() {
  return async (pagesContext: MediaFilePagesContext): Promise<Response> => {
    try {
      authorizeMediaReviewRead(
        readProtectedAdminIdentity(pagesContext.data.adminIdentity),
        readMediaReviewAuthorizationPolicy(pagesContext.env),
      );
    } catch (error) {
      if (
        error instanceof MediaReviewAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'media_file_unavailable' });
      }
      return jsonResponse(403, { error: 'media_file_denied' });
    }

    const fileId = new URL(pagesContext.request.url).searchParams.get('fileId');
    const url = databaseUrl(pagesContext.env);
    if (fileId === null) return jsonResponse(400, { error: 'media_file_invalid_id' });
    if (url === null) return jsonResponse(503, { error: 'media_file_unavailable' });

    const rows = await createDatabase(url)
      .select({
        storageScope: mediaFiles.storageScope,
        storageKey: mediaFiles.storageKey,
        mimeType: mediaFiles.mimeType,
        byteSize: mediaFiles.byteSize,
        contentHash: mediaFiles.contentHash,
      })
      .from(mediaFiles)
      .innerJoin(mediaAssets, eq(mediaFiles.mediaAssetId, mediaAssets.id))
      .where(and(eq(mediaFiles.id, fileId), isNull(mediaAssets.deletedAt)))
      .limit(1);
    const row = rows[0];
    if (row === undefined) return jsonResponse(404, { error: 'media_file_not_found' });

    const allowedMimeTypes = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
    ]);
    if (!allowedMimeTypes.has(row.mimeType)) {
      return jsonResponse(415, { error: 'media_file_unsupported' });
    }

    const bucket =
      row.storageScope === 'public'
        ? pagesContext.env.CPM_MEDIA_PUBLIC_BUCKET
        : pagesContext.env.CPM_MEDIA_PRIVATE_BUCKET;
    if (bucket === undefined) return jsonResponse(503, { error: 'media_file_unavailable' });

    try {
      const object = await bucket.get(row.storageKey);
      if (object === null) return jsonResponse(404, { error: 'media_file_not_found' });
      if (
        object.key !== row.storageKey ||
        object.size !== row.byteSize ||
        object.httpMetadata?.contentType !== row.mimeType ||
        object.customMetadata?.contentHash !== row.contentHash
      ) {
        return jsonResponse(409, { error: 'media_file_conflict' });
      }
      return withAdminSecurityHeaders(
        new Response(object.body as BodyInit, {
          status: 200,
          headers: {
            'Content-Type': row.mimeType,
            'Content-Length': String(row.byteSize),
            'Content-Disposition': 'inline',
            'X-Content-Type-Options': 'nosniff',
          },
        }),
      );
    } catch {
      return jsonResponse(503, { error: 'media_file_unavailable' });
    }
  };
}

export const onRequestGet = createMediaFileGetHandler();
