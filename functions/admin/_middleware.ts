import {
  adminAccessDeniedResponse,
  adminAccessUnavailableResponse,
  readAdminAccessConfiguration,
  type AdminAccessConfiguration,
  type AdminAccessEnvironment,
  type RuntimeAdminAccessConfiguration,
  withAdminSecurityHeaders,
} from '../../src/admin/access/config';
import {
  type AdminAccessIdentity,
  createOwnerSessionIdentity,
} from '../../src/admin/access/identity';
import {
  isSameOriginAdminMutation,
  readOwnerSessionCookie,
  verifyOwnerSession,
} from '../../src/admin/access/owner-session';
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

async function verifyOwnerRequest(
  request: Request,
  configuration: Extract<RuntimeAdminAccessConfiguration, { mode: 'owner_session' }>,
): Promise<AdminAccessIdentity> {
  if (!isSameOriginAdminMutation(request)) {
    throw new Error('Cross-origin administration mutation denied.');
  }
  const token = readOwnerSessionCookie(request);
  if (!token) throw new Error('Owner session is missing.');
  await verifyOwnerSession(token, configuration.ownerSecretBase64Url, configuration.ownerSubject);
  return createOwnerSessionIdentity(configuration.ownerSubject);
}

export function createAdminAccessMiddleware(
  verifier: AdminAccessRequestVerifier = verifyAdminAccessRequest,
): AdminPagesMiddleware {
  return async (context) => {
    let configuration: RuntimeAdminAccessConfiguration;
    try {
      configuration = readAdminAccessConfiguration(context.env);
    } catch {
      return adminAccessUnavailableResponse();
    }

    const pathname = new URL(context.request.url).pathname;
    if (configuration.mode === 'owner_session' && pathname === '/admin/login') {
      return withAdminSecurityHeaders(await context.next());
    }

    try {
      const identity =
        configuration.mode === 'owner_session'
          ? await verifyOwnerRequest(context.request, configuration)
          : await verifier(context.request, configuration);
      context.data.adminIdentity = identity;
      return withAdminSecurityHeaders(await context.next());
    } catch {
      return adminAccessDeniedResponse();
    }
  };
}

export const onRequest = createAdminAccessMiddleware();
