import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import {
  NegativeRecheckApplicationAuthorizationError,
  authorizeNegativeRecheckApplicationRead,
  readNegativeRecheckApplicationAuthorizationPolicy,
  type NegativeRecheckApplicationAuthorizationEnvironment,
} from '../../../../../src/admin/submissions/negative-recheck-application-authorization';
import {
  NegativeRecheckApplicationError,
  readNegativeRecheckApplication,
  type NegativeRecheckApplicationProjection,
  type NegativeRecheckApplicationReadContext,
} from '../../../../../src/admin/submissions/negative-recheck-application';
import { createDrizzleNegativeRecheckApplicationBackend } from '../../../../../src/admin/submissions/drizzle-negative-recheck-application-backend';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';

interface NegativeRecheckApplicationEnvironment
  extends NegativeRecheckApplicationAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface NegativeRecheckApplicationPagesContext {
  request: Request;
  env: NegativeRecheckApplicationEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type NegativeRecheckApplicationReader = (
  context: NegativeRecheckApplicationReadContext,
  applicationId: string,
  environment: NegativeRecheckApplicationEnvironment,
  generatedAt: Date,
) => Promise<NegativeRecheckApplicationProjection>;

export interface NegativeRecheckApplicationHandlerDependencies {
  readApplication?: NegativeRecheckApplicationReader;
  now?: () => Date;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return withAdminSecurityHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    }),
  );
}

async function readApplicationFromDatabase(
  context: NegativeRecheckApplicationReadContext,
  applicationId: string,
  environment: NegativeRecheckApplicationEnvironment,
  generatedAt: Date,
): Promise<NegativeRecheckApplicationProjection> {
  const parsed = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!parsed.success) {
    throw new NegativeRecheckApplicationError(
      'backend_failure',
      'The negative recheck application database is unavailable.',
    );
  }
  const database = createDatabase(parsed.data.DATABASE_URL);
  return readNegativeRecheckApplication(
    context,
    createDrizzleNegativeRecheckApplicationBackend(database),
    applicationId,
    generatedAt,
  );
}

export function createNegativeRecheckApplicationGetHandler(
  dependencies: NegativeRecheckApplicationHandlerDependencies = {},
) {
  const reader = dependencies.readApplication ?? readApplicationFromDatabase;
  const now = dependencies.now ?? (() => new Date());
  return async (pagesContext: NegativeRecheckApplicationPagesContext): Promise<Response> => {
    let context: NegativeRecheckApplicationReadContext;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readNegativeRecheckApplicationAuthorizationPolicy(pagesContext.env);
      context = authorizeNegativeRecheckApplicationRead(identity, policy);
    } catch (error) {
      if (
        error instanceof NegativeRecheckApplicationAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'negative_recheck_application_unavailable' });
      }
      return jsonResponse(403, { error: 'negative_recheck_application_denied' });
    }

    const applicationId = pagesContext.params.applicationId;
    if (typeof applicationId !== 'string') {
      return jsonResponse(400, { error: 'negative_recheck_application_invalid_request' });
    }
    try {
      return jsonResponse(
        200,
        await reader(context, applicationId, pagesContext.env, now()),
      );
    } catch (error) {
      if (error instanceof NegativeRecheckApplicationError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'negative_recheck_application_denied' });
        }
        if (error.code === 'invalid_request') {
          return jsonResponse(400, { error: 'negative_recheck_application_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'negative_recheck_application_not_found' });
        }
        if (error.code === 'ineligible') {
          return jsonResponse(422, { error: 'negative_recheck_application_ineligible' });
        }
      }
      return jsonResponse(503, { error: 'negative_recheck_application_unavailable' });
    }
  };
}

export const onRequestGet = createNegativeRecheckApplicationGetHandler();
