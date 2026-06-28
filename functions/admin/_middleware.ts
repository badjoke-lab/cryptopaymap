import cloudflareAccessPlugin from '@cloudflare/pages-plugin-cloudflare-access';
import {
  adminAccessUnavailableResponse,
  readAdminAccessConfiguration,
  type AdminAccessEnvironment,
} from '../../src/admin/access/config';

interface AdminPagesContext {
  request: Request;
  env: AdminAccessEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  next(input?: Request | string): Promise<Response>;
  waitUntil(promise: Promise<unknown>): void;
}

type AdminPagesMiddleware = (context: AdminPagesContext) => Response | Promise<Response>;
type AccessPluginFactory = (configuration: {
  domain: string;
  aud: string;
}) => AdminPagesMiddleware;

export function createAdminAccessMiddleware(
  pluginFactory: AccessPluginFactory = cloudflareAccessPlugin as AccessPluginFactory,
): AdminPagesMiddleware {
  return async (context) => {
    let configuration;
    try {
      configuration = readAdminAccessConfiguration(context.env);
    } catch {
      return adminAccessUnavailableResponse();
    }

    return pluginFactory(configuration)(context);
  };
}

export const onRequest = createAdminAccessMiddleware();
