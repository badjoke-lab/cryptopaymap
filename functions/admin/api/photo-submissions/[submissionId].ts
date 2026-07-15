import { withAdminSecurityHeaders } from '../../../../src/admin/access/config';
import {
  SubmissionReviewAuthorizationError,
  authorizeSubmissionReviewRead,
  readSubmissionReviewAuthorizationPolicy,
  type SubmissionReviewAuthorizationEnvironment,
} from '../../../../src/admin/submissions/authorization';
import { createDrizzlePhotoSubmissionDetailBackend } from '../../../../src/admin/submissions/drizzle-photo-parent-backend';
import {
  loadPhotoSubmissionDetail,
  PhotoParentReviewError,
  type PhotoSubmissionDetailResponse,
} from '../../../../src/admin/submissions/photo-parent';
import { readProtectedAdminIdentity } from '../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../src/schemas/environment';

interface PhotoDetailEnvironment extends SubmissionReviewAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface PhotoDetailPagesContext {
  request: Request;
  env: PhotoDetailEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type PhotoDetailLoader = (
  context: ReturnType<typeof authorizeSubmissionReviewRead>,
  submissionId: string,
  environment: PhotoDetailEnvironment,
  asOf: Date,
) => Promise<PhotoSubmissionDetailResponse>;

export interface PhotoDetailHandlerDependencies {
  loadDetail?: PhotoDetailLoader;
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

async function loadDetailFromDatabase(
  context: ReturnType<typeof authorizeSubmissionReviewRead>,
  submissionId: string,
  environment: PhotoDetailEnvironment,
  asOf: Date,
): Promise<PhotoSubmissionDetailResponse> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new PhotoParentReviewError(
      'backend_failure',
      'The Photos detail database is unavailable.',
    );
  }
  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return loadPhotoSubmissionDetail(
    context,
    createDrizzlePhotoSubmissionDetailBackend(database),
    submissionId,
    asOf,
  );
}

export function createPhotoDetailHandler(dependencies: PhotoDetailHandlerDependencies = {}) {
  const loadDetail = dependencies.loadDetail ?? loadDetailFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: PhotoDetailPagesContext): Promise<Response> => {
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
        return jsonResponse(503, { error: 'photo_submission_detail_unavailable' });
      }
      return jsonResponse(403, { error: 'photo_submission_detail_denied' });
    }

    const submissionId = pagesContext.params.submissionId;
    if (typeof submissionId !== 'string') {
      return jsonResponse(400, { error: 'photo_submission_detail_invalid_id' });
    }

    try {
      return jsonResponse(
        200,
        await loadDetail(context, submissionId, pagesContext.env, now()),
      );
    } catch (error) {
      if (error instanceof PhotoParentReviewError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'photo_submission_detail_denied' });
        }
        if (error.code === 'invalid_query') {
          return jsonResponse(400, { error: 'photo_submission_detail_invalid_id' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'photo_submission_detail_not_found' });
        }
      }
      return jsonResponse(503, { error: 'photo_submission_detail_unavailable' });
    }
  };
}

export const onRequestGet = createPhotoDetailHandler();
