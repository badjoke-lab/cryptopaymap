import { withAdminSecurityHeaders } from '../../../src/admin/access/config';
import {
  authorizeExportRelease,
  ExportReleaseAuthorizationError,
  readExportReleaseAuthorizationPolicy,
} from '../../../src/admin/export-release/authorization';
import { ExportArtifactSourceError } from '../../../src/admin/export-release/artifact-source';
import {
  ExportReleaseDecisionError,
  type ExportReleaseDecisionReceipt,
  type ExportReleaseMutationContext,
} from '../../../src/admin/export-release/decision';
import {
  type ExportReleaseEnvironment,
} from '../../../src/admin/export-release/http-environment';
import { writeExportReleaseDecision } from '../../../src/admin/export-release/http-decision-writer';
import { readProtectedAdminIdentity } from '../../../src/admin/dashboard/identity-context';

interface ExportDecisionPagesContext {
  request: Request;
  env: ExportReleaseEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type DecisionWriter = (
  context: ExportReleaseMutationContext,
  body: unknown,
  environment: ExportReleaseEnvironment,
  decidedAt: Date,
) => Promise<ExportReleaseDecisionReceipt>;

export interface ExportDecisionHandlerDependencies {
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

function decisionErrorResponse(error: unknown): Response {
  if (error instanceof ExportReleaseDecisionError) {
    if (error.code === 'unauthorized') {
      return jsonResponse(403, { error: 'export_decision_denied' });
    }
    if (error.code === 'invalid_decision') {
      return jsonResponse(400, {
        error: 'export_decision_invalid',
        issues: [...error.issues],
      });
    }
    if (error.code === 'validation_failed') {
      return jsonResponse(409, {
        error: 'export_candidate_blocked',
        issues: [...error.issues],
      });
    }
    if (error.code === 'conflict') {
      return jsonResponse(409, {
        error: 'export_decision_conflict',
        issues: [...error.issues],
      });
    }
  }
  if (error instanceof ExportArtifactSourceError) {
    if (error.code === 'invalid_bundle') {
      return jsonResponse(409, { error: 'export_candidate_invalid' });
    }
    return jsonResponse(503, { error: 'export_decision_unavailable' });
  }
  return jsonResponse(503, { error: 'export_decision_unavailable' });
}

export function createExportDecisionPostHandler(
  dependencies: ExportDecisionHandlerDependencies = {},
) {
  const writer = dependencies.writeDecision ?? writeExportReleaseDecision;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: ExportDecisionPagesContext): Promise<Response> => {
    let context: ExportReleaseMutationContext;
    try {
      context = authorizeExportRelease(
        readProtectedAdminIdentity(pagesContext.data.adminIdentity),
        readExportReleaseAuthorizationPolicy(pagesContext.env),
        pagesContext.request.headers.get('Idempotency-Key'),
      );
    } catch (error) {
      if (
        error instanceof ExportReleaseAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'export_decision_unavailable' });
      }
      if (
        error instanceof ExportReleaseAuthorizationError &&
        error.code === 'invalid_request_id'
      ) {
        return jsonResponse(400, { error: 'export_decision_invalid_request_id' });
      }
      return jsonResponse(403, { error: 'export_decision_denied' });
    }

    let body: unknown;
    try {
      body = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'export_decision_invalid_json' });
    }

    try {
      return jsonResponse(200, await writer(context, body, pagesContext.env, now()));
    } catch (error) {
      return decisionErrorResponse(error);
    }
  };
}

export const onRequestPost = createExportDecisionPostHandler();
