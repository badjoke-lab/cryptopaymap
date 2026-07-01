import { z } from 'zod';
import { withAdminSecurityHeaders } from '../../../../../src/admin/access/config';
import {
  CandidateQueueAuthorizationError,
  authorizeCandidateQueueRead,
  readCandidateQueueAuthorizationPolicy,
  type CandidateQueueAuthorizationEnvironment,
} from '../../../../../src/admin/candidates/authorization';
import { createDrizzleCandidateDetailBackend } from '../../../../../src/admin/candidates/drizzle-candidate-detail-backend';
import { createDrizzleCanonicalTargetSearchBackend } from '../../../../../src/admin/promotion/drizzle-target-search-backend';
import {
  CandidateCanonicalTargetSearchError,
  canonicalTargetSearchQuerySchema,
  searchCandidateCanonicalTargets,
  type CandidateCanonicalTargetSearchResponse,
} from '../../../../../src/admin/promotion/target-selection';
import { readProtectedAdminIdentity } from '../../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../../src/schemas/environment';

interface CanonicalTargetSearchEnvironment extends CandidateQueueAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface CanonicalTargetSearchPagesContext {
  request: Request;
  env: CanonicalTargetSearchEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type TargetSearchLoader = (
  context: ReturnType<typeof authorizeCandidateQueueRead>,
  candidateId: string,
  query: string,
  limit: number,
  environment: CanonicalTargetSearchEnvironment,
  asOf: Date,
) => Promise<CandidateCanonicalTargetSearchResponse>;

export interface CanonicalTargetSearchHandlerDependencies {
  searchTargets?: TargetSearchLoader;
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

function databaseUrl(environment: CanonicalTargetSearchEnvironment): string {
  const result = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!result.success) throw new Error('Canonical target search database is unavailable.');
  return result.data.DATABASE_URL;
}

async function searchTargetsFromDatabase(
  context: ReturnType<typeof authorizeCandidateQueueRead>,
  candidateId: string,
  query: string,
  limit: number,
  environment: CanonicalTargetSearchEnvironment,
  asOf: Date,
): Promise<CandidateCanonicalTargetSearchResponse> {
  const database = createDatabase(databaseUrl(environment));
  return searchCandidateCanonicalTargets(
    context,
    createDrizzleCandidateDetailBackend(database),
    createDrizzleCanonicalTargetSearchBackend(database),
    candidateId,
    { query, limit },
    asOf,
  );
}

export function createCanonicalTargetSearchHandler(
  dependencies: CanonicalTargetSearchHandlerDependencies = {},
) {
  const searchTargets = dependencies.searchTargets ?? searchTargetsFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async function get(pagesContext: CanonicalTargetSearchPagesContext): Promise<Response> {
    let readContext: ReturnType<typeof authorizeCandidateQueueRead>;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      readContext = authorizeCandidateQueueRead(
        identity,
        readCandidateQueueAuthorizationPolicy(pagesContext.env),
      );
    } catch (error) {
      if (error instanceof CandidateQueueAuthorizationError && error.code === 'configuration') {
        return jsonResponse(503, { error: 'canonical_target_search_unavailable' });
      }
      return jsonResponse(403, { error: 'canonical_target_search_denied' });
    }

    const candidateId = readCandidateId(pagesContext.params);
    const url = new URL(pagesContext.request.url);
    const queryResult = canonicalTargetSearchQuerySchema.safeParse({
      query: url.searchParams.get('q') ?? '',
      limit: Number(url.searchParams.get('limit') ?? '10'),
    });
    if (candidateId === null || !queryResult.success) {
      return jsonResponse(400, { error: 'canonical_target_search_invalid_request' });
    }

    try {
      return jsonResponse(
        200,
        await searchTargets(
          readContext,
          candidateId,
          queryResult.data.query,
          queryResult.data.limit,
          pagesContext.env,
          now(),
        ),
      );
    } catch (error) {
      if (error instanceof CandidateCanonicalTargetSearchError) {
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'canonical_target_search_not_found' });
        }
        if (
          error.code === 'invalid_candidate_id' ||
          error.code === 'invalid_query'
        ) {
          return jsonResponse(400, { error: 'canonical_target_search_invalid_request' });
        }
        if (error.code === 'candidate_not_eligible') {
          return jsonResponse(409, { error: 'canonical_target_search_conflict' });
        }
      }
      return jsonResponse(503, { error: 'canonical_target_search_unavailable' });
    }
  };
}

export const onRequestGet = createCanonicalTargetSearchHandler();
