import { z } from 'zod';
import { withAdminSecurityHeaders } from '../../../../src/admin/access/config';
import {
  CandidateQueueAuthorizationError,
  authorizeCandidateQueueRead,
  readCandidateQueueAuthorizationPolicy,
  type CandidateQueueAuthorizationEnvironment,
} from '../../../../src/admin/candidates/authorization';
import { createDrizzleCandidateDetailBackend } from '../../../../src/admin/candidates/drizzle-candidate-detail-backend';
import {
  CandidatePromotionAuthorizationError,
  authorizeCandidatePromotion,
  readCandidatePromotionAuthorizationPolicy,
  type CandidatePromotionAuthorizationEnvironment,
} from '../../../../src/admin/promotion/authorization';
import {
  CandidatePromotionError,
  createCandidatePromotionService,
  type CandidatePromotionMutationContext,
  type CandidatePromotionReceipt,
} from '../../../../src/admin/promotion/candidate-promotion';
import { createDrizzleCandidatePromotionBackend } from '../../../../src/admin/promotion/drizzle-candidate-promotion-backend';
import { createDrizzlePromotionRegistryBackend } from '../../../../src/admin/promotion/drizzle-promotion-registry-backend';
import {
  CandidatePromotionWorkspaceError,
  candidatePromotionEditorRequestSchema,
  loadCandidatePromotionWorkspace,
  type CandidatePromotionEditorRequest,
  type CandidatePromotionWorkspaceResponse,
} from '../../../../src/admin/promotion/workspace';
import { readProtectedAdminIdentity } from '../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../src/schemas/environment';

interface CandidatePromotionEnvironment
  extends CandidateQueueAuthorizationEnvironment,
    CandidatePromotionAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface CandidatePromotionPagesContext {
  request: Request;
  env: CandidatePromotionEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type PromotionWorkspaceLoader = (
  context: ReturnType<typeof authorizeCandidateQueueRead>,
  candidateId: string,
  environment: CandidatePromotionEnvironment,
  asOf: Date,
) => Promise<CandidatePromotionWorkspaceResponse>;

type PromotionCommitter = (
  candidateId: string,
  environment: CandidatePromotionEnvironment,
  context: CandidatePromotionMutationContext,
  body: CandidatePromotionEditorRequest,
  promotedAt: Date,
) => Promise<CandidatePromotionReceipt>;

export interface CandidatePromotionHandlerDependencies {
  loadWorkspace?: PromotionWorkspaceLoader;
  commitPromotion?: PromotionCommitter;
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

function databaseUrl(environment: CandidatePromotionEnvironment): string {
  const result = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!result.success) throw new Error('Candidate promotion database is unavailable.');
  return result.data.DATABASE_URL;
}

async function loadWorkspaceFromDatabase(
  context: ReturnType<typeof authorizeCandidateQueueRead>,
  candidateId: string,
  environment: CandidatePromotionEnvironment,
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

async function commitPromotionToDatabase(
  candidateId: string,
  environment: CandidatePromotionEnvironment,
  context: CandidatePromotionMutationContext,
  body: CandidatePromotionEditorRequest,
  promotedAt: Date,
): Promise<CandidatePromotionReceipt> {
  return createCandidatePromotionService(
    createDrizzleCandidatePromotionBackend(createDatabase(databaseUrl(environment))),
  ).promote(context, {
    candidateId,
    ...body,
    promotedAt: promotedAt.toISOString(),
  });
}

function exactSourceSet(workspace: CandidatePromotionWorkspaceResponse, body: CandidatePromotionEditorRequest) {
  const current = workspace.detail.sources.map((source) => source.id).sort();
  const expected = [...body.sourceRecordIds].sort();
  return JSON.stringify(current) === JSON.stringify(expected);
}

export function createCandidatePromotionHandlers(
  dependencies: CandidatePromotionHandlerDependencies = {},
) {
  const loadWorkspace = dependencies.loadWorkspace ?? loadWorkspaceFromDatabase;
  const commitPromotion = dependencies.commitPromotion ?? commitPromotionToDatabase;
  const now = dependencies.now ?? (() => new Date());

  return {
    async get(pagesContext: CandidatePromotionPagesContext): Promise<Response> {
      let readContext: ReturnType<typeof authorizeCandidateQueueRead>;
      try {
        const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
        readContext = authorizeCandidateQueueRead(
          identity,
          readCandidateQueueAuthorizationPolicy(pagesContext.env),
        );
      } catch (error) {
        if (error instanceof CandidateQueueAuthorizationError && error.code === 'configuration') {
          return jsonResponse(503, { error: 'candidate_promotion_unavailable' });
        }
        return jsonResponse(403, { error: 'candidate_promotion_denied' });
      }

      const candidateId = readCandidateId(pagesContext.params);
      if (candidateId === null) {
        return jsonResponse(400, { error: 'candidate_promotion_invalid_request' });
      }

      try {
        return jsonResponse(
          200,
          await loadWorkspace(readContext, candidateId, pagesContext.env, now()),
        );
      } catch (error) {
        if (error instanceof CandidatePromotionWorkspaceError) {
          if (error.code === 'not_found') {
            return jsonResponse(404, { error: 'candidate_promotion_not_found' });
          }
          if (error.code === 'invalid_candidate_id') {
            return jsonResponse(400, { error: 'candidate_promotion_invalid_request' });
          }
        }
        return jsonResponse(503, { error: 'candidate_promotion_unavailable' });
      }
    },

    async post(pagesContext: CandidatePromotionPagesContext): Promise<Response> {
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
          return jsonResponse(503, { error: 'candidate_promotion_unavailable' });
        }
        if (
          error instanceof CandidatePromotionAuthorizationError &&
          error.code === 'invalid_request_id'
        ) {
          return jsonResponse(400, { error: 'candidate_promotion_invalid_request' });
        }
        return jsonResponse(403, { error: 'candidate_promotion_denied' });
      }

      const candidateId = readCandidateId(pagesContext.params);
      if (candidateId === null) {
        return jsonResponse(400, { error: 'candidate_promotion_invalid_request' });
      }

      let body: unknown;
      try {
        body = await pagesContext.request.json();
      } catch {
        return jsonResponse(400, { error: 'candidate_promotion_invalid_request' });
      }
      const bodyResult = candidatePromotionEditorRequestSchema.safeParse(body);
      if (!bodyResult.success) {
        return jsonResponse(400, { error: 'candidate_promotion_invalid_request' });
      }

      const promotedAt = now();
      try {
        const workspace = await loadWorkspace(
          readContext,
          candidateId,
          pagesContext.env,
          promotedAt,
        );
        if (
          !workspace.eligible ||
          workspace.detail.candidate.candidateType !== bodyResult.data.expectedCandidateType ||
          workspace.detail.candidate.updatedAt !== bodyResult.data.expectedCandidateUpdatedAt ||
          !exactSourceSet(workspace, bodyResult.data)
        ) {
          return jsonResponse(409, { error: 'candidate_promotion_conflict' });
        }
        return jsonResponse(
          200,
          await commitPromotion(
            candidateId,
            pagesContext.env,
            mutationContext,
            bodyResult.data,
            promotedAt,
          ),
        );
      } catch (error) {
        if (error instanceof CandidatePromotionWorkspaceError) {
          if (error.code === 'not_found') {
            return jsonResponse(404, { error: 'candidate_promotion_not_found' });
          }
          if (error.code === 'invalid_candidate_id') {
            return jsonResponse(400, { error: 'candidate_promotion_invalid_request' });
          }
        }
        if (error instanceof CandidatePromotionError) {
          if (error.code === 'invalid_promotion') {
            return jsonResponse(400, { error: 'candidate_promotion_invalid_request' });
          }
          if (error.code === 'not_found') {
            return jsonResponse(404, { error: 'candidate_promotion_not_found' });
          }
          if (error.code === 'conflict') {
            return jsonResponse(409, { error: 'candidate_promotion_conflict' });
          }
        }
        return jsonResponse(503, { error: 'candidate_promotion_unavailable' });
      }
    },
  };
}

const handlers = createCandidatePromotionHandlers();
export const onRequestGet = handlers.get;
export const onRequestPost = handlers.post;
