import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import {
  authorizeBusinessClaimPaymentApplication,
  BusinessClaimPaymentApplicationAuthorizationError,
  readBusinessClaimPaymentApplicationAuthorizationPolicy,
  type BusinessClaimPaymentApplicationAuthorizationEnvironment,
} from '../../../../../src/admin/submissions/business-claim-payment-application-authorization';
import {
  applyBusinessClaimPaymentApplication,
  type BusinessClaimPaymentApplicationContext,
  BusinessClaimPaymentApplicationError,
} from '../../../../../src/admin/submissions/business-claim-payment-application';
import { createDrizzleBusinessClaimPaymentApplicationBackend } from '../../../../../src/admin/submissions/drizzle-business-claim-payment-application-backend';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';
import type { BusinessClaimPaymentApplicationReceipt } from '../../../../../src/submissions/business-claim-payment-application-contract';

interface BusinessClaimPaymentApplicationEnvironment
  extends BusinessClaimPaymentApplicationAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface BusinessClaimPaymentApplicationPagesContext {
  request: Request;
  env: BusinessClaimPaymentApplicationEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type BusinessClaimPaymentApplicationRunner = (
  context: BusinessClaimPaymentApplicationContext,
  applicationId: string,
  sourceId: string,
  rawRequest: unknown,
  environment: BusinessClaimPaymentApplicationEnvironment,
  appliedAt: Date,
) => Promise<BusinessClaimPaymentApplicationReceipt>;

export interface BusinessClaimPaymentApplicationHandlerDependencies {
  applyPayments?: BusinessClaimPaymentApplicationRunner;
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

async function applyPaymentsFromDatabase(
  context: BusinessClaimPaymentApplicationContext,
  applicationId: string,
  sourceId: string,
  rawRequest: unknown,
  environment: BusinessClaimPaymentApplicationEnvironment,
  appliedAt: Date,
): Promise<BusinessClaimPaymentApplicationReceipt> {
  const parsed = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!parsed.success) {
    throw new BusinessClaimPaymentApplicationError(
      'backend_failure',
      'The Business Claim payment application database is unavailable.',
    );
  }
  return applyBusinessClaimPaymentApplication(
    context,
    createDrizzleBusinessClaimPaymentApplicationBackend(
      createDatabase(parsed.data.DATABASE_URL),
    ),
    applicationId,
    sourceId,
    rawRequest,
    appliedAt,
  );
}

export function createBusinessClaimPaymentApplicationHandler(
  dependencies: BusinessClaimPaymentApplicationHandlerDependencies = {},
) {
  const runner = dependencies.applyPayments ?? applyPaymentsFromDatabase;
  const now = dependencies.now ?? (() => new Date());
  return async (pagesContext: BusinessClaimPaymentApplicationPagesContext): Promise<Response> => {
    let context: BusinessClaimPaymentApplicationContext;
    let sourceId: string;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readBusinessClaimPaymentApplicationAuthorizationPolicy(pagesContext.env);
      context = authorizeBusinessClaimPaymentApplication(identity, policy);
      sourceId = policy.sourceId;
    } catch (error) {
      if (
        error instanceof BusinessClaimPaymentApplicationAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'business_claim_payment_apply_unavailable' });
      }
      return jsonResponse(403, { error: 'business_claim_payment_apply_denied' });
    }

    const applicationId = pagesContext.params.applicationId;
    if (typeof applicationId !== 'string') {
      return jsonResponse(400, { error: 'business_claim_payment_apply_invalid_request' });
    }
    const contentType = pagesContext.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return jsonResponse(415, { error: 'business_claim_payment_apply_json_required' });
    }
    let rawRequest: unknown;
    try {
      rawRequest = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'business_claim_payment_apply_invalid_request' });
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
      if (error instanceof BusinessClaimPaymentApplicationError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'business_claim_payment_apply_denied' });
        }
        if (error.code === 'invalid_request') {
          return jsonResponse(400, { error: 'business_claim_payment_apply_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'business_claim_payment_apply_not_found' });
        }
        if (error.code === 'conflict' || error.code === 'idempotency_conflict') {
          return jsonResponse(409, { error: 'business_claim_payment_apply_conflict' });
        }
        if (error.code === 'ineligible') {
          return jsonResponse(422, { error: 'business_claim_payment_apply_ineligible' });
        }
      }
      return jsonResponse(503, { error: 'business_claim_payment_apply_unavailable' });
    }
  };
}

export const onRequestPost = createBusinessClaimPaymentApplicationHandler();
