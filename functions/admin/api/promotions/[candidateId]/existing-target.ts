import { z } from 'zod';
import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import {
  CandidateQueueAuthorizationError,
  authorizeCandidateQueueRead,
  readCandidateQueueAuthorizationPolicy,
  type CandidateQueueAuthorizationEnvironment,
} from '../../../../../src/admin/candidates/authorization';
import { createDrizzleCandidateDetailBackend } from '../../../../../src/admin/candidates/drizzle-candidate-detail-backend';
import {
  CandidatePromotionAuthorizationError,
  authorizeCandidatePromotion,
  readCandidatePromotionAuthorizationPolicy,
  type CandidatePromotionAuthorizationEnvironment,
} from '../../../../../src/admin/promotion/authorization';
import {
  CandidatePromotionError,
  type CandidatePromotionMutationContext,
  type CandidatePromotionReceipt,
} from '../../../../../src/admin/promotion/candidate-promotion';
import { createDrizzleExistingTargetLinkBackend } from '../../../../../src/admin/promotion/drizzle-existing-target-link-backend';
import { createDrizzlePromotionRegistryBackend } from '../../../../../src/admin/promotion/drizzle-promotion-registry-backend';
import {
  candidateExistingTargetLinkInputSchema,
  createCandidateExistingTargetLinkService,
} from '../../../../../src/admin/promotion/existing-target-link';
import {
  CandidatePromotionWorkspaceError,
  loadCandidatePromotionWorkspace,
  type CandidatePromotionWorkspaceResponse,
} from '../../../../../src/admin/promotion/workspace';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';

const existingTargetEditorRequestSchema = candidateExistingTargetLinkInputSchema.omit({
  candidateId: true,
  linkedAt: true,
});
type ExistingTargetEditorRequest = z.infer<typeof existingTargetEditorRequestSchema>;

interface ExistingTargetEnvironment
  extends CandidateQueueAuthorizationEnvironment,
    CandidatePromotionAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface ExistingTargetPagesContext {
  request: Request;
  env: ExistingTargetEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type WorkspaceLoader = (
  context: ReturnType<typeof authorizeCandidateQueueRead>,
  candidateId: string,
  environment: ExistingTargetEnvironment,
  asOf: Date,
) => Promise<CandidatePromotionWorkspaceResponse>;

type ExistingTargetCommitter = (
  candidateId: string,
  environment: ExistingTargetEnvironment,
  context: CandidatePromotionMutationContext,
  body: ExistingTargetEditorRequest,
  linkedAt: Date,
) => Promise<CandidatePromotionReceipt>;

export interface ExistingTargetLinkHandlerDependencies {
  loadWorkspace?: WorkspaceLoader;
  commitLink?: ExistingTargetCommitter;
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

function readCandidateId(params: Record<string, string | string[]>): string | null {
  const candidateId = params.candidateId;
  return typeof candidateId === 'string' && z.uuid().safeParse(candidateId).success
    ? candidateId
    : null;
}

function databaseUrl(environment: ExistingTargetEnvironment): string {
  const result = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!result.success) throw new Error('Existing-target link database is unavailable.');
  return result.data.DATABASE_URL;
}

async function loadWorkspaceFromDatabase(
  context: ReturnType<typeof authorizeCandidateQueueRead>,
  candidateId: string,
  environment: ExistingTargetEnvironment,
  asOf: Date,
): Promise<CandidatePromotionWorkspaceResponse> {
  const database = createDatabase(databaseUrl(environment));
  return loadCandidatePromotionWorkspace(
    context,
    createDrizzleCandidateDetailBackend(database),
    createDrizzlePromotionRegistryBackend(database),
    candidateId,
    asOf,
  );
}

async function commitLinkToDatabase(
  candidateId: string,
  environment: ExistingTargetEnvironment,
  context: CandidatePromotionMutationContext,
  body: ExistingTargetEditorRequest,
  linkedAt: Date,
): Promise<CandidatePromotionReceipt> {
  return createCandidateExistingTargetLinkService(
    createDrizzleExistingTargetLinkBackend(createDatabase(databaseUrl(environment))),
  ).link(context, {
    candidateId,
    ...body,
    linkedAt: linkedAt.toISOString(),
  });
}

function exactSourceSet(
  workspace: CandidatePromotionWorkspaceResponse,
  body: ExistingTargetEditorRequest,
): boolean {
  const current = workspace.detail.sources.map((source) => source.id).sort();
  const expected = [...body.sourceRecordIds].sort();
  return JSON.stringify(current) === JSON.stringify(expected);
}

export function createExistingTargetLinkHandler(
  dependencies: ExistingTargetLinkHandlerDependencies = {},
) {
  const loadWorkspace = dependencies.loadWorkspace ?? loadWorkspaceFromDatabase;
  const commitLink = dependencies.commitLink ?? commitLinkToDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async function post(pagesContext: ExistingTargetPagesContext): Promise<Response> {
    let readContext: ReturnType<typeof authorizeCandidateQueueRead>;
    let mutationContext: CandidatePromotionMutationContext;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      readContext = authorizeCandidateQueueRead(
        identity,
        readCandidateQueueAuthorizationPolicy(pagesContext.env),
      );
      mutationContext = authorizeCandidatePromotion(
        identity,
        readCandidatePromotionAuthorizationPolicy(pagesContext.env),
        pagesContext.request.headers.get('Idempotency-Key'),
      );
    } catch (error) {
      if (
        (error instanceof CandidateQueueAuthorizationError && error.code === 'configuration') ||
        (error instanceof CandidatePromotionAuthorizationError && error.code === 'configuration')
      ) {
        return jsonResponse(503, { error: 'existing_target_link_unavailable' });
      }
      if (
        error instanceof CandidatePromotionAuthorizationError &&
        error.code === 'invalid_request_id'
      ) {
        return jsonResponse(400, { error: 'existing_target_link_invalid_request' });
      }
      return jsonResponse(403, { error: 'existing_target_link_denied' });
    }

    const candidateId = readCandidateId(pagesContext.params);
    if (candidateId === null) {
      return jsonResponse(400, { error: 'existing_target_link_invalid_request' });
    }

    let body: unknown;
    try {
      body = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'existing_target_link_invalid_request' });
    }
    const bodyResult = existingTargetEditorRequestSchema.safeParse(body);
    if (!bodyResult.success) {
      return jsonResponse(400, { error: 'existing_target_link_invalid_request' });
    }

    const linkedAt = now();
    try {
      const workspace = await loadWorkspace(
        readContext,
        candidateId,
        pagesContext.env,
        linkedAt,
      );
      if (
        !workspace.eligible ||
        workspace.detail.candidate.candidateType !== bodyResult.data.expectedCandidateType ||
        workspace.detail.candidate.updatedAt !== bodyResult.data.expectedCandidateUpdatedAt ||
        !exactSourceSet(workspace, bodyResult.data)
      ) {
        return jsonResponse(409, { error: 'existing_target_link_conflict' });
      }
      return jsonResponse(
        200,
        await commitLink(
          candidateId,
          pagesContext.env,
          mutationContext,
          bodyResult.data,
          linkedAt,
        ),
      );
    } catch (error) {
      if (error instanceof CandidatePromotionWorkspaceError) {
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'existing_target_link_not_found' });
        }
        if (error.code === 'invalid_candidate_id') {
          return jsonResponse(400, { error: 'existing_target_link_invalid_request' });
        }
      }
      if (error instanceof CandidatePromotionError) {
        if (error.code === 'invalid_promotion') {
          return jsonResponse(400, { error: 'existing_target_link_invalid_request' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'existing_target_link_not_found' });
        }
        if (error.code === 'conflict') {
          return jsonResponse(409, { error: 'existing_target_link_conflict' });
        }
      }
      return jsonResponse(503, { error: 'existing_target_link_unavailable' });
    }
  };
}

export const onRequestPost = createExistingTargetLinkHandler();
