import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import {
  SubmissionReviewAuthorizationError,
  authorizeSubmissionTransition,
  readSubmissionTransitionAuthorizationPolicy,
  type SubmissionReviewAuthorizationEnvironment,
} from '../../../../../src/admin/submissions/authorization';
import { createDrizzleSuggestReviewTransitionBackend } from '../../../../../src/admin/submissions/drizzle-suggest-review-transition-backend';
import {
  SuggestReviewTransitionError,
  applySuggestReviewTransition,
  type SuggestReviewTransitionReceipt,
} from '../../../../../src/admin/submissions/transitions';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';

interface SubmissionTransitionEnvironment extends SubmissionReviewAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface SubmissionTransitionPagesContext {
  request: Request;
  env: SubmissionTransitionEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type SubmissionTransitionRunner = (
  context: ReturnType<typeof authorizeSubmissionTransition>,
  submissionId: string,
  rawRequest: unknown,
  environment: SubmissionTransitionEnvironment,
  changedAt: Date,
) => Promise<SuggestReviewTransitionReceipt>;

export interface SubmissionTransitionHandlerDependencies {
  runTransition?: SubmissionTransitionRunner;
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

async function runSubmissionTransitionFromDatabase(
  context: ReturnType<typeof authorizeSubmissionTransition>,
  submissionId: string,
  rawRequest: unknown,
  environment: SubmissionTransitionEnvironment,
  changedAt: Date,
): Promise<SuggestReviewTransitionReceipt> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new SuggestReviewTransitionError(
      'backend_failure',
      'The Submission transition database is unavailable.',
    );
  }
  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return applySuggestReviewTransition(
    context,
    createDrizzleSuggestReviewTransitionBackend(database),
    submissionId,
    rawRequest,
    changedAt,
  );
}

export function createSubmissionTransitionHandler(
  dependencies: SubmissionTransitionHandlerDependencies = {},
) {
  const runner = dependencies.runTransition ?? runSubmissionTransitionFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: SubmissionTransitionPagesContext): Promise<Response> => {
    let context: ReturnType<typeof authorizeSubmissionTransition>;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readSubmissionTransitionAuthorizationPolicy(pagesContext.env);
      context = authorizeSubmissionTransition(identity, policy);
    } catch (error) {
      if (
        error instanceof SubmissionReviewAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'submission_transition_unavailable' });
      }
      return jsonResponse(403, { error: 'submission_transition_denied' });
    }

    const submissionId = pagesContext.params.submissionId;
    if (typeof submissionId !== 'string') {
      return jsonResponse(400, { error: 'submission_transition_invalid_request' });
    }

    const contentType = pagesContext.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return jsonResponse(415, { error: 'submission_transition_json_required' });
    }

    let rawRequest: unknown;
    try {
      rawRequest = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'submission_transition_invalid_request' });
    }

    try {
      const receipt = await runner(context, submissionId, rawRequest, pagesContext.env, now());
      return jsonResponse(200, receipt);
    } catch (error) {
      if (error instanceof SuggestReviewTransitionError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'submission_transition_denied' });
        }
        if (error.code === 'invalid_request') {
          return jsonResponse(400, { error: 'submission_transition_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'submission_transition_not_found' });
        }
        if (error.code === 'conflict' || error.code === 'idempotency_conflict') {
          return jsonResponse(409, { error: 'submission_transition_conflict' });
        }
      }
      return jsonResponse(503, { error: 'submission_transition_unavailable' });
    }
  };
}

export const onRequestPost = createSubmissionTransitionHandler();
