import { withAdminSecurityHeaders } from '../../../src/admin/access/config';
import {
  AdminDashboardAuthorizationError,
  authorizeAdminDashboardRead,
  readAdminDashboardAuthorizationPolicy,
  type AdminDashboardAuthorizationEnvironment,
} from '../../../src/admin/dashboard/authorization';
import { createDrizzleAdminDashboardBackend } from '../../../src/admin/dashboard/drizzle-dashboard-backend';
import { readProtectedAdminIdentity } from '../../../src/admin/dashboard/identity-context';
import {
  AdminDashboardSummaryError,
  loadAdminDashboardSummary,
  type AdminDashboardContext,
  type AdminDashboardSummary,
} from '../../../src/admin/dashboard/summary';
import { createDatabase } from '../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../src/schemas/environment';

interface AdminDashboardEnvironment extends AdminDashboardAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface AdminDashboardPagesContext {
  request: Request;
  env: AdminDashboardEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type DashboardSummaryLoader = (
  context: AdminDashboardContext,
  environment: AdminDashboardEnvironment,
  asOf: Date,
) => Promise<AdminDashboardSummary>;

export interface AdminDashboardHandlerDependencies {
  loadSummary?: DashboardSummaryLoader;
  now?: () => Date;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return withAdminSecurityHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    }),
  );
}

async function loadDashboardSummaryFromDatabase(
  context: AdminDashboardContext,
  environment: AdminDashboardEnvironment,
  asOf: Date,
): Promise<AdminDashboardSummary> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new AdminDashboardSummaryError(
      'backend_failure',
      'The administration dashboard database is unavailable.',
    );
  }

  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return loadAdminDashboardSummary(
    context,
    createDrizzleAdminDashboardBackend(database),
    asOf,
  );
}

export function createAdminDashboardHandler(
  dependencies: AdminDashboardHandlerDependencies = {},
) {
  const summaryLoader = dependencies.loadSummary ?? loadDashboardSummaryFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: AdminDashboardPagesContext): Promise<Response> => {
    let dashboardContext: AdminDashboardContext;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readAdminDashboardAuthorizationPolicy(pagesContext.env);
      dashboardContext = authorizeAdminDashboardRead(identity, policy);
    } catch (error) {
      if (
        error instanceof AdminDashboardAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'dashboard_unavailable' });
      }
      return jsonResponse(403, { error: 'dashboard_denied' });
    }

    try {
      const summary = await summaryLoader(dashboardContext, pagesContext.env, now());
      return jsonResponse(200, summary);
    } catch (error) {
      if (error instanceof AdminDashboardSummaryError && error.code === 'unauthorized') {
        return jsonResponse(403, { error: 'dashboard_denied' });
      }
      return jsonResponse(503, { error: 'dashboard_unavailable' });
    }
  };
}

export const onRequestGet = createAdminDashboardHandler();
