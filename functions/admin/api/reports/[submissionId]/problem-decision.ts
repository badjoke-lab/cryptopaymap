import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import {
  SubmissionReviewAuthorizationError,
  authorizeProblemReportMutation,
  readProblemReportDecisionAuthorizationPolicy,
  readUrgentVisibilityAuthorizationPolicy,
  type ProblemReportMutationContext,
  type SubmissionReviewAuthorizationEnvironment,
} from '../../../../../src/admin/submissions/authorization';
import { createDrizzleProblemReportDecisionBackend } from '../../../../../src/admin/submissions/drizzle-problem-report-decision-backend';
import {
  ProblemReportDecisionError,
  decideProblemReport,
  type ProblemReportDecisionReceipt,
} from '../../../../../src/admin/submissions/problem-report-decision';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';

interface ProblemDecisionEnvironment extends SubmissionReviewAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface ProblemDecisionPagesContext {
  request: Request;
  env: ProblemDecisionEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type ProblemDecisionRunner = (
  context: ProblemReportMutationContext,
  submissionId: string,
  rawRequest: unknown,
  environment: ProblemDecisionEnvironment,
  decidedAt: Date,
) => Promise<ProblemReportDecisionReceipt>;

export interface ProblemDecisionHandlerDependencies {
  runDecision?: ProblemDecisionRunner;
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

async function runDecisionFromDatabase(
  context: ProblemReportMutationContext,
  submissionId: string,
  rawRequest: unknown,
  environment: ProblemDecisionEnvironment,
  decidedAt: Date,
): Promise<ProblemReportDecisionReceipt> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new ProblemReportDecisionError(
      'backend_failure',
      'The problem report database is unavailable.',
    );
  }
  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return decideProblemReport(
    context,
    createDrizzleProblemReportDecisionBackend(database),
    submissionId,
    rawRequest,
    decidedAt,
  );
}

export function createProblemDecisionHandler(
  dependencies: ProblemDecisionHandlerDependencies = {},
) {
  const runner = dependencies.runDecision ?? runDecisionFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: ProblemDecisionPagesContext): Promise<Response> => {
    let context: ProblemReportMutationContext;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const problemPolicy = readProblemReportDecisionAuthorizationPolicy(pagesContext.env);
      const urgentPolicy = readUrgentVisibilityAuthorizationPolicy(pagesContext.env);
      context = authorizeProblemReportMutation(identity, problemPolicy, urgentPolicy);
    } catch (error) {
      if (
        error instanceof SubmissionReviewAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'problem_decision_unavailable' });
      }
      return jsonResponse(403, { error: 'problem_decision_denied' });
    }

    const submissionId = pagesContext.params.submissionId;
    if (typeof submissionId !== 'string') {
      return jsonResponse(400, { error: 'problem_decision_invalid_request' });
    }
    const contentType = pagesContext.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return jsonResponse(415, { error: 'problem_decision_json_required' });
    }

    let rawRequest: unknown;
    try {
      rawRequest = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'problem_decision_invalid_request' });
    }

    try {
      return jsonResponse(
        200,
        await runner(context, submissionId, rawRequest, pagesContext.env, now()),
      );
    } catch (error) {
      if (error instanceof ProblemReportDecisionError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'problem_decision_denied' });
        }
        if (
          error.code === 'invalid_request' ||
          error.code === 'invalid_projection' ||
          error.code === 'ineligible'
        ) {
          return jsonResponse(400, { error: 'problem_decision_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'problem_decision_not_found' });
        }
        if (error.code === 'conflict' || error.code === 'idempotency_conflict') {
          return jsonResponse(409, { error: 'problem_decision_conflict' });
        }
      }
      return jsonResponse(503, { error: 'problem_decision_unavailable' });
    }
  };
}

export const onRequestPost = createProblemDecisionHandler();
