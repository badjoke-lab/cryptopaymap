import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
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

export type MediaFileLoadResult =
  | { status: 'ready'; body: BodyInit; mimeType: string; byteSize: number }
  | { status: 'not_found' }
  | { status: 'unsupported' }
  | { status: 'conflict' }
  | { status: 'unavailable' };

type MediaFileLoader = (
  fileId: string,
  environment: MediaFileEnvironment,
) => Promise<MediaFileLoadResult>;

export interface MediaFileHandlerDependencies {
  loadFile?: MediaFileLoader;
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

async function loadMediaFile(
  fileId: string,
  environment: MediaFileEnvironment,
): Promise<MediaFileLoadResult> {
  const url = databaseUrl(environment);
  if (url === null) return { status: 'unavailable' };

  try {
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
    if (row === undefined) return { status: 'not_found' };

    const allowedMimeTypes = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
    ]);
    if (!allowedMimeTypes.has(row.mimeType)) return { status: 'unsupported' };

    const bucket =
      row.storageScope === 'public'
        ? environment.CPM_MEDIA_PUBLIC_BUCKET
        : environment.CPM_MEDIA_PRIVATE_BUCKET;
    if (bucket === undefined) return { status: 'unavailable' };

    const object = await bucket.get(row.storageKey);
    if (object === null) return { status: 'not_found' };
    if (
      object.key !== row.storageKey ||
      object.size !== row.byteSize ||
      object.httpMetadata?.contentType !== row.mimeType ||
      object.customMetadata?.contentHash !== row.contentHash
    ) {
      return { status: 'conflict' };
    }
    return {
      status: 'ready',
      body: object.body as BodyInit,
      mimeType: row.mimeType,
      byteSize: row.byteSize,
    };
  } catch {
    return { status: 'unavailable' };
  }
}

export function createMediaFileGetHandler(
  dependencies: MediaFileHandlerDependencies = {},
) {
  const loader = dependencies.loadFile ?? loadMediaFile;
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
    const parsedFileId = z.uuid().safeParse(fileId);
    if (!parsedFileId.success) {
      return jsonResponse(400, { error: 'media_file_invalid_id' });
    }

    const result = await loader(parsedFileId.data, pagesContext.env);
    if (result.status === 'not_found') {
      return jsonResponse(404, { error: 'media_file_not_found' });
    }
    if (result.status === 'unsupported') {
      return jsonResponse(415, { error: 'media_file_unsupported' });
    }
    if (result.status === 'conflict') {
      return jsonResponse(409, { error: 'media_file_conflict' });
    }
    if (result.status === 'unavailable') {
      return jsonResponse(503, { error: 'media_file_unavailable' });
    }

    return withAdminSecurityHeaders(
      new Response(result.body, {
        status: 200,
        headers: {
          'Content-Type': result.mimeType,
          'Content-Length': String(result.byteSize),
          'Content-Disposition': 'inline',
          'X-Content-Type-Options': 'nosniff',
        },
      }),
    );
  };
}

export const onRequestGet = createMediaFileGetHandler();
