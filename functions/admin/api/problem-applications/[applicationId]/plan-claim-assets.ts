import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import { createDrizzleProblemClaimAssetReplacementPlanBackend } from '../../../../../src/admin/submissions/drizzle-problem-claim-asset-replacement-plan-backend';
import {
  ProblemClaimAssetReplacementPlanAuthorizationError,
  authorizeProblemClaimAssetReplacementPlan,
  readProblemClaimAssetReplacementPlanAuthorizationPolicy,
  type ProblemClaimAssetReplacementPlanAuthorizationEnvironment,
} from '../../../../../src/admin/submissions/problem-claim-asset-replacement-plan-authorization';
import {
  ProblemClaimAssetReplacementPlanError,
  prepareProblemClaimAssetReplacementPlan,
  type ProblemClaimAssetReplacementPlanContext,
} from '../../../../../src/admin/submissions/problem-claim-asset-replacement-plan';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';
import type { ProblemClaimAssetReplacementPlanReceipt } from '../../../../../src/submissions/problem-claim-asset-replacement-plan-contract';

interface ProblemClaimAssetReplacementPlanEnvironment
  extends ProblemClaimAssetReplacementPlanAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface ProblemClaimAssetReplacementPlanPagesContext {
  request: Request;
  env: ProblemClaimAssetReplacementPlanEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type ProblemClaimAssetReplacementPlanRunner = (
  context: ProblemClaimAssetReplacementPlanContext,
  applicationId: string,
  rawRequest: unknown,
  environment: ProblemClaimAssetReplacementPlanEnvironment,
  plannedAt: Date,
) => Promise<ProblemClaimAssetReplacementPlanReceipt>;

export interface ProblemClaimAssetReplacementPlanHandlerDependencies {
  runPlan?: ProblemClaimAssetReplacementPlanRunner;
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

async function runPlanFromDatabase(
  context: ProblemClaimAssetReplacementPlanContext,
  applicationId: string,
  rawRequest: unknown,
  environment: ProblemClaimAssetReplacementPlanEnvironment,
  plannedAt: Date,
): Promise<ProblemClaimAssetReplacementPlanReceipt> {
  const parsed = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!parsed.success) {
    throw new ProblemClaimAssetReplacementPlanError(
      'backend_failure',
      'The Claim Asset replacement plan database is unavailable.',
    );
  }
  return prepareProblemClaimAssetReplacementPlan(
    context,
    createDrizzleProblemClaimAssetReplacementPlanBackend(
      createDatabase(parsed.data.DATABASE_URL),
    ),
    applicationId,
    rawRequest,
    plannedAt,
  );
}

export function createProblemClaimAssetReplacementPlanHandler(
  dependencies: ProblemClaimAssetReplacementPlanHandlerDependencies = {},
) {
  const runner = dependencies.runPlan ?? runPlanFromDatabase;
  const now = dependencies.now ?? (() => new Date());
  return async (pagesContext: ProblemClaimAssetReplacementPlanPagesContext): Promise<Response> => {
    let context: ProblemClaimAssetReplacementPlanContext;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readProblemClaimAssetReplacementPlanAuthorizationPolicy(pagesContext.env);
      context = authorizeProblemClaimAssetReplacementPlan(identity, policy);
    } catch (error) {
      if (
        error instanceof ProblemClaimAssetReplacementPlanAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'problem_claim_asset_plan_unavailable' });
      }
      return jsonResponse(403, { error: 'problem_claim_asset_plan_denied' });
    }

    const applicationId = pagesContext.params.applicationId;
    if (typeof applicationId !== 'string') {
      return jsonResponse(400, { error: 'problem_claim_asset_plan_invalid_request' });
    }
    const contentType = pagesContext.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return jsonResponse(415, { error: 'problem_claim_asset_plan_json_required' });
    }
    let rawRequest: unknown;
    try {
      rawRequest = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'problem_claim_asset_plan_invalid_request' });
    }

    try {
      return jsonResponse(
        200,
        await runner(context, applicationId, rawRequest, pagesContext.env, now()),
      );
    } catch (error) {
      if (error instanceof ProblemClaimAssetReplacementPlanError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'problem_claim_asset_plan_denied' });
        }
        if (error.code === 'invalid_request') {
          return jsonResponse(400, { error: 'problem_claim_asset_plan_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'problem_claim_asset_plan_not_found' });
        }
        if (error.code === 'conflict' || error.code === 'idempotency_conflict') {
          return jsonResponse(409, { error: 'problem_claim_asset_plan_conflict' });
        }
        if (error.code === 'selection_required') {
          return jsonResponse(422, { error: 'problem_claim_asset_plan_selection_required' });
        }
        if (error.code === 'no_change') {
          return jsonResponse(422, { error: 'problem_claim_asset_plan_no_change' });
        }
        if (error.code === 'ineligible') {
          return jsonResponse(422, { error: 'problem_claim_asset_plan_ineligible' });
        }
      }
      return jsonResponse(503, { error: 'problem_claim_asset_plan_unavailable' });
    }
  };
}

export const onRequestPost = createProblemClaimAssetReplacementPlanHandler();
