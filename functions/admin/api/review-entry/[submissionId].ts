import { withAdminSecurityHeaders } from '../../../../src/admin/access/config';
import { createDrizzleReviewEntryBackend } from '../../../../src/admin/submissions/drizzle-review-entry-backend';
import {
  SubmissionReviewEntryAuthorizationError,
  authorizeSubmissionReviewEntry,
  readSubmissionReviewEntryAuthorizationPolicy,
  type SubmissionReviewEntryAuthorizationEnvironment,
} from '../../../../src/admin/submissions/review-entry-authorization';
import {
  ReviewEntryError,
  applySubmissionReviewEntry,
  type ReviewEntryReceipt,
} from '../../../../src/admin/submissions/review-entry';
import { readProtectedAdminIdentity } from '../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../src/schemas/environment';

interface ReviewEntryEnvironment extends SubmissionReviewEntryAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface ReviewEntryPagesContext {
  request: Request;
  env: ReviewEntryEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type ReviewEntryRunner = (
  context: ReturnType<typeof authorizeSubmissionReviewEntry>,
  submissionId: string,
  rawRequest: unknown,
  environment: ReviewEntryEnvironment,
  changedAt: Date,
) => Promise<ReviewEntryReceipt>;

export interface ReviewEntryHandlerDependencies {
  runReviewEntry?: ReviewEntryRunner;
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

async function runReviewEntryFromDatabase(
  context: ReturnType<typeof authorizeSubmissionReviewEntry>,
  submissionId: string,
  rawRequest: unknown,
  environment: ReviewEntryEnvironment,
  changedAt: Date,
): Promise<ReviewEntryReceipt> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new ReviewEntryError(
      'backend_failure',
      'The Submission review-entry database is unavailable.',
    );
  }
  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return applySubmissionReviewEntry(
    context,
    createDrizzleReviewEntryBackend(database),
    submissionId,
    rawRequest,
    changedAt,
  );
}

export function createReviewEntryHandler(dependencies: ReviewEntryHandlerDependencies = {}) {
  const runner = dependencies.runReviewEntry ?? runReviewEntryFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: ReviewEntryPagesContext): Promise<Response> => {
    let context: ReturnType<typeof authorizeSubmissionReviewEntry>;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readSubmissionReviewEntryAuthorizationPolicy(pagesContext.env);
      context = authorizeSubmissionReviewEntry(identity, policy);
    } catch (error) {
      if (
        error instanceof SubmissionReviewEntryAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'submission_review_entry_unavailable' });
      }
      return jsonResponse(403, { error: 'submission_review_entry_denied' });
    }

    const submissionId = pagesContext.params.submissionId;
    if (typeof submissionId !== 'string') {
      return jsonResponse(400, { error: 'submission_review_entry_invalid_request' });
    }

    const contentType = pagesContext.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return jsonResponse(415, { error: 'submission_review_entry_json_required' });
    }

    let rawRequest: unknown;
    try {
      rawRequest = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'submission_review_entry_invalid_request' });
    }

    try {
      const receipt = await runner(context, submissionId, rawRequest, pagesContext.env, now());
      return jsonResponse(200, receipt);
    } catch (error) {
      if (error instanceof ReviewEntryError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'submission_review_entry_denied' });
        }
        if (error.code === 'invalid_request') {
          return jsonResponse(400, { error: 'submission_review_entry_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'submission_review_entry_not_found' });
        }
        if (error.code === 'conflict' || error.code === 'idempotency_conflict') {
          return jsonResponse(409, { error: 'submission_review_entry_conflict' });
        }
      }
      return jsonResponse(503, { error: 'submission_review_entry_unavailable' });
    }
  };
}

export const onRequestPost = createReviewEntryHandler();
