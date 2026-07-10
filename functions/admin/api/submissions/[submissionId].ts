import { withAdminSecurityHeaders } from '../../../../src/admin/access/config';
import { createDrizzleCanonicalTargetSearchBackend } from '../../../../src/admin/promotion/drizzle-target-search-backend';
import {
  SubmissionReviewAuthorizationError,
  authorizeSubmissionReviewRead,
  readSubmissionReviewAuthorizationPolicy,
  type SubmissionReviewAuthorizationEnvironment,
} from '../../../../src/admin/submissions/authorization';
import {
  SuggestSubmissionReviewDetailError,
  loadSuggestSubmissionReviewDetail,
  type SuggestSubmissionReviewDetailResponse,
} from '../../../../src/admin/submissions/detail';
import { createDrizzleSuggestSubmissionDetailBackend } from '../../../../src/admin/submissions/drizzle-suggest-submission-detail-backend';
import { readProtectedAdminIdentity } from '../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../src/schemas/environment';
import { createDrizzleSuggestCandidateSignalSearchBackend } from '../../../../src/submissions/drizzle-suggest-candidate-signal-backend';

interface SubmissionDetailEnvironment extends SubmissionReviewAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface SubmissionDetailPagesContext {
  request: Request;
  env: SubmissionDetailEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type SubmissionDetailLoader = (
  context: ReturnType<typeof authorizeSubmissionReviewRead>,
  submissionId: string,
  environment: SubmissionDetailEnvironment,
  asOf: Date,
) => Promise<SuggestSubmissionReviewDetailResponse>;

export interface SubmissionDetailHandlerDependencies {
  loadDetail?: SubmissionDetailLoader;
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

async function loadSubmissionDetailFromDatabase(
  context: ReturnType<typeof authorizeSubmissionReviewRead>,
  submissionId: string,
  environment: SubmissionDetailEnvironment,
  asOf: Date,
): Promise<SuggestSubmissionReviewDetailResponse> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new SuggestSubmissionReviewDetailError(
      'backend_failure',
      'The Submission detail database is unavailable.',
    );
  }

  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return loadSuggestSubmissionReviewDetail(
    context,
    createDrizzleSuggestSubmissionDetailBackend(database),
    {
      candidateBackend: createDrizzleSuggestCandidateSignalSearchBackend(database),
      canonicalTargetBackend: createDrizzleCanonicalTargetSearchBackend(database),
    },
    submissionId,
    asOf,
  );
}

export function createSubmissionDetailHandler(
  dependencies: SubmissionDetailHandlerDependencies = {},
) {
  const detailLoader = dependencies.loadDetail ?? loadSubmissionDetailFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: SubmissionDetailPagesContext): Promise<Response> => {
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
        return jsonResponse(503, { error: 'submission_detail_unavailable' });
      }
      return jsonResponse(403, { error: 'submission_detail_denied' });
    }

    const submissionId = pagesContext.params.submissionId;
    if (typeof submissionId !== 'string') {
      return jsonResponse(400, { error: 'submission_detail_invalid_id' });
    }

    try {
      return jsonResponse(
        200,
        await detailLoader(context, submissionId, pagesContext.env, now()),
      );
    } catch (error) {
      if (error instanceof SuggestSubmissionReviewDetailError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'submission_detail_denied' });
        }
        if (error.code === 'invalid_submission_id') {
          return jsonResponse(400, { error: 'submission_detail_invalid_id' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'submission_detail_not_found' });
        }
      }
      return jsonResponse(503, { error: 'submission_detail_unavailable' });
    }
  };
}

export const onRequestGet = createSubmissionDetailHandler();
