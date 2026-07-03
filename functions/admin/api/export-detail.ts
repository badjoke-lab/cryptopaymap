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
  loadExportReleaseDetail,
  type ExportReleaseDetailResponse,
  type ExportReleaseReadContext,
} from '../../../src/admin/export-release/workspace';
import { readProtectedAdminIdentity } from '../../../src/admin/dashboard/identity-context';

interface ExportDetailPagesContext {
  request: Request;
  env: ExportReleaseEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type DetailLoader = (
  context: ExportReleaseReadContext,
  snapshotDigest: string,
  environment: ExportReleaseEnvironment,
  asOf: Date,
) => Promise<ExportReleaseDetailResponse>;

export interface ExportDetailHandlerDependencies {
  loadDetail?: DetailLoader;
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

async function loadDetailFromEnvironment(
  context: ExportReleaseReadContext,
  snapshotDigest: string,
  environment: ExportReleaseEnvironment,
  asOf: Date,
) {
  return loadExportReleaseDetail(
    context,
    exportArtifactSourceFromEnvironment(environment),
    createDrizzleExportReleaseWorkspaceBackend(exportReleaseDatabase(environment)),
    snapshotDigest,
    asOf,
  );
}

export function createExportDetailGetHandler(
  dependencies: ExportDetailHandlerDependencies = {},
) {
  const loader = dependencies.loadDetail ?? loadDetailFromEnvironment;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: ExportDetailPagesContext): Promise<Response> => {
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
        return jsonResponse(503, { error: 'export_detail_unavailable' });
      }
      return jsonResponse(403, { error: 'export_detail_denied' });
    }

    const snapshotDigest = new URL(pagesContext.request.url).searchParams.get('snapshotDigest');
    if (snapshotDigest === null) {
      return jsonResponse(400, { error: 'export_detail_invalid_digest' });
    }

    try {
      return jsonResponse(
        200,
        await loader(context, snapshotDigest, pagesContext.env, now()),
      );
    } catch (error) {
      if (error instanceof ExportReleaseWorkspaceError) {
        if (error.code === 'invalid_digest') {
          return jsonResponse(400, { error: 'export_detail_invalid_digest' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'export_detail_not_found' });
        }
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'export_detail_denied' });
        }
      }
      if (error instanceof ExportArtifactSourceError && error.code === 'configuration') {
        return jsonResponse(503, { error: 'export_detail_unavailable' });
      }
      return jsonResponse(503, { error: 'export_detail_unavailable' });
    }
  };
}

export const onRequestGet = createExportDetailGetHandler();
