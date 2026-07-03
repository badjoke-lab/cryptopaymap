import { withAdminSecurityHeaders } from '../../../src/admin/access/config';
import {
  ExportReleaseAuthorizationError,
  readExportReleaseAuthorizationPolicy,
} from '../../../src/admin/export-release/authorization';
import { ExportArtifactSourceError } from '../../../src/admin/export-release/artifact-source';
import { createDrizzleExportReleaseWorkspaceBackend } from '../../../src/admin/export-release/drizzle-workspace-backend';
import {
  exportArtifactSourceFromEnvironment,
  exportReleaseDatabase,
  type ExportReleaseEnvironment,
} from '../../../src/admin/export-release/http-environment';
import { authorizeExportReleaseRead } from '../../../src/admin/export-release/read-authorization';
import {
  ExportReleaseWorkspaceError,
  loadExportReleaseQueue,
  parseExportReleaseQueueQuery,
  type ExportReleaseQueueResponse,
  type ExportReleaseReadContext,
} from '../../../src/admin/export-release/workspace';
import { readProtectedAdminIdentity } from '../../../src/admin/dashboard/identity-context';

interface ExportQueuePagesContext {
  request: Request;
  env: ExportReleaseEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type QueueLoader = (
  context: ExportReleaseReadContext,
  requestUrl: URL,
  environment: ExportReleaseEnvironment,
  asOf: Date,
) => Promise<ExportReleaseQueueResponse>;

export interface ExportQueueHandlerDependencies {
  loadQueue?: QueueLoader;
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

async function loadQueueFromEnvironment(
  context: ExportReleaseReadContext,
  requestUrl: URL,
  environment: ExportReleaseEnvironment,
  asOf: Date,
) {
  return loadExportReleaseQueue(
    context,
    exportArtifactSourceFromEnvironment(environment),
    createDrizzleExportReleaseWorkspaceBackend(exportReleaseDatabase(environment)),
    parseExportReleaseQueueQuery(requestUrl),
    asOf,
  );
}

export function createExportQueueHandler(
  dependencies: ExportQueueHandlerDependencies = {},
) {
  const loader = dependencies.loadQueue ?? loadQueueFromEnvironment;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: ExportQueuePagesContext): Promise<Response> => {
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
        return jsonResponse(503, { error: 'export_queue_unavailable' });
      }
      return jsonResponse(403, { error: 'export_queue_denied' });
    }

    try {
      return jsonResponse(
        200,
        await loader(context, new URL(pagesContext.request.url), pagesContext.env, now()),
      );
    } catch (error) {
      if (error instanceof ExportReleaseWorkspaceError) {
        if (error.code === 'invalid_query') {
          return jsonResponse(400, { error: 'export_queue_invalid_query' });
        }
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'export_queue_denied' });
        }
      }
      if (error instanceof ExportArtifactSourceError && error.code === 'configuration') {
        return jsonResponse(503, { error: 'export_queue_unavailable' });
      }
      return jsonResponse(503, { error: 'export_queue_unavailable' });
    }
  };
}

export const onRequestGet = createExportQueueHandler();
