import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import {
  SuggestApplicationBindingAuthorizationError,
  authorizeSuggestApplicationBinding,
  readSuggestApplicationBindingAuthorizationPolicy,
  type SuggestApplicationBindingAuthorizationEnvironment,
} from '../../../../../src/admin/submissions/suggest-application-binding-authorization';
import {
  SuggestApplicationBindingError,
  bindSuggestApplicationReceipt,
  type SuggestApplicationBindingContext,
  type SuggestApplicationBindingReceipt,
} from '../../../../../src/admin/submissions/suggest-application-binding';
import { createDrizzleSuggestApplicationBindingBackend } from '../../../../../src/admin/submissions/drizzle-suggest-application-binding-backend';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';

interface SuggestApplicationBindingEnvironment
  extends SuggestApplicationBindingAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface SuggestApplicationBindingPagesContext {
  request: Request;
  env: SuggestApplicationBindingEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type SuggestApplicationBindingRunner = (
  context: SuggestApplicationBindingContext,
  applicationId: string,
  rawRequest: unknown,
  environment: SuggestApplicationBindingEnvironment,
  boundAt: Date,
) => Promise<SuggestApplicationBindingReceipt>;

export interface SuggestApplicationBindingHandlerDependencies {
  runBinding?: SuggestApplicationBindingRunner;
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

async function runBindingFromDatabase(
  context: SuggestApplicationBindingContext,
  applicationId: string,
  rawRequest: unknown,
  environment: SuggestApplicationBindingEnvironment,
  boundAt: Date,
): Promise<SuggestApplicationBindingReceipt> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new SuggestApplicationBindingError(
      'backend_failure',
      'The Suggest application-binding database is unavailable.',
    );
  }
  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return bindSuggestApplicationReceipt(
    context,
    createDrizzleSuggestApplicationBindingBackend(database),
    applicationId,
    rawRequest,
    boundAt,
  );
}

export function createSuggestApplicationBindingHandler(
  dependencies: SuggestApplicationBindingHandlerDependencies = {},
) {
  const runner = dependencies.runBinding ?? runBindingFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: SuggestApplicationBindingPagesContext): Promise<Response> => {
    let context: SuggestApplicationBindingContext;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readSuggestApplicationBindingAuthorizationPolicy(pagesContext.env);
      context = authorizeSuggestApplicationBinding(identity, policy);
    } catch (error) {
      if (
        error instanceof SuggestApplicationBindingAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'suggest_application_binding_unavailable' });
      }
      return jsonResponse(403, { error: 'suggest_application_binding_denied' });
    }

    const applicationId = pagesContext.params.applicationId;
    if (typeof applicationId !== 'string') {
      return jsonResponse(400, { error: 'suggest_application_binding_invalid_request' });
    }
    const contentType = pagesContext.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return jsonResponse(415, { error: 'suggest_application_binding_json_required' });
    }

    let rawRequest: unknown;
    try {
      rawRequest = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'suggest_application_binding_invalid_request' });
    }

    try {
      return jsonResponse(
        200,
        await runner(context, applicationId, rawRequest, pagesContext.env, now()),
      );
    } catch (error) {
      if (error instanceof SuggestApplicationBindingError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'suggest_application_binding_denied' });
        }
        if (error.code === 'invalid_request') {
          return jsonResponse(400, { error: 'suggest_application_binding_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'suggest_application_binding_not_found' });
        }
        if (error.code === 'ineligible') {
          return jsonResponse(422, { error: 'suggest_application_binding_ineligible' });
        }
        if (error.code === 'conflict' || error.code === 'idempotency_conflict') {
          return jsonResponse(409, { error: 'suggest_application_binding_conflict' });
        }
      }
      return jsonResponse(503, { error: 'suggest_application_binding_unavailable' });
    }
  };
}

export const onRequestPost = createSuggestApplicationBindingHandler();
