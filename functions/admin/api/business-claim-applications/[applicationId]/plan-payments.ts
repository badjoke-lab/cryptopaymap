import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import { createDrizzleBusinessClaimPaymentPlanBackend } from '../../../../../src/admin/submissions/drizzle-business-claim-payment-plan-backend';
import {
  BusinessClaimPaymentPlanAuthorizationError,
  authorizeBusinessClaimPaymentPlan,
  readBusinessClaimPaymentPlanAuthorizationPolicy,
  type BusinessClaimPaymentPlanAuthorizationEnvironment,
} from '../../../../../src/admin/submissions/business-claim-payment-plan-authorization';
import {
  BusinessClaimPaymentPlanError,
  prepareBusinessClaimPaymentPlan,
  type BusinessClaimPaymentPlanContext,
} from '../../../../../src/admin/submissions/business-claim-payment-plan';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';
import type { BusinessClaimPaymentPlanReceipt } from '../../../../../src/submissions/business-claim-payment-plan-contract';

interface BusinessClaimPaymentPlanEnvironment
  extends BusinessClaimPaymentPlanAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface BusinessClaimPaymentPlanPagesContext {
  request: Request;
  env: BusinessClaimPaymentPlanEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type BusinessClaimPaymentPlanRunner = (
  context: BusinessClaimPaymentPlanContext,
  applicationId: string,
  rawRequest: unknown,
  environment: BusinessClaimPaymentPlanEnvironment,
  plannedAt: Date,
) => Promise<BusinessClaimPaymentPlanReceipt>;

export interface BusinessClaimPaymentPlanHandlerDependencies {
  runPlan?: BusinessClaimPaymentPlanRunner;
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
  context: BusinessClaimPaymentPlanContext,
  applicationId: string,
  rawRequest: unknown,
  environment: BusinessClaimPaymentPlanEnvironment,
  plannedAt: Date,
): Promise<BusinessClaimPaymentPlanReceipt> {
  const parsed = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!parsed.success) {
    throw new BusinessClaimPaymentPlanError(
      'backend_failure',
      'The Business Claim payment plan database is unavailable.',
    );
  }
  return prepareBusinessClaimPaymentPlan(
    context,
    createDrizzleBusinessClaimPaymentPlanBackend(createDatabase(parsed.data.DATABASE_URL)),
    applicationId,
    rawRequest,
    plannedAt,
  );
}

export function createBusinessClaimPaymentPlanHandler(
  dependencies: BusinessClaimPaymentPlanHandlerDependencies = {},
) {
  const runner = dependencies.runPlan ?? runPlanFromDatabase;
  const now = dependencies.now ?? (() => new Date());
  return async (pagesContext: BusinessClaimPaymentPlanPagesContext): Promise<Response> => {
    let context: BusinessClaimPaymentPlanContext;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readBusinessClaimPaymentPlanAuthorizationPolicy(pagesContext.env);
      context = authorizeBusinessClaimPaymentPlan(identity, policy);
    } catch (error) {
      if (
        error instanceof BusinessClaimPaymentPlanAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'business_claim_payment_plan_unavailable' });
      }
      return jsonResponse(403, { error: 'business_claim_payment_plan_denied' });
    }

    const applicationId = pagesContext.params.applicationId;
    if (typeof applicationId !== 'string') {
      return jsonResponse(400, { error: 'business_claim_payment_plan_invalid_request' });
    }
    const contentType = pagesContext.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return jsonResponse(415, { error: 'business_claim_payment_plan_json_required' });
    }
    let rawRequest: unknown;
    try {
      rawRequest = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'business_claim_payment_plan_invalid_request' });
    }

    try {
      return jsonResponse(
        200,
        await runner(context, applicationId, rawRequest, pagesContext.env, now()),
      );
    } catch (error) {
      if (error instanceof BusinessClaimPaymentPlanError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'business_claim_payment_plan_denied' });
        }
        if (error.code === 'invalid_request') {
          return jsonResponse(400, { error: 'business_claim_payment_plan_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'business_claim_payment_plan_not_found' });
        }
        if (error.code === 'conflict' || error.code === 'idempotency_conflict') {
          return jsonResponse(409, { error: 'business_claim_payment_plan_conflict' });
        }
        if (error.code === 'selection_required') {
          return jsonResponse(422, { error: 'business_claim_payment_plan_selection_required' });
        }
        if (error.code === 'ineligible') {
          return jsonResponse(422, { error: 'business_claim_payment_plan_ineligible' });
        }
      }
      return jsonResponse(503, { error: 'business_claim_payment_plan_unavailable' });
    }
  };
}

export const onRequestPost = createBusinessClaimPaymentPlanHandler();
