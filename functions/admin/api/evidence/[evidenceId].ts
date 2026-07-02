import { withAdminSecurityHeaders } from '../../../../src/admin/access/config';
import {
  EvidenceReviewAuthorizationError,
  authorizeEvidenceReview,
  readEvidenceReviewAuthorizationPolicy,
  type EvidenceReviewAuthorizationEnvironment,
} from '../../../../src/admin/evidence-review/authorization';
import {
  EvidenceReviewDecisionError,
  createEvidenceReviewDecisionService,
  type EvidenceReviewDecisionInput,
  type EvidenceReviewDecisionReceipt,
  type EvidenceReviewMutationContext,
} from '../../../../src/admin/evidence-review/decision';
import { createDrizzleEvidenceReviewBackend } from '../../../../src/admin/evidence-review/drizzle-backend';
import { createDrizzleEvidenceReviewWorkspaceBackend } from '../../../../src/admin/evidence-review/drizzle-workspace-backend';
import { authorizeEvidenceReviewRead } from '../../../../src/admin/evidence-review/read-authorization';
import {
  EvidenceReviewWorkspaceError,
  loadEvidenceReviewDetail,
  type EvidenceReviewDetailResponse,
  type EvidenceReviewReadContext,
} from '../../../../src/admin/evidence-review/workspace';
import { readProtectedAdminIdentity } from '../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../src/schemas/environment';

interface EvidenceDetailEnvironment extends EvidenceReviewAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface EvidenceDetailPagesContext {
  request: Request;
  env: EvidenceDetailEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type DetailLoader = (
  context: EvidenceReviewReadContext,
  evidenceId: string,
  environment: EvidenceDetailEnvironment,
  asOf: Date,
) => Promise<EvidenceReviewDetailResponse>;

type DecisionWriter = (
  context: EvidenceReviewMutationContext,
  evidenceId: string,
  body: unknown,
  environment: EvidenceDetailEnvironment,
  decidedAt: Date,
) => Promise<EvidenceReviewDecisionReceipt>;

export interface EvidenceDetailHandlerDependencies {
  loadDetail?: DetailLoader;
  writeDecision?: DecisionWriter;
  now?: () => Date;
}

function jsonResponse(status: number, body: unknown): Response {
  return withAdminSecurityHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }),
  );
}

function databaseUrl(environment: EvidenceDetailEnvironment): string {
  const result = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!result.success) {
    throw new EvidenceReviewWorkspaceError(
      'backend_failure',
      'The Evidence review database is unavailable.',
    );
  }
  return result.data.DATABASE_URL;
}

async function loadDetailFromDatabase(
  context: EvidenceReviewReadContext,
  evidenceId: string,
  environment: EvidenceDetailEnvironment,
  asOf: Date,
) {
  return loadEvidenceReviewDetail(
    context,
    createDrizzleEvidenceReviewWorkspaceBackend(createDatabase(databaseUrl(environment))),
    evidenceId,
    asOf,
  );
}

async function writeDecisionToDatabase(
  context: EvidenceReviewMutationContext,
  evidenceId: string,
  body: unknown,
  environment: EvidenceDetailEnvironment,
  decidedAt: Date,
) {
  const input = {
    ...(body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {}),
    evidenceId,
    decidedAt: decidedAt.toISOString(),
  } as EvidenceReviewDecisionInput;
  return createEvidenceReviewDecisionService(
    createDrizzleEvidenceReviewBackend(createDatabase(databaseUrl(environment))),
  ).decide(context, input);
}

function evidenceIdFromContext(pagesContext: EvidenceDetailPagesContext): string | null {
  const value = pagesContext.params.evidenceId;
  return typeof value === 'string' ? value : null;
}

export function createEvidenceDetailGetHandler(
  dependencies: EvidenceDetailHandlerDependencies = {},
) {
  const detailLoader = dependencies.loadDetail ?? loadDetailFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: EvidenceDetailPagesContext): Promise<Response> => {
    let context: EvidenceReviewReadContext;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      context = authorizeEvidenceReviewRead(
        identity,
        readEvidenceReviewAuthorizationPolicy(pagesContext.env),
      );
    } catch (error) {
      if (
        error instanceof EvidenceReviewAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'evidence_detail_unavailable' });
      }
      return jsonResponse(403, { error: 'evidence_detail_denied' });
    }

    const evidenceId = evidenceIdFromContext(pagesContext);
    if (evidenceId === null) {
      return jsonResponse(400, { error: 'evidence_detail_invalid_id' });
    }

    try {
      return jsonResponse(
        200,
        await detailLoader(context, evidenceId, pagesContext.env, now()),
      );
    } catch (error) {
      if (error instanceof EvidenceReviewWorkspaceError) {
        if (error.code === 'invalid_evidence_id') {
          return jsonResponse(400, { error: 'evidence_detail_invalid_id' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'evidence_detail_not_found' });
        }
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'evidence_detail_denied' });
        }
      }
      return jsonResponse(503, { error: 'evidence_detail_unavailable' });
    }
  };
}

export function createEvidenceDetailPostHandler(
  dependencies: EvidenceDetailHandlerDependencies = {},
) {
  const decisionWriter = dependencies.writeDecision ?? writeDecisionToDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: EvidenceDetailPagesContext): Promise<Response> => {
    let context: EvidenceReviewMutationContext;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      context = authorizeEvidenceReview(
        identity,
        readEvidenceReviewAuthorizationPolicy(pagesContext.env),
        pagesContext.request.headers.get('Idempotency-Key'),
      );
    } catch (error) {
      if (
        error instanceof EvidenceReviewAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'evidence_decision_unavailable' });
      }
      if (
        error instanceof EvidenceReviewAuthorizationError &&
        error.code === 'invalid_request_id'
      ) {
        return jsonResponse(400, { error: 'evidence_decision_invalid_request_id' });
      }
      return jsonResponse(403, { error: 'evidence_decision_denied' });
    }

    const evidenceId = evidenceIdFromContext(pagesContext);
    if (evidenceId === null) {
      return jsonResponse(400, { error: 'evidence_decision_invalid_id' });
    }

    let body: unknown;
    try {
      body = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'evidence_decision_invalid_json' });
    }

    try {
      return jsonResponse(
        200,
        await decisionWriter(context, evidenceId, body, pagesContext.env, now()),
      );
    } catch (error) {
      if (error instanceof EvidenceReviewDecisionError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'evidence_decision_denied' });
        }
        if (error.code === 'invalid_decision') {
          return jsonResponse(400, {
            error: 'evidence_decision_invalid',
            issues: [...error.issues],
          });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'evidence_decision_not_found' });
        }
        if (error.code === 'conflict') {
          return jsonResponse(409, {
            error: 'evidence_decision_conflict',
            issues: [...error.issues],
          });
        }
      }
      return jsonResponse(503, { error: 'evidence_decision_unavailable' });
    }
  };
}

export const onRequestGet = createEvidenceDetailGetHandler();
export const onRequestPost = createEvidenceDetailPostHandler();
