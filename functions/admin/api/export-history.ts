import { withAdminSecurityHeaders } from '../../../src/admin/access/config';
import {
  ExportReleaseAuthorizationError,
  readExportReleaseAuthorizationPolicy,
} from '../../../src/admin/export-release/authorization';
import { createDrizzleExportReleaseHistoryBackend } from '../../../src/admin/export-release/history-backend';
import {
  ExportReleaseHistoryError,
  loadExportReleaseHistory,
  parseExportReleaseHistoryQuery,
  type ExportReleaseHistoryResponse,
} from '../../../src/admin/export-release/history';
import {
  exportReleaseDatabase,
  type ExportReleaseEnvironment,
} from '../../../src/admin/export-release/http-environment';
import { authorizeExportReleaseRead } from '../../../src/admin/export-release/read-authorization';
import type { ExportReleaseReadContext } from '../../../src/admin/export-release/workspace';
import { ExportArtifactSourceError } from '../../../src/admin/export-release/artifact-source';
import { readProtectedAdminIdentity } from '../../../src/admin/dashboard/identity-context';

interface ExportHistoryPagesContext {
  request: Request;
  env: ExportReleaseEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type HistoryLoader = (
  context: ExportReleaseReadContext,
  requestUrl: URL,
  environment: ExportReleaseEnvironment,
  asOf: Date,
) => Promise<ExportReleaseHistoryResponse>;

export interface ExportHistoryHandlerDependencies {
  loadHistory?: HistoryLoader;
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

async function loadHistoryFromEnvironment(
  context: ExportReleaseReadContext,
  requestUrl: URL,
  environment: ExportReleaseEnvironment,
  asOf: Date,
): Promise<ExportReleaseHistoryResponse> {
  return loadExportReleaseHistory(
    context,
    createDrizzleExportReleaseHistoryBackend(exportReleaseDatabase(environment)),
    parseExportReleaseHistoryQuery(requestUrl),
    asOf,
  );
}

export function createExportHistoryHandler(
  dependencies: ExportHistoryHandlerDependencies = {},
) {
  const loader = dependencies.loadHistory ?? loadHistoryFromEnvironment;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: ExportHistoryPagesContext): Promise<Response> => {
    let context: ExportReleaseReadContext;
    try {
      context = authorizeExportReleaseRead(
        readProtectedAdminIdentity(pagesContext.data.adminIdentity),
        readExportReleaseAuthorizationPolicy(pagesContext.env),
      );
    } catch (error) {
      if (
        error instanceof ExportReleaseAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'export_history_unavailable' });
      }
      return jsonResponse(403, { error: 'export_history_denied' });
    }

    try {
      return jsonResponse(
        200,
        await loader(context, new URL(pagesContext.request.url), pagesContext.env, now()),
      );
    } catch (error) {
      if (error instanceof ExportReleaseHistoryError) {
        if (error.code === 'invalid_query') {
          return jsonResponse(400, { error: 'export_history_invalid_query' });
        }
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'export_history_denied' });
        }
      }
      if (error instanceof ExportArtifactSourceError && error.code === 'configuration') {
        return jsonResponse(503, { error: 'export_history_unavailable' });
      }
      return jsonResponse(503, { error: 'export_history_unavailable' });
    }
  };
}

export const onRequestGet = createExportHistoryHandler();
