import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import {
  SubmissionReviewAuthorizationError,
  authorizeSubmissionTransition,
  readSubmissionTransitionAuthorizationPolicy,
  type SubmissionReviewAuthorizationEnvironment,
} from '../../../../../src/admin/submissions/authorization';
import { createDrizzleSuggestInformationRequestBackend } from '../../../../../src/admin/submissions/drizzle-suggest-information-request-backend';
import {
  SuggestInformationRequestError,
  requestSuggestSubmissionInformation,
  type SuggestInformationRequestReceipt,
} from '../../../../../src/admin/submissions/information-request';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';

interface InformationRequestEnvironment extends SubmissionReviewAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface InformationRequestPagesContext {
  request: Request;
  env: InformationRequestEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type InformationRequestRunner = (
  context: ReturnType<typeof authorizeSubmissionTransition>,
  submissionId: string,
  rawRequest: unknown,
  environment: InformationRequestEnvironment,
  changedAt: Date,
) => Promise<SuggestInformationRequestReceipt>;

export interface InformationRequestHandlerDependencies {
  runRequest?: InformationRequestRunner;
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

async function runInformationRequestFromDatabase(
  context: ReturnType<typeof authorizeSubmissionTransition>,
  submissionId: string,
  rawRequest: unknown,
  environment: InformationRequestEnvironment,
  changedAt: Date,
): Promise<SuggestInformationRequestReceipt> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new SuggestInformationRequestError(
      'backend_failure',
      'The information-request database is unavailable.',
    );
  }

  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return requestSuggestSubmissionInformation(
    context,
    createDrizzleSuggestInformationRequestBackend(database),
    submissionId,
    rawRequest,
    changedAt,
  );
}

export function createInformationRequestHandler(
  dependencies: InformationRequestHandlerDependencies = {},
) {
  const runner = dependencies.runRequest ?? runInformationRequestFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: InformationRequestPagesContext): Promise<Response> => {
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
        return jsonResponse(503, { error: 'information_request_unavailable' });
      }
      return jsonResponse(403, { error: 'information_request_denied' });
    }

    const submissionId = pagesContext.params.submissionId;
    if (typeof submissionId !== 'string') {
      return jsonResponse(400, { error: 'information_request_invalid_request' });
    }

    const contentType = pagesContext.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return jsonResponse(415, { error: 'information_request_json_required' });
    }

    let rawRequest: unknown;
    try {
      rawRequest = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'information_request_invalid_request' });
    }

    try {
      const receipt = await runner(context, submissionId, rawRequest, pagesContext.env, now());
      return jsonResponse(200, receipt);
    } catch (error) {
      if (error instanceof SuggestInformationRequestError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'information_request_denied' });
        }
        if (error.code === 'invalid_request') {
          return jsonResponse(400, { error: 'information_request_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'information_request_not_found' });
        }
        if (error.code === 'conflict' || error.code === 'idempotency_conflict') {
          return jsonResponse(409, { error: 'information_request_conflict' });
        }
      }
      return jsonResponse(503, { error: 'information_request_unavailable' });
    }
  };
}

export const onRequestPost = createInformationRequestHandler();
