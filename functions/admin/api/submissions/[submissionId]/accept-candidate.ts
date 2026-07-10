import { z } from 'zod';
import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import {
  SubmissionReviewAuthorizationError,
  authorizeSubmissionCandidateCreate,
  readSubmissionCandidateAuthorizationPolicy,
  type SubmissionReviewAuthorizationEnvironment,
} from '../../../../../src/admin/submissions/authorization';
import {
  SuggestAcceptedCandidateError,
  acceptSuggestSubmissionAsCandidate,
  type SuggestAcceptedCandidateReceipt,
} from '../../../../../src/admin/submissions/accepted-candidate';
import { createDrizzleSuggestAcceptedCandidateBackend } from '../../../../../src/admin/submissions/drizzle-accepted-candidate-backend';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';

interface AcceptedCandidateEnvironment extends SubmissionReviewAuthorizationEnvironment {
  DATABASE_URL?: string;
  CPM_USER_SUBMISSION_SOURCE_ID?: string;
}

interface AcceptedCandidatePagesContext {
  request: Request;
  env: AcceptedCandidateEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type AcceptedCandidateRunner = (
  context: ReturnType<typeof authorizeSubmissionCandidateCreate>,
  submissionId: string,
  sourceId: string,
  rawRequest: unknown,
  environment: AcceptedCandidateEnvironment,
  decidedAt: Date,
) => Promise<SuggestAcceptedCandidateReceipt>;

export interface AcceptedCandidateHandlerDependencies {
  runAcceptedCandidate?: AcceptedCandidateRunner;
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

async function runAcceptedCandidateFromDatabase(
  context: ReturnType<typeof authorizeSubmissionCandidateCreate>,
  submissionId: string,
  sourceId: string,
  rawRequest: unknown,
  environment: AcceptedCandidateEnvironment,
  decidedAt: Date,
): Promise<SuggestAcceptedCandidateReceipt> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new SuggestAcceptedCandidateError(
      'backend_failure',
      'The accepted-as-Candidate database is unavailable.',
    );
  }
  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return acceptSuggestSubmissionAsCandidate(
    context,
    createDrizzleSuggestAcceptedCandidateBackend(database),
    submissionId,
    sourceId,
    rawRequest,
    decidedAt,
  );
}

export function createAcceptedCandidateHandler(
  dependencies: AcceptedCandidateHandlerDependencies = {},
) {
  const runner = dependencies.runAcceptedCandidate ?? runAcceptedCandidateFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: AcceptedCandidatePagesContext): Promise<Response> => {
    let context: ReturnType<typeof authorizeSubmissionCandidateCreate>;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readSubmissionCandidateAuthorizationPolicy(pagesContext.env);
      context = authorizeSubmissionCandidateCreate(identity, policy);
    } catch (error) {
      if (
        error instanceof SubmissionReviewAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'accepted_candidate_unavailable' });
      }
      return jsonResponse(403, { error: 'accepted_candidate_denied' });
    }

    const submissionId = pagesContext.params.submissionId;
    const sourceIdResult = z.uuid().safeParse(pagesContext.env.CPM_USER_SUBMISSION_SOURCE_ID);
    if (typeof submissionId !== 'string') {
      return jsonResponse(400, { error: 'accepted_candidate_invalid_request' });
    }
    if (!sourceIdResult.success) {
      return jsonResponse(503, { error: 'accepted_candidate_unavailable' });
    }

    const contentType = pagesContext.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return jsonResponse(415, { error: 'accepted_candidate_json_required' });
    }

    let rawRequest: unknown;
    try {
      rawRequest = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'accepted_candidate_invalid_request' });
    }

    try {
      return jsonResponse(
        200,
        await runner(
          context,
          submissionId,
          sourceIdResult.data,
          rawRequest,
          pagesContext.env,
          now(),
        ),
      );
    } catch (error) {
      if (error instanceof SuggestAcceptedCandidateError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'accepted_candidate_denied' });
        }
        if (error.code === 'invalid_request' || error.code === 'invalid_projection') {
          return jsonResponse(400, { error: 'accepted_candidate_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'accepted_candidate_not_found' });
        }
        if (error.code === 'conflict' || error.code === 'idempotency_conflict') {
          return jsonResponse(409, { error: 'accepted_candidate_conflict' });
        }
      }
      return jsonResponse(503, { error: 'accepted_candidate_unavailable' });
    }
  };
}

export const onRequestPost = createAcceptedCandidateHandler();
