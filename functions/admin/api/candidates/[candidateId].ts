import { withAdminSecurityHeaders } from '../../../../src/admin/access/config';
import {
  CandidateQueueAuthorizationError,
  authorizeCandidateQueueRead,
  readCandidateQueueAuthorizationPolicy,
  type CandidateQueueAuthorizationEnvironment,
} from '../../../../src/admin/candidates/authorization';
import {
  CandidateDetailError,
  loadCandidateDetail,
  type CandidateDetailContext,
  type CandidateDetailResponse,
} from '../../../../src/admin/candidates/detail';
import { createDrizzleCandidateDetailBackend } from '../../../../src/admin/candidates/drizzle-candidate-detail-backend';
import { readProtectedAdminIdentity } from '../../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../src/schemas/environment';

interface CandidateDetailEnvironment extends CandidateQueueAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface CandidateDetailPagesContext {
  request: Request;
  env: CandidateDetailEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type CandidateDetailLoader = (
  context: CandidateDetailContext,
  candidateId: string,
  environment: CandidateDetailEnvironment,
  asOf: Date,
) => Promise<CandidateDetailResponse>;

export interface CandidateDetailHandlerDependencies {
  loadDetail?: CandidateDetailLoader;
  now?: () => Date;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return withAdminSecurityHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    }),
  );
}

async function loadCandidateDetailFromDatabase(
  context: CandidateDetailContext,
  candidateId: string,
  environment: CandidateDetailEnvironment,
  asOf: Date,
): Promise<CandidateDetailResponse> {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new CandidateDetailError(
      'backend_failure',
      'The Candidate detail database is unavailable.',
    );
  }

  return loadCandidateDetail(
    context,
    createDrizzleCandidateDetailBackend(createDatabase(databaseEnvironment.data.DATABASE_URL)),
    candidateId,
    asOf,
  );
}

export function createCandidateDetailHandler(
  dependencies: CandidateDetailHandlerDependencies = {},
) {
  const detailLoader = dependencies.loadDetail ?? loadCandidateDetailFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: CandidateDetailPagesContext): Promise<Response> => {
    let candidateContext: CandidateDetailContext;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readCandidateQueueAuthorizationPolicy(pagesContext.env);
      candidateContext = authorizeCandidateQueueRead(identity, policy);
    } catch (error) {
      if (
        error instanceof CandidateQueueAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'candidate_detail_unavailable' });
      }
      return jsonResponse(403, { error: 'candidate_detail_denied' });
    }

    const candidateId = pagesContext.params.candidateId;
    if (typeof candidateId !== 'string') {
      return jsonResponse(400, { error: 'candidate_detail_invalid_id' });
    }

    try {
      const detail = await detailLoader(candidateContext, candidateId, pagesContext.env, now());
      return jsonResponse(200, detail);
    } catch (error) {
      if (error instanceof CandidateDetailError) {
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'candidate_detail_denied' });
        }
        if (error.code === 'invalid_candidate_id') {
          return jsonResponse(400, { error: 'candidate_detail_invalid_id' });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'candidate_detail_not_found' });
        }
      }
      return jsonResponse(503, { error: 'candidate_detail_unavailable' });
    }
  };
}

export const onRequestGet = createCandidateDetailHandler();
