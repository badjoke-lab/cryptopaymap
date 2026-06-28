import {
  adminAccessDeniedResponse,
  adminAccessUnavailableResponse,
  readAdminAccessConfiguration,
  type AdminAccessConfiguration,
  type AdminAccessEnvironment,
  withAdminSecurityHeaders,
} from '../../src/admin/access/config';
import type { AdminAccessIdentity } from '../../src/admin/access/identity';
import { verifyAdminAccessRequest } from '../../src/admin/access/verification';

interface AdminPagesContext {
  request: Request;
  env: AdminAccessEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  next(input?: Request | string): Promise<Response>;
  waitUntil(promise: Promise<unknown>): void;
}

type AdminPagesMiddleware = (context: AdminPagesContext) => Response | Promise<Response>;

type AdminAccessRequestVerifier = (
  request: Request,
  configuration: AdminAccessConfiguration,
) => Promise<AdminAccessIdentity>;

export function createAdminAccessMiddleware(
  verifier: AdminAccessRequestVerifier = verifyAdminAccessRequest,
): AdminPagesMiddleware {
  return async (context) => {
    let configuration: AdminAccessConfiguration;
    try {
      configuration = readAdminAccessConfiguration(context.env);
    } catch {
      return adminAccessUnavailableResponse();
    }

    try {
      const identity = await verifier(context.request, configuration);
      context.data.adminIdentity = identity;
      return withAdminSecurityHeaders(await context.next());
    } catch {
      return adminAccessDeniedResponse();
    }
  };
}

export const onRequest = createAdminAccessMiddleware();
