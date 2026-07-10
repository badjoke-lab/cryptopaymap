import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import {
  SubmissionReviewAuthorizationError,
  authorizeSubmissionTransition,
  readSubmissionTransitionAuthorizationPolicy,
  type SubmissionReviewAuthorizationEnvironment,
} from '../../../../../src/admin/submissions/authorization';
import { createDrizzleSuggestHoldBackend } from '../../../../../src/admin/submissions/drizzle-suggest-hold-backend';
import {
  SuggestHoldError,
  placeSuggestSubmissionOnHold,
  type SuggestHoldReceipt,
} from '../../../../../src/admin/submissions/hold';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';

interface HoldEnvironment extends SubmissionReviewAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface HoldPagesContext {
  request: Request;
  env: HoldEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type HoldRunner = (
  context: ReturnType<typeof authorizeSubmissionTransition>,
  submissionId: string,
  rawRequest: unknown,
  environment: HoldEnvironment,
  changedAt: Date,
) => Promise<SuggestHoldReceipt>;

export interface HoldHandlerDependencies {
  runHold?: HoldRunner;
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

async function runHoldFromDatabase(
  context: ReturnType<typeof authorizeSubmissionTransition>,
  submissionId: string,
  rawRequest: unknown,
  environment: HoldEnvironment,
  changedAt: Date,
): Promise<SuggestHoldReceipt> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new SuggestHoldError('backend_failure', 'The Hold database is unavailable.');
  }

  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return placeSuggestSubmissionOnHold(
    context,
    createDrizzleSuggestHoldBackend(database),
    submissionId,
    rawRequest,
    changedAt,
  );
}

export function createHoldHandler(dependencies: HoldHandlerDependencies = {}) {
  const runner = dependencies.runHold ?? runHoldFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: HoldPagesContext): Promise<Response> => {
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
        return jsonResponse(503, { error: 'submission_hold_unavailable' });
      }
      return jsonResponse(403, { error: 'submission_hold_denied' });
    }

    const submissionId = pagesContext.params.submissionId;
    if (typeof submissionId !== 'string') {
      return jsonResponse(400, { error: 'submission_hold_invalid_request' });
    }

    const contentType = pagesContext.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return jsonResponse(415, { error: 'submission_hold_json_required' });
    }

    let rawRequest: unknown;
    try {
      rawRequest = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'submission_hold_invalid_request' });
    }

    try {
      return jsonResponse(
        200,
        await runner(context, submissionId, rawRequest, pagesContext.env, now()),
      );
    } catch (error) {
      if (error instanceof SuggestHoldError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'submission_hold_denied' });
        }
        if (error.code === 'invalid_request') {
          return jsonResponse(400, { error: 'submission_hold_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'submission_hold_not_found' });
        }
        if (error.code === 'conflict' || error.code === 'idempotency_conflict') {
          return jsonResponse(409, { error: 'submission_hold_conflict' });
        }
      }
      return jsonResponse(503, { error: 'submission_hold_unavailable' });
    }
  };
}

export const onRequestPost = createHoldHandler();
