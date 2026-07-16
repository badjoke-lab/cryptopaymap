import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import { createDrizzlePhotoParentResolutionBackend } from '../../../../../src/admin/submissions/drizzle-photo-parent-resolution-backend';
import {
  PhotoParentResolutionAuthorizationError,
  authorizePhotoParentResolution,
  readPhotoParentResolutionAuthorizationPolicy,
  type PhotoParentResolutionAuthorizationEnvironment,
} from '../../../../../src/admin/submissions/photo-parent-resolution-authorization';
import {
  PhotoParentResolutionError,
  resolvePhotoParentSubmission,
  type PhotoParentResolutionReceipt,
} from '../../../../../src/admin/submissions/photo-parent-resolution';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';

interface PhotoParentResolutionEnvironment
  extends PhotoParentResolutionAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface PhotoParentResolutionPagesContext {
  request: Request;
  env: PhotoParentResolutionEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type PhotoParentResolutionRunner = (
  context: ReturnType<typeof authorizePhotoParentResolution>,
  submissionId: string,
  rawRequest: unknown,
  environment: PhotoParentResolutionEnvironment,
  changedAt: Date,
) => Promise<PhotoParentResolutionReceipt>;

export interface PhotoParentResolutionHandlerDependencies {
  runPhotoParentResolution?: PhotoParentResolutionRunner;
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

async function runPhotoParentResolutionFromDatabase(
  context: ReturnType<typeof authorizePhotoParentResolution>,
  submissionId: string,
  rawRequest: unknown,
  environment: PhotoParentResolutionEnvironment,
  changedAt: Date,
): Promise<PhotoParentResolutionReceipt> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new PhotoParentResolutionError(
      'backend_failure',
      'The Photos parent-resolution database is unavailable.',
    );
  }
  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return resolvePhotoParentSubmission(
    context,
    createDrizzlePhotoParentResolutionBackend(database),
    submissionId,
    rawRequest,
    changedAt,
  );
}

export function createPhotoParentResolutionHandler(
  dependencies: PhotoParentResolutionHandlerDependencies = {},
) {
  const runner =
    dependencies.runPhotoParentResolution ?? runPhotoParentResolutionFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: PhotoParentResolutionPagesContext): Promise<Response> => {
    let context: ReturnType<typeof authorizePhotoParentResolution>;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readPhotoParentResolutionAuthorizationPolicy(pagesContext.env);
      context = authorizePhotoParentResolution(identity, policy);
    } catch (error) {
      if (
        error instanceof PhotoParentResolutionAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'photo_parent_resolution_unavailable' });
      }
      return jsonResponse(403, { error: 'photo_parent_resolution_denied' });
    }

    const submissionId = pagesContext.params.submissionId;
    if (typeof submissionId !== 'string') {
      return jsonResponse(400, { error: 'photo_parent_resolution_invalid_request' });
    }

    const contentType = pagesContext.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return jsonResponse(415, { error: 'photo_parent_resolution_json_required' });
    }

    let rawRequest: unknown;
    try {
      rawRequest = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'photo_parent_resolution_invalid_request' });
    }

    try {
      const receipt = await runner(context, submissionId, rawRequest, pagesContext.env, now());
      return jsonResponse(200, receipt);
    } catch (error) {
      if (error instanceof PhotoParentResolutionError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'photo_parent_resolution_denied' });
        }
        if (error.code === 'invalid_request') {
          return jsonResponse(400, { error: 'photo_parent_resolution_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'photo_parent_resolution_not_found' });
        }
        if (error.code === 'ineligible') {
          return jsonResponse(422, { error: 'photo_parent_resolution_ineligible' });
        }
        if (error.code === 'conflict' || error.code === 'idempotency_conflict') {
          return jsonResponse(409, { error: 'photo_parent_resolution_conflict' });
        }
      }
      return jsonResponse(503, { error: 'photo_parent_resolution_unavailable' });
    }
  };
}

export const onRequestPost = createPhotoParentResolutionHandler();
