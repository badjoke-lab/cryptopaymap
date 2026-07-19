import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import {
  ProblemClaimAssetSetPreviewAuthorizationError,
  authorizeProblemClaimAssetSetPreviewRead,
  readProblemClaimAssetSetPreviewAuthorizationPolicy,
  type ProblemClaimAssetSetPreviewAuthorizationEnvironment,
} from '../../../../../src/admin/submissions/problem-claim-asset-set-preview-authorization';
import {
  ProblemClaimAssetSetPreviewError,
  readProblemClaimAssetSetPreview,
  type ProblemClaimAssetSetPreview,
  type ProblemClaimAssetSetPreviewReadContext,
} from '../../../../../src/admin/submissions/problem-claim-asset-set-preview';
import { createDrizzleProblemClaimAssetSetPreviewBackend } from '../../../../../src/admin/submissions/drizzle-problem-claim-asset-set-preview-backend';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';

interface ProblemClaimAssetSetPreviewEnvironment
  extends ProblemClaimAssetSetPreviewAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface ProblemClaimAssetSetPreviewPagesContext {
  request: Request;
  env: ProblemClaimAssetSetPreviewEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type ProblemClaimAssetSetPreviewReader = (
  context: ProblemClaimAssetSetPreviewReadContext,
  applicationId: string,
  environment: ProblemClaimAssetSetPreviewEnvironment,
  generatedAt: Date,
) => Promise<ProblemClaimAssetSetPreview>;

export interface ProblemClaimAssetSetPreviewHandlerDependencies {
  readPreview?: ProblemClaimAssetSetPreviewReader;
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

async function readPreviewFromDatabase(
  context: ProblemClaimAssetSetPreviewReadContext,
  applicationId: string,
  environment: ProblemClaimAssetSetPreviewEnvironment,
  generatedAt: Date,
): Promise<ProblemClaimAssetSetPreview> {
  const parsed = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!parsed.success) {
    throw new ProblemClaimAssetSetPreviewError(
      'backend_failure',
      'The Claim Asset preview database is unavailable.',
    );
  }
  return readProblemClaimAssetSetPreview(
    context,
    createDrizzleProblemClaimAssetSetPreviewBackend(createDatabase(parsed.data.DATABASE_URL)),
    applicationId,
    generatedAt,
  );
}

export function createProblemClaimAssetSetPreviewHandler(
  dependencies: ProblemClaimAssetSetPreviewHandlerDependencies = {},
) {
  const reader = dependencies.readPreview ?? readPreviewFromDatabase;
  const now = dependencies.now ?? (() => new Date());
  return async (pagesContext: ProblemClaimAssetSetPreviewPagesContext): Promise<Response> => {
    let context: ProblemClaimAssetSetPreviewReadContext;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readProblemClaimAssetSetPreviewAuthorizationPolicy(pagesContext.env);
      context = authorizeProblemClaimAssetSetPreviewRead(identity, policy);
    } catch (error) {
      if (
        error instanceof ProblemClaimAssetSetPreviewAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'problem_claim_asset_preview_unavailable' });
      }
      return jsonResponse(403, { error: 'problem_claim_asset_preview_denied' });
    }

    const applicationId = pagesContext.params.applicationId;
    if (typeof applicationId !== 'string') {
      return jsonResponse(400, { error: 'problem_claim_asset_preview_invalid_request' });
    }
    try {
      return jsonResponse(200, await reader(context, applicationId, pagesContext.env, now()));
    } catch (error) {
      if (error instanceof ProblemClaimAssetSetPreviewError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'problem_claim_asset_preview_denied' });
        }
        if (error.code === 'invalid_request') {
          return jsonResponse(400, { error: 'problem_claim_asset_preview_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'problem_claim_asset_preview_not_found' });
        }
        if (error.code === 'ineligible') {
          return jsonResponse(422, { error: 'problem_claim_asset_preview_ineligible' });
        }
      }
      return jsonResponse(503, { error: 'problem_claim_asset_preview_unavailable' });
    }
  };
}

export const onRequestGet = createProblemClaimAssetSetPreviewHandler();
