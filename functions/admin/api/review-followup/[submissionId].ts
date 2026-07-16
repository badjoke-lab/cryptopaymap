import { withAdminSecurityHeaders } from '../../../../src/admin/access/config';
import { createDrizzleReviewFollowupBackend } from '../../../../src/admin/submissions/drizzle-review-followup-backend';
import {
  SubmissionReviewFollowupAuthorizationError,
  authorizeSubmissionReviewFollowup,
  readSubmissionReviewFollowupAuthorizationPolicy,
  type SubmissionReviewFollowupAuthorizationEnvironment,
} from '../../../../src/admin/submissions/review-followup-authorization';
import {
  ReviewFollowupError,
  applySubmissionReviewFollowup,
  type ReviewFollowupReceipt,
} from '../../../../src/admin/submissions/review-followup';
import { readProtectedAdminIdentity } from '../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../src/schemas/environment';

interface ReviewFollowupEnvironment extends SubmissionReviewFollowupAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface ReviewFollowupPagesContext {
  request: Request;
  env: ReviewFollowupEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type ReviewFollowupRunner = (
  context: ReturnType<typeof authorizeSubmissionReviewFollowup>,
  submissionId: string,
  rawRequest: unknown,
  environment: ReviewFollowupEnvironment,
  changedAt: Date,
) => Promise<ReviewFollowupReceipt>;

export interface ReviewFollowupHandlerDependencies {
  runReviewFollowup?: ReviewFollowupRunner;
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

async function runReviewFollowupFromDatabase(
  context: ReturnType<typeof authorizeSubmissionReviewFollowup>,
  submissionId: string,
  rawRequest: unknown,
  environment: ReviewFollowupEnvironment,
  changedAt: Date,
): Promise<ReviewFollowupReceipt> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new ReviewFollowupError(
      'backend_failure',
      'The Submission review follow-up database is unavailable.',
    );
  }
  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return applySubmissionReviewFollowup(
    context,
    createDrizzleReviewFollowupBackend(database),
    submissionId,
    rawRequest,
    changedAt,
  );
}

export function createReviewFollowupHandler(dependencies: ReviewFollowupHandlerDependencies = {}) {
  const runner = dependencies.runReviewFollowup ?? runReviewFollowupFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: ReviewFollowupPagesContext): Promise<Response> => {
    let context: ReturnType<typeof authorizeSubmissionReviewFollowup>;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readSubmissionReviewFollowupAuthorizationPolicy(pagesContext.env);
      context = authorizeSubmissionReviewFollowup(identity, policy);
    } catch (error) {
      if (
        error instanceof SubmissionReviewFollowupAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'submission_review_followup_unavailable' });
      }
      return jsonResponse(403, { error: 'submission_review_followup_denied' });
    }

    const submissionId = pagesContext.params.submissionId;
    if (typeof submissionId !== 'string') {
      return jsonResponse(400, { error: 'submission_review_followup_invalid_request' });
    }

    const contentType = pagesContext.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return jsonResponse(415, { error: 'submission_review_followup_json_required' });
    }

    let rawRequest: unknown;
    try {
      rawRequest = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'submission_review_followup_invalid_request' });
    }

    try {
      const receipt = await runner(context, submissionId, rawRequest, pagesContext.env, now());
      return jsonResponse(200, receipt);
    } catch (error) {
      if (error instanceof ReviewFollowupError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'submission_review_followup_denied' });
        }
        if (error.code === 'invalid_request') {
          return jsonResponse(400, { error: 'submission_review_followup_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'submission_review_followup_not_found' });
        }
        if (error.code === 'conflict' || error.code === 'idempotency_conflict') {
          return jsonResponse(409, { error: 'submission_review_followup_conflict' });
        }
      }
      return jsonResponse(503, { error: 'submission_review_followup_unavailable' });
    }
  };
}

export const onRequestPost = createReviewFollowupHandler();
