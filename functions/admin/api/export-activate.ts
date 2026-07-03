import { withAdminSecurityHeaders } from '../../../src/admin/access/config';
import {
  activateExportRelease,
} from '../../../src/admin/export-release/activation-writer';
import type { ExportActivationEnvironment } from '../../../src/admin/export-release/activation-environment';
import {
  authorizeExportPublication,
  ExportPublicationAuthorizationError,
  readExportPublicationAuthorizationPolicy,
} from '../../../src/admin/export-release/publication-authorization';
import {
  ExportPublicationError,
  type ExportPublicationMutationContext,
  type ExportPublicationReceipt,
} from '../../../src/admin/export-release/publication-contract';
import { ExportArtifactSourceError } from '../../../src/admin/export-release/artifact-source';
import { readProtectedAdminIdentity } from '../../../src/admin/dashboard/identity-context';

interface ExportActivationPagesContext {
  request: Request;
  env: ExportActivationEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type ActivationWriter = (
  context: ExportPublicationMutationContext,
  body: unknown,
  environment: ExportActivationEnvironment,
  publishedAt: Date,
) => Promise<ExportPublicationReceipt>;

export interface ExportActivationHandlerDependencies {
  activate?: ActivationWriter;
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

function activationErrorResponse(error: unknown): Response {
  if (error instanceof ExportPublicationError) {
    if (error.code === 'unauthorized') {
      return jsonResponse(403, { error: 'export_activation_denied' });
    }
    if (error.code === 'invalid_publication') {
      return jsonResponse(400, {
        error: 'export_activation_invalid',
        issues: [...error.issues],
      });
    }
    if (error.code === 'approval_not_found') {
      return jsonResponse(404, { error: 'export_activation_approval_not_found' });
    }
    if (
      ['approval_mismatch', 'candidate_mismatch', 'pointer_conflict'].includes(error.code)
    ) {
      return jsonResponse(409, {
        error: 'export_activation_conflict',
        issues: [...error.issues],
      });
    }
  }
  if (error instanceof ExportArtifactSourceError && error.code === 'invalid_bundle') {
    return jsonResponse(409, { error: 'export_activation_candidate_invalid' });
  }
  return jsonResponse(503, { error: 'export_activation_unavailable' });
}

export function createExportActivationPostHandler(
  dependencies: ExportActivationHandlerDependencies = {},
) {
  const writer = dependencies.activate ?? activateExportRelease;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: ExportActivationPagesContext): Promise<Response> => {
    let context: ExportPublicationMutationContext;
    try {
      context = authorizeExportPublication(
        readProtectedAdminIdentity(pagesContext.data.adminIdentity),
        readExportPublicationAuthorizationPolicy(pagesContext.env),
        pagesContext.request.headers.get('Idempotency-Key'),
      );
    } catch (error) {
      if (
        error instanceof ExportPublicationAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'export_activation_unavailable' });
      }
      if (
        error instanceof ExportPublicationAuthorizationError &&
        error.code === 'invalid_request_id'
      ) {
        return jsonResponse(400, { error: 'export_activation_invalid_request_id' });
      }
      return jsonResponse(403, { error: 'export_activation_denied' });
    }

    let body: unknown;
    try {
      body = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'export_activation_invalid_json' });
    }

    try {
      return jsonResponse(200, await writer(context, body, pagesContext.env, now()));
    } catch (error) {
      return activationErrorResponse(error);
    }
  };
}

export const onRequestPost = createExportActivationPostHandler();
