import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import {
  SubmissionReviewAuthorizationError,
  authorizePaymentReportEvidenceDecision,
  readPaymentReportEvidenceAuthorizationPolicy,
  type SubmissionReviewAuthorizationEnvironment,
} from '../../../../../src/admin/submissions/authorization';
import { createDrizzlePositivePaymentEvidenceBackend } from '../../../../../src/admin/submissions/drizzle-payment-report-evidence-backend';
import {
  PositivePaymentEvidenceError,
  decidePositivePaymentEvidence,
  type PositivePaymentEvidenceReceipt,
} from '../../../../../src/admin/submissions/payment-report-evidence';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';

interface PositivePaymentEvidenceEnvironment extends SubmissionReviewAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface PositivePaymentEvidencePagesContext {
  request: Request;
  env: PositivePaymentEvidenceEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type PositivePaymentEvidenceRunner = (
  context: ReturnType<typeof authorizePaymentReportEvidenceDecision>,
  submissionId: string,
  rawRequest: unknown,
  environment: PositivePaymentEvidenceEnvironment,
  decidedAt: Date,
) => Promise<PositivePaymentEvidenceReceipt>;

export interface PositivePaymentEvidenceHandlerDependencies {
  runDecision?: PositivePaymentEvidenceRunner;
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
  context: ReturnType<typeof authorizePaymentReportEvidenceDecision>,
  submissionId: string,
  rawRequest: unknown,
  environment: PositivePaymentEvidenceEnvironment,
  decidedAt: Date,
): Promise<PositivePaymentEvidenceReceipt> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new PositivePaymentEvidenceError(
      'backend_failure',
      'The positive payment Evidence database is unavailable.',
    );
  }
  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return decidePositivePaymentEvidence(
    context,
    createDrizzlePositivePaymentEvidenceBackend(database),
    submissionId,
    rawRequest,
    decidedAt,
  );
}

export function createPositivePaymentEvidenceHandler(
  dependencies: PositivePaymentEvidenceHandlerDependencies = {},
) {
  const runner = dependencies.runDecision ?? runDecisionFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: PositivePaymentEvidencePagesContext): Promise<Response> => {
    let context: ReturnType<typeof authorizePaymentReportEvidenceDecision>;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readPaymentReportEvidenceAuthorizationPolicy(pagesContext.env);
      context = authorizePaymentReportEvidenceDecision(identity, policy);
    } catch (error) {
      if (
        error instanceof SubmissionReviewAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'positive_payment_evidence_unavailable' });
      }
      return jsonResponse(403, { error: 'positive_payment_evidence_denied' });
    }

    const submissionId = pagesContext.params.submissionId;
    if (typeof submissionId !== 'string') {
      return jsonResponse(400, { error: 'positive_payment_evidence_invalid_request' });
    }
    const contentType = pagesContext.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return jsonResponse(415, { error: 'positive_payment_evidence_json_required' });
    }

    let rawRequest: unknown;
    try {
      rawRequest = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'positive_payment_evidence_invalid_request' });
    }

    try {
      return jsonResponse(
        200,
        await runner(context, submissionId, rawRequest, pagesContext.env, now()),
      );
    } catch (error) {
      if (error instanceof PositivePaymentEvidenceError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'positive_payment_evidence_denied' });
        }
        if (
          error.code === 'invalid_request' ||
          error.code === 'invalid_projection' ||
          error.code === 'ineligible'
        ) {
          return jsonResponse(400, { error: 'positive_payment_evidence_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'positive_payment_evidence_not_found' });
        }
        if (error.code === 'conflict' || error.code === 'idempotency_conflict') {
          return jsonResponse(409, { error: 'positive_payment_evidence_conflict' });
        }
      }
      return jsonResponse(503, { error: 'positive_payment_evidence_unavailable' });
    }
  };
}

export const onRequestPost = createPositivePaymentEvidenceHandler();
