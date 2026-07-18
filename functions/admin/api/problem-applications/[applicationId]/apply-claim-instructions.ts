import { z } from 'zod';
import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import {
  ProblemClaimInstructionCorrectionAuthorizationError,
  authorizeProblemClaimInstructionCorrectionApplication,
  readProblemClaimInstructionCorrectionAuthorizationPolicy,
  type ProblemClaimInstructionCorrectionAuthorizationEnvironment,
} from '../../../../../src/admin/submissions/problem-claim-instruction-correction-application-authorization';
import {
  ProblemClaimInstructionCorrectionApplicationError,
  applyProblemClaimInstructionCorrectionApplication,
  type ProblemClaimInstructionCorrectionApplicationContext,
  type ProblemClaimInstructionCorrectionApplicationReceipt,
} from '../../../../../src/admin/submissions/problem-claim-instruction-correction-application';
import { createDrizzleProblemClaimInstructionCorrectionApplicationBackend } from '../../../../../src/admin/submissions/drizzle-problem-claim-instruction-correction-application-backend';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';

interface ProblemClaimInstructionCorrectionEnvironment
  extends ProblemClaimInstructionCorrectionAuthorizationEnvironment {
  DATABASE_URL?: string;
  CPM_USER_SUBMISSION_SOURCE_ID?: string;
}

interface ProblemClaimInstructionCorrectionPagesContext {
  request: Request;
  env: ProblemClaimInstructionCorrectionEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type ProblemClaimInstructionCorrectionRunner = (
  context: ProblemClaimInstructionCorrectionApplicationContext,
  applicationId: string,
  sourceId: string,
  rawRequest: unknown,
  environment: ProblemClaimInstructionCorrectionEnvironment,
  appliedAt: Date,
) => Promise<ProblemClaimInstructionCorrectionApplicationReceipt>;

export interface ProblemClaimInstructionCorrectionHandlerDependencies {
  runApplication?: ProblemClaimInstructionCorrectionRunner;
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
  context: ProblemClaimInstructionCorrectionApplicationContext,
  applicationId: string,
  sourceId: string,
  rawRequest: unknown,
  environment: ProblemClaimInstructionCorrectionEnvironment,
  appliedAt: Date,
): Promise<ProblemClaimInstructionCorrectionApplicationReceipt> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new ProblemClaimInstructionCorrectionApplicationError(
      'backend_failure',
      'The Claim instruction correction database is unavailable.',
    );
  }
  return applyProblemClaimInstructionCorrectionApplication(
    context,
    createDrizzleProblemClaimInstructionCorrectionApplicationBackend(
      createDatabase(databaseEnvironment.data.DATABASE_URL),
    ),
    applicationId,
    sourceId,
    rawRequest,
    appliedAt,
  );
}

export function createProblemClaimInstructionCorrectionHandler(
  dependencies: ProblemClaimInstructionCorrectionHandlerDependencies = {},
) {
  const runner = dependencies.runApplication ?? runApplicationFromDatabase;
  const now = dependencies.now ?? (() => new Date());
  return async (pagesContext: ProblemClaimInstructionCorrectionPagesContext): Promise<Response> => {
    let context: ProblemClaimInstructionCorrectionApplicationContext;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readProblemClaimInstructionCorrectionAuthorizationPolicy(pagesContext.env);
      context = authorizeProblemClaimInstructionCorrectionApplication(identity, policy);
    } catch (error) {
      if (
        error instanceof ProblemClaimInstructionCorrectionAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'problem_claim_instruction_correction_unavailable' });
      }
      return jsonResponse(403, { error: 'problem_claim_instruction_correction_denied' });
    }

    const applicationId = pagesContext.params.applicationId;
    const sourceId = z.uuid().safeParse(pagesContext.env.CPM_USER_SUBMISSION_SOURCE_ID);
    if (typeof applicationId !== 'string') {
      return jsonResponse(400, { error: 'problem_claim_instruction_correction_invalid_request' });
    }
    if (!sourceId.success) {
      return jsonResponse(503, { error: 'problem_claim_instruction_correction_unavailable' });
    }
    const contentType = pagesContext.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return jsonResponse(415, { error: 'problem_claim_instruction_correction_json_required' });
    }

    let rawRequest: unknown;
    try {
      rawRequest = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'problem_claim_instruction_correction_invalid_request' });
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
      if (error instanceof ProblemClaimInstructionCorrectionApplicationError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'problem_claim_instruction_correction_denied' });
        }
        if (error.code === 'invalid_request') {
          return jsonResponse(400, { error: 'problem_claim_instruction_correction_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'problem_claim_instruction_correction_not_found' });
        }
        if (error.code === 'ineligible') {
          return jsonResponse(422, { error: 'problem_claim_instruction_correction_ineligible' });
        }
        if (error.code === 'conflict' || error.code === 'idempotency_conflict') {
          return jsonResponse(409, { error: 'problem_claim_instruction_correction_conflict' });
        }
      }
      return jsonResponse(503, { error: 'problem_claim_instruction_correction_unavailable' });
    }
  };
}

export const onRequestPost = createProblemClaimInstructionCorrectionHandler();
