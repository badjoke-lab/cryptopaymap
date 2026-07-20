import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import {
  BusinessClaimPaymentPreviewAuthorizationError,
  authorizeBusinessClaimPaymentPreviewRead,
  readBusinessClaimPaymentPreviewAuthorizationPolicy,
  type BusinessClaimPaymentPreviewAuthorizationEnvironment,
} from '../../../../../src/admin/submissions/business-claim-payment-preview-authorization';
import {
  BusinessClaimPaymentPreviewError,
  readBusinessClaimPaymentPreview,
  type BusinessClaimPaymentPreview,
  type BusinessClaimPaymentPreviewReadContext,
} from '../../../../../src/admin/submissions/business-claim-payment-preview';
import { createDrizzleBusinessClaimPaymentPreviewBackend } from '../../../../../src/admin/submissions/drizzle-business-claim-payment-preview-backend';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';

interface BusinessClaimPaymentPreviewEnvironment
  extends BusinessClaimPaymentPreviewAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface BusinessClaimPaymentPreviewPagesContext {
  request: Request;
  env: BusinessClaimPaymentPreviewEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type BusinessClaimPaymentPreviewReader = (
  context: BusinessClaimPaymentPreviewReadContext,
  applicationId: string,
  environment: BusinessClaimPaymentPreviewEnvironment,
  generatedAt: Date,
) => Promise<BusinessClaimPaymentPreview>;

export interface BusinessClaimPaymentPreviewHandlerDependencies {
  readPreview?: BusinessClaimPaymentPreviewReader;
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
  context: BusinessClaimPaymentPreviewReadContext,
  applicationId: string,
  environment: BusinessClaimPaymentPreviewEnvironment,
  generatedAt: Date,
): Promise<BusinessClaimPaymentPreview> {
  const parsed = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!parsed.success) {
    throw new BusinessClaimPaymentPreviewError(
      'backend_failure',
      'The Business Claim payment preview database is unavailable.',
    );
  }
  return readBusinessClaimPaymentPreview(
    context,
    createDrizzleBusinessClaimPaymentPreviewBackend(createDatabase(parsed.data.DATABASE_URL)),
    applicationId,
    generatedAt,
  );
}

export function createBusinessClaimPaymentPreviewHandler(
  dependencies: BusinessClaimPaymentPreviewHandlerDependencies = {},
) {
  const reader = dependencies.readPreview ?? readPreviewFromDatabase;
  const now = dependencies.now ?? (() => new Date());
  return async (pagesContext: BusinessClaimPaymentPreviewPagesContext): Promise<Response> => {
    let context: BusinessClaimPaymentPreviewReadContext;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readBusinessClaimPaymentPreviewAuthorizationPolicy(pagesContext.env);
      context = authorizeBusinessClaimPaymentPreviewRead(identity, policy);
    } catch (error) {
      if (
        error instanceof BusinessClaimPaymentPreviewAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'business_claim_payment_preview_unavailable' });
      }
      return jsonResponse(403, { error: 'business_claim_payment_preview_denied' });
    }

    const applicationId = pagesContext.params.applicationId;
    if (typeof applicationId !== 'string') {
      return jsonResponse(400, { error: 'business_claim_payment_preview_invalid_request' });
    }
    try {
      return jsonResponse(200, await reader(context, applicationId, pagesContext.env, now()));
    } catch (error) {
      if (error instanceof BusinessClaimPaymentPreviewError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'business_claim_payment_preview_denied' });
        }
        if (error.code === 'invalid_request') {
          return jsonResponse(400, { error: 'business_claim_payment_preview_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'business_claim_payment_preview_not_found' });
        }
        if (error.code === 'ineligible') {
          return jsonResponse(422, { error: 'business_claim_payment_preview_ineligible' });
        }
      }
      return jsonResponse(503, { error: 'business_claim_payment_preview_unavailable' });
    }
  };
}

export const onRequestGet = createBusinessClaimPaymentPreviewHandler();
