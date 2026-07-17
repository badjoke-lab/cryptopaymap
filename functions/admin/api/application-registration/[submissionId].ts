import { withAdminSecurityHeaders } from '../../../../src/admin/access/config';
import {
  SubmissionApplicationRegistrationAuthorizationError,
  authorizeSubmissionApplicationRegistration,
  readSubmissionApplicationRegistrationAuthorizationPolicy,
  type SubmissionApplicationRegistrationAuthorizationEnvironment,
} from '../../../../src/admin/submissions/application-registration-authorization';
import {
  SubmissionApplicationRegistrationError,
  registerSubmissionApplication,
  type SubmissionApplicationRegistrationReceipt,
} from '../../../../src/admin/submissions/application-registration';
import { createDrizzleSubmissionApplicationRegistrationBackend } from '../../../../src/admin/submissions/drizzle-application-registration-backend';
import { readProtectedAdminIdentity } from '../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../src/schemas/environment';

interface ApplicationRegistrationEnvironment
  extends SubmissionApplicationRegistrationAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface ApplicationRegistrationPagesContext {
  request: Request;
  env: ApplicationRegistrationEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type ApplicationRegistrationRunner = (
  context: ReturnType<typeof authorizeSubmissionApplicationRegistration>,
  submissionId: string,
  rawRequest: unknown,
  environment: ApplicationRegistrationEnvironment,
  registeredAt: Date,
) => Promise<SubmissionApplicationRegistrationReceipt>;

export interface ApplicationRegistrationHandlerDependencies {
  runRegistration?: ApplicationRegistrationRunner;
  now?: () => Date;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return withAdminSecurityHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    }),
  );
}

async function runRegistrationFromDatabase(
  context: ReturnType<typeof authorizeSubmissionApplicationRegistration>,
  submissionId: string,
  rawRequest: unknown,
  environment: ApplicationRegistrationEnvironment,
  registeredAt: Date,
): Promise<SubmissionApplicationRegistrationReceipt> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new SubmissionApplicationRegistrationError(
      'backend_failure',
      'The application-registration database is unavailable.',
    );
  }
  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return registerSubmissionApplication(
    context,
    createDrizzleSubmissionApplicationRegistrationBackend(database),
    submissionId,
    rawRequest,
    registeredAt,
  );
}

export function createApplicationRegistrationHandler(
  dependencies: ApplicationRegistrationHandlerDependencies = {},
) {
  const runner = dependencies.runRegistration ?? runRegistrationFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: ApplicationRegistrationPagesContext): Promise<Response> => {
    let context: ReturnType<typeof authorizeSubmissionApplicationRegistration>;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readSubmissionApplicationRegistrationAuthorizationPolicy(pagesContext.env);
      context = authorizeSubmissionApplicationRegistration(identity, policy);
    } catch (error) {
      if (
        error instanceof SubmissionApplicationRegistrationAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'application_registration_unavailable' });
      }
      return jsonResponse(403, { error: 'application_registration_denied' });
    }

    const submissionId = pagesContext.params.submissionId;
    if (typeof submissionId !== 'string') {
      return jsonResponse(400, { error: 'application_registration_invalid_request' });
    }
    const contentType = pagesContext.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return jsonResponse(415, { error: 'application_registration_json_required' });
    }

    let rawRequest: unknown;
    try {
      rawRequest = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'application_registration_invalid_request' });
    }

    try {
      return jsonResponse(
        200,
        await runner(context, submissionId, rawRequest, pagesContext.env, now()),
      );
    } catch (error) {
      if (error instanceof SubmissionApplicationRegistrationError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'application_registration_denied' });
        }
        if (error.code === 'invalid_request') {
          return jsonResponse(400, { error: 'application_registration_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'application_registration_not_found' });
        }
        if (error.code === 'ineligible') {
          return jsonResponse(422, { error: 'application_registration_ineligible' });
        }
        if (error.code === 'conflict' || error.code === 'idempotency_conflict') {
          return jsonResponse(409, { error: 'application_registration_conflict' });
        }
      }
      return jsonResponse(503, { error: 'application_registration_unavailable' });
    }
  };
}

export const onRequestPost = createApplicationRegistrationHandler();
