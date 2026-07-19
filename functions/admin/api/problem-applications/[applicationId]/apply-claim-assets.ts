import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import { createDrizzleProblemClaimAssetReplacementApplicationBackend } from '../../../../../src/admin/submissions/drizzle-problem-claim-asset-replacement-application-backend';
import {
  ProblemClaimAssetReplacementApplicationAuthorizationError,
  authorizeProblemClaimAssetReplacementApplication,
  readProblemClaimAssetReplacementApplicationAuthorizationPolicy,
  type ProblemClaimAssetReplacementApplicationAuthorizationEnvironment,
} from '../../../../../src/admin/submissions/problem-claim-asset-replacement-application-authorization';
import {
  applyProblemClaimAssetReplacementApplication,
  ProblemClaimAssetReplacementApplicationError,
  type ProblemClaimAssetReplacementApplicationContext,
} from '../../../../../src/admin/submissions/problem-claim-asset-replacement-application';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';
import type { ProblemClaimAssetReplacementApplicationReceipt } from '../../../../../src/submissions/problem-claim-asset-replacement-application-contract';

interface ProblemClaimAssetReplacementApplicationEnvironment
  extends ProblemClaimAssetReplacementApplicationAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface ProblemClaimAssetReplacementApplicationPagesContext {
  request: Request;
  env: ProblemClaimAssetReplacementApplicationEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type ProblemClaimAssetReplacementApplicationRunner = (
  context: ProblemClaimAssetReplacementApplicationContext,
  applicationId: string,
  sourceId: string,
  rawRequest: unknown,
  environment: ProblemClaimAssetReplacementApplicationEnvironment,
  appliedAt: Date,
) => Promise<ProblemClaimAssetReplacementApplicationReceipt>;

export interface ProblemClaimAssetReplacementApplicationHandlerDependencies {
  applyReplacement?: ProblemClaimAssetReplacementApplicationRunner;
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

async function applyReplacementFromDatabase(
  context: ProblemClaimAssetReplacementApplicationContext,
  applicationId: string,
  sourceId: string,
  rawRequest: unknown,
  environment: ProblemClaimAssetReplacementApplicationEnvironment,
  appliedAt: Date,
): Promise<ProblemClaimAssetReplacementApplicationReceipt> {
  const parsed = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!parsed.success) {
    throw new ProblemClaimAssetReplacementApplicationError(
      'backend_failure',
      'The Claim Asset replacement application database is unavailable.',
    );
  }
  return applyProblemClaimAssetReplacementApplication(
    context,
    createDrizzleProblemClaimAssetReplacementApplicationBackend(
      createDatabase(parsed.data.DATABASE_URL),
    ),
    applicationId,
    sourceId,
    rawRequest,
    appliedAt,
  );
}

export function createProblemClaimAssetReplacementApplicationHandler(
  dependencies: ProblemClaimAssetReplacementApplicationHandlerDependencies = {},
) {
  const runner = dependencies.applyReplacement ?? applyReplacementFromDatabase;
  const now = dependencies.now ?? (() => new Date());
  return async (
    pagesContext: ProblemClaimAssetReplacementApplicationPagesContext,
  ): Promise<Response> => {
    let context: ProblemClaimAssetReplacementApplicationContext;
    let sourceId: string;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readProblemClaimAssetReplacementApplicationAuthorizationPolicy(
        pagesContext.env,
      );
      context = authorizeProblemClaimAssetReplacementApplication(identity, policy);
      sourceId = policy.sourceId;
    } catch (error) {
      if (
        error instanceof ProblemClaimAssetReplacementApplicationAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'problem_claim_asset_apply_unavailable' });
      }
      return jsonResponse(403, { error: 'problem_claim_asset_apply_denied' });
    }

    const applicationId = pagesContext.params.applicationId;
    if (typeof applicationId !== 'string') {
      return jsonResponse(400, { error: 'problem_claim_asset_apply_invalid_request' });
    }
    const contentType = pagesContext.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return jsonResponse(415, { error: 'problem_claim_asset_apply_json_required' });
    }
    let rawRequest: unknown;
    try {
      rawRequest = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'problem_claim_asset_apply_invalid_request' });
    }

    try {
      return jsonResponse(
        200,
        await runner(
          context,
          applicationId,
          sourceId,
          rawRequest,
          pagesContext.env,
          now(),
        ),
      );
    } catch (error) {
      if (error instanceof ProblemClaimAssetReplacementApplicationError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'problem_claim_asset_apply_denied' });
        }
        if (error.code === 'invalid_request') {
          return jsonResponse(400, { error: 'problem_claim_asset_apply_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'problem_claim_asset_apply_not_found' });
        }
        if (error.code === 'conflict' || error.code === 'idempotency_conflict') {
          return jsonResponse(409, { error: 'problem_claim_asset_apply_conflict' });
        }
        if (error.code === 'ineligible') {
          return jsonResponse(422, { error: 'problem_claim_asset_apply_ineligible' });
        }
      }
      return jsonResponse(503, { error: 'problem_claim_asset_apply_unavailable' });
    }
  };
}

export const onRequestPost = createProblemClaimAssetReplacementApplicationHandler();
