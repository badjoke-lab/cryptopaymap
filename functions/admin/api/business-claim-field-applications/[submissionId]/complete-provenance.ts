import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import {
  authorizeBusinessClaimFieldProvenance,
  BusinessClaimFieldProvenanceAuthorizationError,
  readBusinessClaimFieldProvenanceAuthorizationPolicy,
  type BusinessClaimFieldProvenanceAuthorizationEnvironment,
} from '../../../../../src/admin/submissions/business-claim-field-provenance-authorization';
import {
  completeBusinessClaimFieldProvenance,
  type BusinessClaimFieldProvenanceContext,
  BusinessClaimFieldProvenanceError,
} from '../../../../../src/admin/submissions/business-claim-field-provenance';
import { createDrizzleBusinessClaimFieldProvenanceBackend } from '../../../../../src/admin/submissions/drizzle-business-claim-field-provenance-backend';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';
import type { BusinessClaimFieldProvenanceReceipt } from '../../../../../src/submissions/business-claim-field-provenance-contract';

interface BusinessClaimFieldProvenanceEnvironment
  extends BusinessClaimFieldProvenanceAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface BusinessClaimFieldProvenancePagesContext {
  request: Request;
  env: BusinessClaimFieldProvenanceEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type BusinessClaimFieldProvenanceRunner = (
  context: BusinessClaimFieldProvenanceContext,
  submissionId: string,
  sourceId: string,
  rawRequest: unknown,
  environment: BusinessClaimFieldProvenanceEnvironment,
  completedAt: Date,
) => Promise<BusinessClaimFieldProvenanceReceipt>;

export interface BusinessClaimFieldProvenanceHandlerDependencies {
  completeProvenance?: BusinessClaimFieldProvenanceRunner;
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

async function completeProvenanceFromDatabase(
  context: BusinessClaimFieldProvenanceContext,
  submissionId: string,
  sourceId: string,
  rawRequest: unknown,
  environment: BusinessClaimFieldProvenanceEnvironment,
  completedAt: Date,
): Promise<BusinessClaimFieldProvenanceReceipt> {
  const parsed = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!parsed.success) {
    throw new BusinessClaimFieldProvenanceError(
      'backend_failure',
      'The Business Claim field provenance database is unavailable.',
    );
  }
  return completeBusinessClaimFieldProvenance(
    context,
    createDrizzleBusinessClaimFieldProvenanceBackend(createDatabase(parsed.data.DATABASE_URL)),
    submissionId,
    sourceId,
    rawRequest,
    completedAt,
  );
}

export function createBusinessClaimFieldProvenanceHandler(
  dependencies: BusinessClaimFieldProvenanceHandlerDependencies = {},
) {
  const runner = dependencies.completeProvenance ?? completeProvenanceFromDatabase;
  const now = dependencies.now ?? (() => new Date());
  return async (pagesContext: BusinessClaimFieldProvenancePagesContext): Promise<Response> => {
    let context: BusinessClaimFieldProvenanceContext;
    let sourceId: string;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readBusinessClaimFieldProvenanceAuthorizationPolicy(pagesContext.env);
      context = authorizeBusinessClaimFieldProvenance(identity, policy);
      sourceId = policy.sourceId;
    } catch (error) {
      if (
        error instanceof BusinessClaimFieldProvenanceAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'business_claim_field_provenance_unavailable' });
      }
      return jsonResponse(403, { error: 'business_claim_field_provenance_denied' });
    }

    const submissionId = pagesContext.params.submissionId;
    if (typeof submissionId !== 'string') {
      return jsonResponse(400, { error: 'business_claim_field_provenance_invalid_request' });
    }
    const contentType = pagesContext.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return jsonResponse(415, { error: 'business_claim_field_provenance_json_required' });
    }
    let rawRequest: unknown;
    try {
      rawRequest = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'business_claim_field_provenance_invalid_request' });
    }

    try {
      return jsonResponse(
        200,
        await runner(
          context,
          submissionId,
          sourceId,
          rawRequest,
          pagesContext.env,
          now(),
        ),
      );
    } catch (error) {
      if (error instanceof BusinessClaimFieldProvenanceError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'business_claim_field_provenance_denied' });
        }
        if (error.code === 'invalid_request') {
          return jsonResponse(400, { error: 'business_claim_field_provenance_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'business_claim_field_provenance_not_found' });
        }
        if (error.code === 'conflict' || error.code === 'idempotency_conflict') {
          return jsonResponse(409, { error: 'business_claim_field_provenance_conflict' });
        }
        if (error.code === 'ineligible') {
          return jsonResponse(422, { error: 'business_claim_field_provenance_ineligible' });
        }
      }
      return jsonResponse(503, { error: 'business_claim_field_provenance_unavailable' });
    }
  };
}

export const onRequestPost = createBusinessClaimFieldProvenanceHandler();
