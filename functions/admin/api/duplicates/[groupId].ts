import { z } from 'zod';
import { withAdminSecurityHeaders } from '../../../../src/admin/access/config';
import {
  CandidateQueueAuthorizationError,
  authorizeCandidateQueueRead,
  readCandidateQueueAuthorizationPolicy,
  type CandidateQueueAuthorizationEnvironment,
} from '../../../../src/admin/candidates/authorization';
import {
  CandidateDuplicateAuthorizationError,
  authorizeCandidateDuplicateResolve,
  readCandidateDuplicateAuthorizationPolicy,
  type CandidateDuplicateAuthorizationEnvironment,
} from '../../../../src/admin/candidates/duplicate-authorization';
import {
  CandidateDuplicateDecisionError,
  createCandidateDuplicateDecisionService,
  type CandidateDuplicateDecisionReceipt,
} from '../../../../src/admin/candidates/duplicate-decision';
import {
  CandidateDuplicateReviewError,
  loadCandidateDuplicateReview,
  type CandidateDuplicateReviewResponse,
} from '../../../../src/admin/candidates/duplicate-review';
import { createDrizzleDuplicateDecisionBackend } from '../../../../src/admin/candidates/drizzle-duplicate-decision-backend';
import { createDrizzleDuplicateReviewBackend } from '../../../../src/admin/candidates/drizzle-duplicate-review-backend';
import { readProtectedAdminIdentity } from '../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../src/schemas/environment';

interface DuplicateReviewEnvironment
  extends CandidateQueueAuthorizationEnvironment,
    CandidateDuplicateAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface DuplicateReviewPagesContext {
  request: Request;
  env: DuplicateReviewEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

const duplicateDecisionRequestSchema = z
  .object({
    action: z.enum(['confirm_duplicate', 'dismiss_signal']),
    primaryCandidateId: z.uuid().nullable(),
    memberCandidateIds: z.array(z.uuid()).min(2).max(50),
    reasonCode: z.enum([
      'same_osm_identity',
      'same_physical_location',
      'same_official_domain',
      'same_online_service',
      'manual_match',
      'different_location',
      'different_business',
      'different_service',
      'insufficient_evidence',
      'stale_signal',
      'other',
    ]),
    note: z.string().trim().min(1).max(2_000).nullable().default(null),
    expectedGroupUpdatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

type DuplicateReviewLoader = (
  groupId: string,
  environment: DuplicateReviewEnvironment,
  actorId: string,
  actorType: 'human' | 'system',
  asOf: Date,
) => Promise<CandidateDuplicateReviewResponse>;

type DuplicateDecisionLoader = (
  groupId: string,
  environment: DuplicateReviewEnvironment,
  context: ReturnType<typeof authorizeCandidateDuplicateResolve>,
  body: z.infer<typeof duplicateDecisionRequestSchema>,
  decidedAt: Date,
) => Promise<CandidateDuplicateDecisionReceipt>;

export interface DuplicateReviewHandlerDependencies {
  loadReview?: DuplicateReviewLoader;
  commitDecision?: DuplicateDecisionLoader;
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

function readGroupId(params: Record<string, string | string[]>): string | null {
  return typeof params.groupId === 'string' ? params.groupId : null;
}

function databaseUrl(environment: DuplicateReviewEnvironment): string {
  const result = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!result.success) throw new Error('Duplicate review database is unavailable.');
  return result.data.DATABASE_URL;
}

async function loadReviewFromDatabase(
  groupId: string,
  environment: DuplicateReviewEnvironment,
  actorId: string,
  actorType: 'human' | 'system',
  asOf: Date,
): Promise<CandidateDuplicateReviewResponse> {
  return loadCandidateDuplicateReview(
    { actorId, actorType, capabilities: ['candidate:read'] },
    createDrizzleDuplicateReviewBackend(createDatabase(databaseUrl(environment))),
    groupId,
    asOf,
  );
}

async function commitDecisionToDatabase(
  groupId: string,
  environment: DuplicateReviewEnvironment,
  context: ReturnType<typeof authorizeCandidateDuplicateResolve>,
  body: z.infer<typeof duplicateDecisionRequestSchema>,
  decidedAt: Date,
): Promise<CandidateDuplicateDecisionReceipt> {
  return createCandidateDuplicateDecisionService(
    createDrizzleDuplicateDecisionBackend(createDatabase(databaseUrl(environment))),
  ).decide(context, {
    duplicateGroupId: groupId,
    ...body,
    decidedAt: decidedAt.toISOString(),
  });
}

export function createDuplicateReviewHandlers(
  dependencies: DuplicateReviewHandlerDependencies = {},
) {
  const loadReview = dependencies.loadReview ?? loadReviewFromDatabase;
  const commitDecision = dependencies.commitDecision ?? commitDecisionToDatabase;
  const now = dependencies.now ?? (() => new Date());

  return {
    async get(pagesContext: DuplicateReviewPagesContext): Promise<Response> {
      let reviewContext: ReturnType<typeof authorizeCandidateQueueRead>;
      try {
        const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
        reviewContext = authorizeCandidateQueueRead(
          identity,
          readCandidateQueueAuthorizationPolicy(pagesContext.env),
        );
      } catch (error) {
        if (error instanceof CandidateQueueAuthorizationError && error.code === 'configuration') {
          return jsonResponse(503, { error: 'duplicate_review_unavailable' });
        }
        return jsonResponse(403, { error: 'duplicate_review_denied' });
      }

      const groupId = readGroupId(pagesContext.params);
      if (groupId === null) return jsonResponse(400, { error: 'duplicate_review_invalid_id' });

      try {
        return jsonResponse(
          200,
          await loadReview(
            groupId,
            pagesContext.env,
            reviewContext.actorId,
            reviewContext.actorType,
            now(),
          ),
        );
      } catch (error) {
        if (error instanceof CandidateDuplicateReviewError) {
          if (error.code === 'invalid_group_id') {
            return jsonResponse(400, { error: 'duplicate_review_invalid_id' });
          }
          if (error.code === 'not_found') {
            return jsonResponse(404, { error: 'duplicate_review_not_found' });
          }
        }
        return jsonResponse(503, { error: 'duplicate_review_unavailable' });
      }
    },

    async post(pagesContext: DuplicateReviewPagesContext): Promise<Response> {
      let mutationContext: ReturnType<typeof authorizeCandidateDuplicateResolve>;
      try {
        const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
        mutationContext = authorizeCandidateDuplicateResolve(
          identity,
          readCandidateDuplicateAuthorizationPolicy(pagesContext.env),
          pagesContext.request.headers.get('Idempotency-Key'),
        );
      } catch (error) {
        if (
          error instanceof CandidateDuplicateAuthorizationError &&
          error.code === 'configuration'
        ) {
          return jsonResponse(503, { error: 'duplicate_decision_unavailable' });
        }
        if (
          error instanceof CandidateDuplicateAuthorizationError &&
          error.code === 'invalid_request_id'
        ) {
          return jsonResponse(400, { error: 'duplicate_decision_invalid_request' });
        }
        return jsonResponse(403, { error: 'duplicate_decision_denied' });
      }

      const groupId = readGroupId(pagesContext.params);
      if (groupId === null || !z.uuid().safeParse(groupId).success) {
        return jsonResponse(400, { error: 'duplicate_decision_invalid_request' });
      }

      let body: unknown;
      try {
        body = await pagesContext.request.json();
      } catch {
        return jsonResponse(400, { error: 'duplicate_decision_invalid_request' });
      }
      const bodyResult = duplicateDecisionRequestSchema.safeParse(body);
      if (!bodyResult.success) {
        return jsonResponse(400, { error: 'duplicate_decision_invalid_request' });
      }

      try {
        return jsonResponse(
          200,
          await commitDecision(
            groupId,
            pagesContext.env,
            mutationContext,
            bodyResult.data,
            now(),
          ),
        );
      } catch (error) {
        if (error instanceof CandidateDuplicateDecisionError) {
          if (error.code === 'invalid_decision') {
            return jsonResponse(400, { error: 'duplicate_decision_invalid_request' });
          }
          if (error.code === 'not_found') {
            return jsonResponse(404, { error: 'duplicate_review_not_found' });
          }
          if (error.code === 'conflict') {
            return jsonResponse(409, { error: 'duplicate_decision_conflict' });
          }
        }
        return jsonResponse(503, { error: 'duplicate_decision_unavailable' });
      }
    },
  };
}

const handlers = createDuplicateReviewHandlers();
export const onRequestGet = handlers.get;
export const onRequestPost = handlers.post;
