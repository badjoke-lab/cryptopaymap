import { withAdminSecurityHeaders } from '../../../src/admin/access/config';
import {
  AuditHistoryAuthorizationError,
  authorizeAuditHistoryRead,
  readAuditHistoryAuthorizationPolicy,
} from '../../../src/admin/audit-history/authorization';
import { createAggregatedAuditHistoryBackend } from '../../../src/admin/audit-history/aggregation';
import type { AuditHistoryReadContext, AuditHistoryResponse } from '../../../src/admin/audit-history/contract';
import { createDrizzleAuditHistorySources } from '../../../src/admin/audit-history/drizzle-sources';
import {
  AuditHistoryError,
  loadAuditHistory,
  parseAuditHistoryQuery,
} from '../../../src/admin/audit-history/history';
import {
  AuditHistoryEnvironmentError,
  auditHistoryDatabase,
  type AuditHistoryEnvironment,
} from '../../../src/admin/audit-history/http-environment';
import { readProtectedAdminIdentity } from '../../../src/admin/dashboard/identity-context';

interface AuditHistoryPagesContext {
  request: Request;
  env: AuditHistoryEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type AuditHistoryLoader = (
  context: AuditHistoryReadContext,
  requestUrl: URL,
  environment: AuditHistoryEnvironment,
  asOf: Date,
) => Promise<AuditHistoryResponse>;

export interface AuditHistoryHandlerDependencies {
  loadHistory?: AuditHistoryLoader;
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
  context: AuditHistoryReadContext,
  requestUrl: URL,
  environment: AuditHistoryEnvironment,
  asOf: Date,
): Promise<AuditHistoryResponse> {
  const database = auditHistoryDatabase(environment);
  return loadAuditHistory(
    context,
    createAggregatedAuditHistoryBackend(createDrizzleAuditHistorySources(database)),
    parseAuditHistoryQuery(requestUrl),
    asOf,
  );
}

export function createAuditHistoryHandler(
  dependencies: AuditHistoryHandlerDependencies = {},
) {
  const loader = dependencies.loadHistory ?? loadHistoryFromEnvironment;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: AuditHistoryPagesContext): Promise<Response> => {
    let context: AuditHistoryReadContext;
    try {
      context = authorizeAuditHistoryRead(
        readProtectedAdminIdentity(pagesContext.data.adminIdentity),
        readAuditHistoryAuthorizationPolicy(pagesContext.env),
      );
    } catch (error) {
      if (
        error instanceof AuditHistoryAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'audit_history_unavailable' });
      }
      return jsonResponse(403, { error: 'audit_history_denied' });
    }

    try {
      return jsonResponse(
        200,
        await loader(context, new URL(pagesContext.request.url), pagesContext.env, now()),
      );
    } catch (error) {
      if (error instanceof AuditHistoryError) {
        if (error.code === 'invalid_query') {
          return jsonResponse(400, { error: 'audit_history_invalid_query' });
        }
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'audit_history_denied' });
        }
      }
      if (
        error instanceof AuditHistoryEnvironmentError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'audit_history_unavailable' });
      }
      return jsonResponse(503, { error: 'audit_history_unavailable' });
    }
  };
}

export const onRequestGet = createAuditHistoryHandler();
