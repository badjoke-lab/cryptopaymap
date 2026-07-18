import { withAdminSecurityHeaders } from '../../../../src/admin/access/config';
import {
  SubmissionApplicationLifecycleAuthorizationError,
  authorizeSubmissionApplicationLifecycleRead,
  authorizeSubmissionApplicationLifecycleTransition,
  readSubmissionApplicationLifecycleAuthorizationPolicy,
  type SubmissionApplicationLifecycleAuthorizationEnvironment,
} from '../../../../src/admin/submissions/application-lifecycle-authorization';
import {
  SubmissionApplicationLifecycleError,
  readSubmissionApplicationLifecycle,
  transitionSubmissionApplicationLifecycle,
  type SubmissionApplicationLifecycleProjection,
  type SubmissionApplicationLifecycleReadContext,
  type SubmissionApplicationLifecycleTransitionContext,
  type SubmissionApplicationTransitionReceipt,
} from '../../../../src/admin/submissions/application-lifecycle';
import { createDrizzleSubmissionApplicationLifecycleBackend } from '../../../../src/admin/submissions/drizzle-application-lifecycle-backend';
import { readProtectedAdminIdentity } from '../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../src/schemas/environment';

interface ApplicationLifecycleEnvironment
  extends SubmissionApplicationLifecycleAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface ApplicationLifecyclePagesContext {
  request: Request;
  env: ApplicationLifecycleEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type ApplicationLifecycleReader = (
  context: SubmissionApplicationLifecycleReadContext,
  applicationId: string,
  environment: ApplicationLifecycleEnvironment,
) => Promise<SubmissionApplicationLifecycleProjection>;

type ApplicationLifecycleTransitionRunner = (
  context: SubmissionApplicationLifecycleTransitionContext,
  applicationId: string,
  rawRequest: unknown,
  environment: ApplicationLifecycleEnvironment,
  changedAt: Date,
) => Promise<SubmissionApplicationTransitionReceipt>;

export interface ApplicationLifecycleHandlerDependencies {
  readLifecycle?: ApplicationLifecycleReader;
  runTransition?: ApplicationLifecycleTransitionRunner;
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

function databaseFromEnvironment(environment: ApplicationLifecycleEnvironment) {
  const parsed = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!parsed.success) {
    throw new SubmissionApplicationLifecycleError(
      'backend_failure',
      'The application lifecycle database is unavailable.',
    );
  }
  return createDatabase(parsed.data.DATABASE_URL);
}

async function readLifecycleFromDatabase(
  context: SubmissionApplicationLifecycleReadContext,
  applicationId: string,
  environment: ApplicationLifecycleEnvironment,
): Promise<SubmissionApplicationLifecycleProjection> {
  return readSubmissionApplicationLifecycle(
    context,
    createDrizzleSubmissionApplicationLifecycleBackend(databaseFromEnvironment(environment)),
    applicationId,
  );
}

async function transitionFromDatabase(
  context: SubmissionApplicationLifecycleTransitionContext,
  applicationId: string,
  rawRequest: unknown,
  environment: ApplicationLifecycleEnvironment,
  changedAt: Date,
): Promise<SubmissionApplicationTransitionReceipt> {
  return transitionSubmissionApplicationLifecycle(
    context,
    createDrizzleSubmissionApplicationLifecycleBackend(databaseFromEnvironment(environment)),
    applicationId,
    rawRequest,
    changedAt,
  );
}

function mapLifecycleError(error: unknown): Response {
  if (error instanceof SubmissionApplicationLifecycleError) {
    if (error.code === 'unauthorized') {
      return jsonResponse(403, { error: 'application_lifecycle_denied' });
    }
    if (error.code === 'invalid_request') {
      return jsonResponse(400, { error: 'application_lifecycle_invalid_request' });
    }
    if (error.code === 'not_found') {
      return jsonResponse(404, { error: 'application_lifecycle_not_found' });
    }
    if (error.code === 'conflict' || error.code === 'idempotency_conflict') {
      return jsonResponse(409, { error: 'application_lifecycle_conflict' });
    }
  }
  return jsonResponse(503, { error: 'application_lifecycle_unavailable' });
}

function authorize(
  pagesContext: ApplicationLifecyclePagesContext,
  mode: 'read' | 'transition',
): SubmissionApplicationLifecycleReadContext | SubmissionApplicationLifecycleTransitionContext | Response {
  try {
    const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
    const policy = readSubmissionApplicationLifecycleAuthorizationPolicy(pagesContext.env);
    return mode === 'read'
      ? authorizeSubmissionApplicationLifecycleRead(identity, policy)
      : authorizeSubmissionApplicationLifecycleTransition(identity, policy);
  } catch (error) {
    if (
      error instanceof SubmissionApplicationLifecycleAuthorizationError &&
      error.code === 'configuration'
    ) {
      return jsonResponse(503, { error: 'application_lifecycle_unavailable' });
    }
    return jsonResponse(403, { error: 'application_lifecycle_denied' });
  }
}

export function createApplicationLifecycleGetHandler(
  dependencies: ApplicationLifecycleHandlerDependencies = {},
) {
  const reader = dependencies.readLifecycle ?? readLifecycleFromDatabase;
  return async (pagesContext: ApplicationLifecyclePagesContext): Promise<Response> => {
    const authorization = authorize(pagesContext, 'read');
    if (authorization instanceof Response) return authorization;
    const applicationId = pagesContext.params.applicationId;
    if (typeof applicationId !== 'string') {
      return jsonResponse(400, { error: 'application_lifecycle_invalid_request' });
    }
    try {
      return jsonResponse(
        200,
        await reader(
          authorization as SubmissionApplicationLifecycleReadContext,
          applicationId,
          pagesContext.env,
        ),
      );
    } catch (error) {
      return mapLifecycleError(error);
    }
  };
}

export function createApplicationLifecyclePostHandler(
  dependencies: ApplicationLifecycleHandlerDependencies = {},
) {
  const runner = dependencies.runTransition ?? transitionFromDatabase;
  const now = dependencies.now ?? (() => new Date());
  return async (pagesContext: ApplicationLifecyclePagesContext): Promise<Response> => {
    const authorization = authorize(pagesContext, 'transition');
    if (authorization instanceof Response) return authorization;
    const applicationId = pagesContext.params.applicationId;
    if (typeof applicationId !== 'string') {
      return jsonResponse(400, { error: 'application_lifecycle_invalid_request' });
    }
    const contentType = pagesContext.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return jsonResponse(415, { error: 'application_lifecycle_json_required' });
    }
    let rawRequest: unknown;
    try {
      rawRequest = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'application_lifecycle_invalid_request' });
    }
    try {
      return jsonResponse(
        200,
        await runner(
          authorization as SubmissionApplicationLifecycleTransitionContext,
          applicationId,
          rawRequest,
          pagesContext.env,
          now(),
        ),
      );
    } catch (error) {
      return mapLifecycleError(error);
    }
  };
}

export const onRequestGet = createApplicationLifecycleGetHandler();
export const onRequestPost = createApplicationLifecyclePostHandler();
