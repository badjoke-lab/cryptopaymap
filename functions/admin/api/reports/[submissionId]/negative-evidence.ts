import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import {
  SubmissionReviewAuthorizationError,
  authorizeNegativeReportEvidenceDecision,
  readNegativeReportEvidenceAuthorizationPolicy,
  type SubmissionReviewAuthorizationEnvironment,
} from '../../../../../src/admin/submissions/authorization';
import { createDrizzleNegativeReportEvidenceBackend } from '../../../../../src/admin/submissions/drizzle-negative-report-evidence-backend';
import {
  NegativeReportEvidenceError,
  decideNegativeReportEvidence,
  type NegativeReportEvidenceReceipt,
} from '../../../../../src/admin/submissions/negative-report-evidence';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';

interface NegativeEvidenceEnvironment extends SubmissionReviewAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface NegativeEvidencePagesContext {
  request: Request;
  env: NegativeEvidenceEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type NegativeEvidenceRunner = (
  context: ReturnType<typeof authorizeNegativeReportEvidenceDecision>,
  submissionId: string,
  rawRequest: unknown,
  environment: NegativeEvidenceEnvironment,
  decidedAt: Date,
) => Promise<NegativeReportEvidenceReceipt>;

export interface NegativeEvidenceHandlerDependencies {
  runDecision?: NegativeEvidenceRunner;
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
  context: ReturnType<typeof authorizeNegativeReportEvidenceDecision>,
  submissionId: string,
  rawRequest: unknown,
  environment: NegativeEvidenceEnvironment,
  decidedAt: Date,
): Promise<NegativeReportEvidenceReceipt> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new NegativeReportEvidenceError(
      'backend_failure',
      'The negative Evidence database is unavailable.',
    );
  }
  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return decideNegativeReportEvidence(
    context,
    createDrizzleNegativeReportEvidenceBackend(database),
    submissionId,
    rawRequest,
    decidedAt,
  );
}

export function createNegativeEvidenceHandler(
  dependencies: NegativeEvidenceHandlerDependencies = {},
) {
  const runner = dependencies.runDecision ?? runDecisionFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: NegativeEvidencePagesContext): Promise<Response> => {
    let context: ReturnType<typeof authorizeNegativeReportEvidenceDecision>;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readNegativeReportEvidenceAuthorizationPolicy(pagesContext.env);
      context = authorizeNegativeReportEvidenceDecision(identity, policy);
    } catch (error) {
      if (
        error instanceof SubmissionReviewAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'negative_evidence_unavailable' });
      }
      return jsonResponse(403, { error: 'negative_evidence_denied' });
    }

    const submissionId = pagesContext.params.submissionId;
    if (typeof submissionId !== 'string') {
      return jsonResponse(400, { error: 'negative_evidence_invalid_request' });
    }
    const contentType = pagesContext.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return jsonResponse(415, { error: 'negative_evidence_json_required' });
    }

    let rawRequest: unknown;
    try {
      rawRequest = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'negative_evidence_invalid_request' });
    }

    try {
      return jsonResponse(
        200,
        await runner(context, submissionId, rawRequest, pagesContext.env, now()),
      );
    } catch (error) {
      if (error instanceof NegativeReportEvidenceError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'negative_evidence_denied' });
        }
        if (
          error.code === 'invalid_request' ||
          error.code === 'invalid_projection' ||
          error.code === 'ineligible'
        ) {
          return jsonResponse(400, { error: 'negative_evidence_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'negative_evidence_not_found' });
        }
        if (error.code === 'conflict' || error.code === 'idempotency_conflict') {
          return jsonResponse(409, { error: 'negative_evidence_conflict' });
        }
      }
      return jsonResponse(503, { error: 'negative_evidence_unavailable' });
    }
  };
}

export const onRequestPost = createNegativeEvidenceHandler();
