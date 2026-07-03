import { withAdminSecurityHeaders } from '../access/config';
import type { ReconfirmationAuthorizationEnvironment } from './authorization';
import { ReconfirmationWorkspaceError } from './protected-workspace';
import { requiredDatabaseEnvironmentSchema } from '../../schemas/environment';

export interface ReconfirmationHttpEnvironment extends ReconfirmationAuthorizationEnvironment {
  DATABASE_URL?: string;
}

export interface ReconfirmationPagesContext {
  request: Request;
  env: ReconfirmationHttpEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

export function jsonResponse(status: number, body: unknown): Response {
  return withAdminSecurityHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }),
  );
}

export function databaseUrl(environment: ReconfirmationHttpEnvironment): string {
  const result = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!result.success) {
    throw new ReconfirmationWorkspaceError(
      'backend_failure',
      'The reconfirmation database is unavailable.',
    );
  }
  return result.data.DATABASE_URL;
}

export function claimIdFromContext(context: ReconfirmationPagesContext): string | null {
  const value = context.params.claimId;
  return typeof value === 'string' ? value : null;
}
