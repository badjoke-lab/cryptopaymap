import { withAdminSecurityHeaders } from '../../../../src/admin/access/config';
import { createDrizzleTerminalResolutionBackend } from '../../../../src/admin/submissions/drizzle-terminal-resolution-backend';
import {
  SubmissionTerminalResolutionAuthorizationError,
  authorizeSubmissionTerminalResolution,
  readSubmissionTerminalResolutionAuthorizationPolicy,
  type SubmissionTerminalResolutionAuthorizationEnvironment,
} from '../../../../src/admin/submissions/terminal-resolution-authorization';
import {
  SubmissionTerminalResolutionError,
  applySubmissionTerminalResolution,
  type SubmissionTerminalResolutionReceipt,
} from '../../../../src/admin/submissions/terminal-resolution';
import { readProtectedAdminIdentity } from '../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../src/schemas/environment';

interface TerminalResolutionEnvironment
  extends SubmissionTerminalResolutionAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface TerminalResolutionPagesContext {
  request: Request;
  env: TerminalResolutionEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type TerminalResolutionRunner = (
  context: ReturnType<typeof authorizeSubmissionTerminalResolution>,
  submissionId: string,
  rawRequest: unknown,
  environment: TerminalResolutionEnvironment,
  changedAt: Date,
) => Promise<SubmissionTerminalResolutionReceipt>;

export interface TerminalResolutionHandlerDependencies {
  runTerminalResolution?: TerminalResolutionRunner;
  now?: () => Date;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return withAdminSecurityHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }),
  );
}

async function runTerminalResolutionFromDatabase(
  context: ReturnType<typeof authorizeSubmissionTerminalResolution>,
  submissionId: string,
  rawRequest: unknown,
  environment: TerminalResolutionEnvironment,
  changedAt: Date,
): Promise<SubmissionTerminalResolutionReceipt> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new SubmissionTerminalResolutionError(
      'backend_failure',
      'The Submission terminal-resolution database is unavailable.',
    );
  }
  const database = createDatabase(databaseEnvironment.data.DATABASE_URL);
  return applySubmissionTerminalResolution(
    context,
    createDrizzleTerminalResolutionBackend(database),
    submissionId,
    rawRequest,
    changedAt,
  );
}

export function createTerminalResolutionHandler(
  dependencies: TerminalResolutionHandlerDependencies = {},
) {
  const runner = dependencies.runTerminalResolution ?? runTerminalResolutionFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: TerminalResolutionPagesContext): Promise<Response> => {
    let context: ReturnType<typeof authorizeSubmissionTerminalResolution>;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readSubmissionTerminalResolutionAuthorizationPolicy(pagesContext.env);
      context = authorizeSubmissionTerminalResolution(identity, policy);
    } catch (error) {
      if (
        error instanceof SubmissionTerminalResolutionAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'submission_terminal_resolution_unavailable' });
      }
      return jsonResponse(403, { error: 'submission_terminal_resolution_denied' });
    }

    const submissionId = pagesContext.params.submissionId;
    if (typeof submissionId !== 'string') {
      return jsonResponse(400, { error: 'submission_terminal_resolution_invalid_request' });
    }

    const contentType = pagesContext.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return jsonResponse(415, { error: 'submission_terminal_resolution_json_required' });
    }

    let rawRequest: unknown;
    try {
      rawRequest = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'submission_terminal_resolution_invalid_request' });
    }

    try {
      const receipt = await runner(context, submissionId, rawRequest, pagesContext.env, now());
      return jsonResponse(200, receipt);
    } catch (error) {
      if (error instanceof SubmissionTerminalResolutionError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'submission_terminal_resolution_denied' });
        }
        if (error.code === 'invalid_request') {
          return jsonResponse(400, { error: 'submission_terminal_resolution_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'submission_terminal_resolution_not_found' });
        }
        if (error.code === 'ineligible') {
          return jsonResponse(422, { error: 'submission_terminal_resolution_ineligible' });
        }
        if (error.code === 'conflict' || error.code === 'idempotency_conflict') {
          return jsonResponse(409, { error: 'submission_terminal_resolution_conflict' });
        }
      }
      return jsonResponse(503, { error: 'submission_terminal_resolution_unavailable' });
    }
  };
}

export const onRequestPost = createTerminalResolutionHandler();
