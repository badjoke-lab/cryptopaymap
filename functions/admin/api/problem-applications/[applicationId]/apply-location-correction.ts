import { z } from 'zod';
import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import {
  ProblemLocationCorrectionApplicationAuthorizationError,
  authorizeProblemLocationCorrectionApplication,
  readProblemLocationCorrectionApplicationAuthorizationPolicy,
  type ProblemLocationCorrectionApplicationAuthorizationEnvironment,
} from '../../../../../src/admin/submissions/problem-location-correction-application-authorization';
import {
  ProblemLocationCorrectionApplicationError,
  applyProblemLocationCorrectionApplication,
  type ProblemLocationCorrectionApplicationContext,
  type ProblemLocationCorrectionApplicationReceipt,
} from '../../../../../src/admin/submissions/problem-location-correction-application';
import { createDrizzleProblemLocationCorrectionApplicationBackend } from '../../../../../src/admin/submissions/drizzle-problem-location-correction-application-backend';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';

interface ProblemLocationCorrectionApplicationEnvironment
  extends ProblemLocationCorrectionApplicationAuthorizationEnvironment {
  DATABASE_URL?: string;
  CPM_USER_SUBMISSION_SOURCE_ID?: string;
}

interface ProblemLocationCorrectionApplicationPagesContext {
  request: Request;
  env: ProblemLocationCorrectionApplicationEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type ProblemLocationCorrectionApplicationRunner = (
  context: ProblemLocationCorrectionApplicationContext,
  applicationId: string,
  sourceId: string,
  rawRequest: unknown,
  environment: ProblemLocationCorrectionApplicationEnvironment,
  appliedAt: Date,
) => Promise<ProblemLocationCorrectionApplicationReceipt>;

export interface ProblemLocationCorrectionApplicationHandlerDependencies {
  runApplication?: ProblemLocationCorrectionApplicationRunner;
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

async function runApplicationFromDatabase(
  context: ProblemLocationCorrectionApplicationContext,
  applicationId: string,
  sourceId: string,
  rawRequest: unknown,
  environment: ProblemLocationCorrectionApplicationEnvironment,
  appliedAt: Date,
): Promise<ProblemLocationCorrectionApplicationReceipt> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new ProblemLocationCorrectionApplicationError(
      'backend_failure',
      'The problem Location correction application database is unavailable.',
    );
  }
  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return applyProblemLocationCorrectionApplication(
    context,
    createDrizzleProblemLocationCorrectionApplicationBackend(database),
    applicationId,
    sourceId,
    rawRequest,
    appliedAt,
  );
}

export function createProblemLocationCorrectionApplicationHandler(
  dependencies: ProblemLocationCorrectionApplicationHandlerDependencies = {},
) {
  const runner = dependencies.runApplication ?? runApplicationFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (
    pagesContext: ProblemLocationCorrectionApplicationPagesContext,
  ): Promise<Response> => {
    let context: ProblemLocationCorrectionApplicationContext;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readProblemLocationCorrectionApplicationAuthorizationPolicy(pagesContext.env);
      context = authorizeProblemLocationCorrectionApplication(identity, policy);
    } catch (error) {
      if (
        error instanceof ProblemLocationCorrectionApplicationAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'problem_location_correction_application_unavailable' });
      }
      return jsonResponse(403, { error: 'problem_location_correction_application_denied' });
    }

    const applicationId = pagesContext.params.applicationId;
    const sourceId = z.uuid().safeParse(pagesContext.env.CPM_USER_SUBMISSION_SOURCE_ID);
    if (typeof applicationId !== 'string') {
      return jsonResponse(400, { error: 'problem_location_correction_application_invalid_request' });
    }
    if (!sourceId.success) {
      return jsonResponse(503, { error: 'problem_location_correction_application_unavailable' });
    }
    const contentType = pagesContext.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return jsonResponse(415, { error: 'problem_location_correction_application_json_required' });
    }

    let rawRequest: unknown;
    try {
      rawRequest = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'problem_location_correction_application_invalid_request' });
    }

    try {
      return jsonResponse(
        200,
        await runner(
          context,
          applicationId,
          sourceId.data,
          rawRequest,
          pagesContext.env,
          now(),
        ),
      );
    } catch (error) {
      if (error instanceof ProblemLocationCorrectionApplicationError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'problem_location_correction_application_denied' });
        }
        if (error.code === 'invalid_request') {
          return jsonResponse(400, {
            error: 'problem_location_correction_application_invalid_request',
          });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'problem_location_correction_application_not_found' });
        }
        if (error.code === 'ineligible') {
          return jsonResponse(422, { error: 'problem_location_correction_application_ineligible' });
        }
        if (error.code === 'conflict' || error.code === 'idempotency_conflict') {
          return jsonResponse(409, { error: 'problem_location_correction_application_conflict' });
        }
      }
      return jsonResponse(503, { error: 'problem_location_correction_application_unavailable' });
    }
  };
}

export const onRequestPost = createProblemLocationCorrectionApplicationHandler();
