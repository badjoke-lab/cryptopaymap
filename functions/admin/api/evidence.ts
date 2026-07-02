import { withAdminSecurityHeaders } from '../../../src/admin/access/config';
import {
  EvidenceReviewAuthorizationError,
  readEvidenceReviewAuthorizationPolicy,
  type EvidenceReviewAuthorizationEnvironment,
} from '../../../src/admin/evidence-review/authorization';
import { createDrizzleEvidenceReviewWorkspaceBackend } from '../../../src/admin/evidence-review/drizzle-workspace-backend';
import { authorizeEvidenceReviewRead } from '../../../src/admin/evidence-review/read-authorization';
import {
  EvidenceReviewWorkspaceError,
  loadEvidenceReviewQueue,
  parseEvidenceReviewQueueQuery,
  type EvidenceReviewQueueResponse,
  type EvidenceReviewReadContext,
} from '../../../src/admin/evidence-review/workspace';
import { readProtectedAdminIdentity } from '../../../src/admin/dashboard/identity-context';
import { createDatabase } from '../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../src/schemas/environment';

interface EvidenceQueueEnvironment extends EvidenceReviewAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface EvidenceQueuePagesContext {
  request: Request;
  env: EvidenceQueueEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type QueueLoader = (
  context: EvidenceReviewReadContext,
  requestUrl: URL,
  environment: EvidenceQueueEnvironment,
  asOf: Date,
) => Promise<EvidenceReviewQueueResponse>;

export interface EvidenceQueueHandlerDependencies {
  loadQueue?: QueueLoader;
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

async function loadQueueFromDatabase(
  context: EvidenceReviewReadContext,
  requestUrl: URL,
  environment: EvidenceQueueEnvironment,
  asOf: Date,
) {
  const databaseEnvironment = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!databaseEnvironment.success) {
    throw new EvidenceReviewWorkspaceError(
      'backend_failure',
      'The Evidence review database is unavailable.',
    );
  }
  return loadEvidenceReviewQueue(
    context,
    createDrizzleEvidenceReviewWorkspaceBackend(
      createDatabase(databaseEnvironment.data.DATABASE_URL),
    ),
    parseEvidenceReviewQueueQuery(requestUrl),
    asOf,
  );
}

export function createEvidenceQueueHandler(
  dependencies: EvidenceQueueHandlerDependencies = {},
) {
  const queueLoader = dependencies.loadQueue ?? loadQueueFromDatabase;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: EvidenceQueuePagesContext): Promise<Response> => {
    let context: EvidenceReviewReadContext;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      const policy = readEvidenceReviewAuthorizationPolicy(pagesContext.env);
      context = authorizeEvidenceReviewRead(identity, policy);
    } catch (error) {
      if (
        error instanceof EvidenceReviewAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'evidence_queue_unavailable' });
      }
      return jsonResponse(403, { error: 'evidence_queue_denied' });
    }

    try {
      const queue = await queueLoader(
        context,
        new URL(pagesContext.request.url),
        pagesContext.env,
        now(),
      );
      return jsonResponse(200, queue);
    } catch (error) {
      if (error instanceof EvidenceReviewWorkspaceError) {
        if (error.code === 'invalid_query') {
          return jsonResponse(400, { error: 'evidence_queue_invalid_query' });
        }
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'evidence_queue_denied' });
        }
      }
      return jsonResponse(503, { error: 'evidence_queue_unavailable' });
    }
  };
}

export const onRequestGet = createEvidenceQueueHandler();
