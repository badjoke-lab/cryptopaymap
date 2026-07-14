import { z } from 'zod';
import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import {
  BusinessClaimFieldApplicationError,
  type BusinessClaimFieldApplicationRequest,
} from '../../../../../src/admin/submissions/business-claim-field-application';
import {
  BusinessClaimFieldApplicationAuthorizationError,
  authorizeBusinessClaimFieldApplication,
  readBusinessClaimFieldApplicationAuthorizationPolicy,
  type BusinessClaimFieldApplicationAuthorizationEnvironment,
  type BusinessClaimFieldApplicationContext,
} from '../../../../../src/admin/submissions/business-claim-field-application-authorization';
import {
  businessClaimFieldApplicationEditorRequestSchema,
  type BusinessClaimFieldApplicationEditorRequest,
} from '../../../../../src/admin/submissions/business-claim-field-application-editor-request';
import {
  applyBusinessClaimFieldApplication,
  BusinessClaimFieldApplicationPersistenceError,
  type BusinessClaimFieldApplicationPersistenceBackend,
} from '../../../../../src/admin/submissions/business-claim-field-application-persistence';
import {
  BusinessClaimFieldApplicationWorkspaceError,
  loadBusinessClaimFieldApplicationWorkspace,
  type BusinessClaimFieldApplicationWorkspaceResponse,
} from '../../../../../src/admin/submissions/business-claim-field-application-workspace';
import { createDrizzleBusinessClaimFieldApplicationBackend } from '../../../../../src/admin/submissions/drizzle-business-claim-field-application-backend';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';
import type { BusinessClaimFieldApplicationReceipt } from '../../../../../src/submissions/business-claim-field-application-persistence-contract';

interface BusinessClaimFieldApplicationEnvironment
  extends BusinessClaimFieldApplicationAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface BusinessClaimFieldApplicationPagesContext {
  request: Request;
  env: BusinessClaimFieldApplicationEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type WorkspaceLoader = (
  context: BusinessClaimFieldApplicationContext,
  submissionId: string,
  relationshipDecisionId: string,
  environment: BusinessClaimFieldApplicationEnvironment,
  asOf: Date,
) => Promise<BusinessClaimFieldApplicationWorkspaceResponse>;

type ApplicationWriter = (
  context: BusinessClaimFieldApplicationContext,
  submissionId: string,
  request: BusinessClaimFieldApplicationRequest,
  environment: BusinessClaimFieldApplicationEnvironment,
  appliedAt: Date,
) => Promise<BusinessClaimFieldApplicationReceipt>;

export interface BusinessClaimFieldApplicationHandlerDependencies {
  loadWorkspace?: WorkspaceLoader;
  writeApplication?: ApplicationWriter;
  now?: () => Date;
}

function jsonResponse(status: number, body: unknown): Response {
  return withAdminSecurityHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }),
  );
}

function databaseUrl(environment: BusinessClaimFieldApplicationEnvironment): string {
  const result = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!result.success) throw new Error('Business Claim field application database is unavailable.');
  return result.data.DATABASE_URL;
}

function createBackend(
  environment: BusinessClaimFieldApplicationEnvironment,
): BusinessClaimFieldApplicationPersistenceBackend {
  return createDrizzleBusinessClaimFieldApplicationBackend(
    createDatabase(databaseUrl(environment)),
  );
}

function submissionIdFromContext(
  pagesContext: BusinessClaimFieldApplicationPagesContext,
): string | null {
  const value = pagesContext.params.submissionId;
  return typeof value === 'string' && z.uuid().safeParse(value).success ? value : null;
}

function relationshipDecisionIdFromRequest(request: Request): string | null {
  const value = new URL(request.url).searchParams.get('relationshipDecisionId');
  return value !== null && z.uuid().safeParse(value).success ? value : null;
}

function authorize(
  pagesContext: BusinessClaimFieldApplicationPagesContext,
): BusinessClaimFieldApplicationContext {
  const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
  return authorizeBusinessClaimFieldApplication(
    identity,
    readBusinessClaimFieldApplicationAuthorizationPolicy(pagesContext.env),
  );
}

async function loadWorkspaceFromDatabase(
  context: BusinessClaimFieldApplicationContext,
  submissionId: string,
  relationshipDecisionId: string,
  environment: BusinessClaimFieldApplicationEnvironment,
  asOf: Date,
) {
  return loadBusinessClaimFieldApplicationWorkspace(
    context,
    createBackend(environment),
    submissionId,
    relationshipDecisionId,
    asOf,
  );
}

async function writeApplicationToDatabase(
  context: BusinessClaimFieldApplicationContext,
  submissionId: string,
  request: BusinessClaimFieldApplicationRequest,
  environment: BusinessClaimFieldApplicationEnvironment,
  appliedAt: Date,
) {
  return applyBusinessClaimFieldApplication(
    context,
    createBackend(environment),
    submissionId,
    request,
    appliedAt,
  );
}

function authorizationFailure(error: unknown): Response {
  if (
    error instanceof BusinessClaimFieldApplicationAuthorizationError &&
    error.code === 'configuration'
  ) {
    return jsonResponse(503, { error: 'claim_field_application_unavailable' });
  }
  return jsonResponse(403, { error: 'claim_field_application_denied' });
}

function workspaceFailure(error: unknown): Response {
  if (error instanceof BusinessClaimFieldApplicationWorkspaceError) {
    if (error.code === 'unauthorized') {
      return jsonResponse(403, { error: 'claim_field_application_denied' });
    }
    if (error.code === 'invalid_request') {
      return jsonResponse(400, { error: 'claim_field_application_invalid_request' });
    }
    if (error.code === 'not_found') {
      return jsonResponse(404, { error: 'claim_field_application_not_found' });
    }
    if (error.code === 'invalid_workspace') {
      return jsonResponse(409, { error: 'claim_field_application_workspace_conflict' });
    }
  }
  return jsonResponse(503, { error: 'claim_field_application_unavailable' });
}

function applicationFailure(error: unknown): Response {
  if (error instanceof BusinessClaimFieldApplicationPersistenceError) {
    if (error.code === 'unauthorized') {
      return jsonResponse(403, { error: 'claim_field_application_denied' });
    }
    if (error.code === 'invalid_request') {
      return jsonResponse(400, { error: 'claim_field_application_invalid_request' });
    }
    if (error.code === 'idempotency_conflict' || error.code === 'conflict') {
      return jsonResponse(409, { error: 'claim_field_application_conflict' });
    }
    return jsonResponse(503, { error: 'claim_field_application_unavailable' });
  }
  if (error instanceof BusinessClaimFieldApplicationError) {
    if (error.code === 'unauthorized') {
      return jsonResponse(403, { error: 'claim_field_application_denied' });
    }
    if (error.code === 'not_found') {
      return jsonResponse(404, { error: 'claim_field_application_not_found' });
    }
    if (error.code === 'conflict' || error.code === 'stale_target') {
      return jsonResponse(409, { error: 'claim_field_application_conflict' });
    }
    if (error.code === 'backend_failure') {
      return jsonResponse(503, { error: 'claim_field_application_unavailable' });
    }
    return jsonResponse(400, { error: 'claim_field_application_invalid' });
  }
  return jsonResponse(503, { error: 'claim_field_application_unavailable' });
}

function durableRequest(
  requestId: string,
  body: BusinessClaimFieldApplicationEditorRequest,
): BusinessClaimFieldApplicationRequest {
  return {
    schemaVersion: 'business-claim-field-application-v1',
    requestId,
    ...body,
  };
}

export function createBusinessClaimFieldApplicationHandlers(
  dependencies: BusinessClaimFieldApplicationHandlerDependencies = {},
) {
  const loadWorkspace = dependencies.loadWorkspace ?? loadWorkspaceFromDatabase;
  const writeApplication = dependencies.writeApplication ?? writeApplicationToDatabase;
  const now = dependencies.now ?? (() => new Date());

  return {
    async get(pagesContext: BusinessClaimFieldApplicationPagesContext): Promise<Response> {
      let context: BusinessClaimFieldApplicationContext;
      try {
        context = authorize(pagesContext);
      } catch (error) {
        return authorizationFailure(error);
      }

      const submissionId = submissionIdFromContext(pagesContext);
      const relationshipDecisionId = relationshipDecisionIdFromRequest(pagesContext.request);
      if (submissionId === null || relationshipDecisionId === null) {
        return jsonResponse(400, { error: 'claim_field_application_invalid_request' });
      }

      try {
        return jsonResponse(
          200,
          await loadWorkspace(
            context,
            submissionId,
            relationshipDecisionId,
            pagesContext.env,
            now(),
          ),
        );
      } catch (error) {
        return workspaceFailure(error);
      }
    },

    async post(pagesContext: BusinessClaimFieldApplicationPagesContext): Promise<Response> {
      let context: BusinessClaimFieldApplicationContext;
      try {
        context = authorize(pagesContext);
      } catch (error) {
        return authorizationFailure(error);
      }

      const submissionId = submissionIdFromContext(pagesContext);
      const relationshipDecisionId = relationshipDecisionIdFromRequest(pagesContext.request);
      const requestIdResult = z
        .uuid()
        .safeParse(pagesContext.request.headers.get('Idempotency-Key'));
      if (
        submissionId === null ||
        relationshipDecisionId === null ||
        !requestIdResult.success
      ) {
        return jsonResponse(400, { error: 'claim_field_application_invalid_request' });
      }

      let rawBody: unknown;
      try {
        rawBody = await pagesContext.request.json();
      } catch {
        return jsonResponse(400, { error: 'claim_field_application_invalid_json' });
      }
      const bodyResult = businessClaimFieldApplicationEditorRequestSchema.safeParse(rawBody);
      if (!bodyResult.success) {
        return jsonResponse(400, {
          error: 'claim_field_application_invalid',
          issues: bodyResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        });
      }
      if (bodyResult.data.expectedRelationshipDecisionId !== relationshipDecisionId) {
        return jsonResponse(409, { error: 'claim_field_application_conflict' });
      }

      try {
        return jsonResponse(
          200,
          await writeApplication(
            context,
            submissionId,
            durableRequest(requestIdResult.data, bodyResult.data),
            pagesContext.env,
            now(),
          ),
        );
      } catch (error) {
        return applicationFailure(error);
      }
    },
  };
}

const handlers = createBusinessClaimFieldApplicationHandlers();
export const onRequestGet = handlers.get;
export const onRequestPost = handlers.post;
