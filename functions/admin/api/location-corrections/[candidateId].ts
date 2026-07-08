import { z } from 'zod';
import { withAdminSecurityHeaders } from '../../../../src/admin/access/config';
import { createDrizzleCandidateDetailBackend } from '../../../../src/admin/candidates/drizzle-candidate-detail-backend';
import { readProtectedAdminIdentity } from '../../../../src/admin/dashboard/identity-context';
import {
  LocationCorrectionAuthorizationError,
  authorizeLocationCorrection,
  authorizeLocationCorrectionRead,
  readLocationCorrectionAuthorizationPolicy,
  type LocationCorrectionAuthorizationEnvironment,
} from '../../../../src/admin/location-correction/authorization';
import {
  LocationCorrectionDecisionError,
  createLocationCorrectionDecisionService,
  type LocationCorrectionDecisionReceipt,
  type LocationCorrectionMutationContext,
} from '../../../../src/admin/location-correction/decision';
import { createDrizzleLocationCorrectionBackend } from '../../../../src/admin/location-correction/drizzle-backend';
import { createDrizzleLocationCorrectionWorkspaceBackend } from '../../../../src/admin/location-correction/drizzle-workspace-backend';
import {
  locationCorrectionEditorRequestSchema,
  type LocationCorrectionEditorRequest,
} from '../../../../src/admin/location-correction/editor-request';
import {
  LocationCorrectionWorkspaceError,
  loadLocationCorrectionWorkspace,
  type LocationCorrectionReadContext,
  type LocationCorrectionWorkspaceResponse,
} from '../../../../src/admin/location-correction/workspace';
import { createDatabase } from '../../../../src/db/client';
import { requiredDatabaseEnvironmentSchema } from '../../../../src/schemas/environment';

interface LocationCorrectionEnvironment extends LocationCorrectionAuthorizationEnvironment {
  DATABASE_URL?: string;
}

interface LocationCorrectionPagesContext {
  request: Request;
  env: LocationCorrectionEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type WorkspaceLoader = (
  context: LocationCorrectionReadContext,
  candidateId: string,
  locationId: string,
  environment: LocationCorrectionEnvironment,
  asOf: Date,
) => Promise<LocationCorrectionWorkspaceResponse>;

type CorrectionWriter = (
  context: LocationCorrectionMutationContext,
  locationId: string,
  body: LocationCorrectionEditorRequest,
  environment: LocationCorrectionEnvironment,
  decidedAt: Date,
) => Promise<LocationCorrectionDecisionReceipt>;

export interface LocationCorrectionHandlerDependencies {
  loadWorkspace?: WorkspaceLoader;
  writeCorrection?: CorrectionWriter;
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

function databaseUrl(environment: LocationCorrectionEnvironment): string {
  const result = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!result.success) throw new Error('Location correction database is unavailable.');
  return result.data.DATABASE_URL;
}

function candidateIdFromContext(pagesContext: LocationCorrectionPagesContext): string | null {
  const value = pagesContext.params.candidateId;
  return typeof value === 'string' && z.uuid().safeParse(value).success ? value : null;
}

function locationIdFromRequest(request: Request): string | null {
  const value = new URL(request.url).searchParams.get('locationId');
  return value !== null && z.uuid().safeParse(value).success ? value : null;
}

async function loadWorkspaceFromDatabase(
  context: LocationCorrectionReadContext,
  candidateId: string,
  locationId: string,
  environment: LocationCorrectionEnvironment,
  asOf: Date,
) {
  const database = createDatabase(databaseUrl(environment));
  return loadLocationCorrectionWorkspace(
    context,
    createDrizzleCandidateDetailBackend(database),
    createDrizzleLocationCorrectionWorkspaceBackend(database),
    candidateId,
    locationId,
    asOf,
  );
}

async function writeCorrectionToDatabase(
  context: LocationCorrectionMutationContext,
  locationId: string,
  body: LocationCorrectionEditorRequest,
  environment: LocationCorrectionEnvironment,
  decidedAt: Date,
) {
  return createLocationCorrectionDecisionService(
    createDrizzleLocationCorrectionBackend(createDatabase(databaseUrl(environment))),
  ).correct(context, {
    locationId,
    expectedLocationUpdatedAt: body.expectedLocationUpdatedAt,
    decidedAt: decidedAt.toISOString(),
    changes: body.changes,
    sourceRecordIds: body.sourceRecordIds,
    provenanceAssignments: body.provenanceAssignments,
    reasonCode: body.reasonCode,
    publicSummary: body.publicSummary,
    internalNote: body.internalNote,
  });
}

function exactSourceSet(
  workspace: LocationCorrectionWorkspaceResponse,
  body: LocationCorrectionEditorRequest,
) {
  const current = workspace.candidate.sources.map((source) => source.id).sort();
  const expected = [...body.sourceRecordIds].sort();
  return JSON.stringify(current) === JSON.stringify(expected);
}

export function createLocationCorrectionHandlers(
  dependencies: LocationCorrectionHandlerDependencies = {},
) {
  const loadWorkspace = dependencies.loadWorkspace ?? loadWorkspaceFromDatabase;
  const writeCorrection = dependencies.writeCorrection ?? writeCorrectionToDatabase;
  const now = dependencies.now ?? (() => new Date());

  return {
    async get(pagesContext: LocationCorrectionPagesContext): Promise<Response> {
      let readContext: LocationCorrectionReadContext;
      try {
        const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
        readContext = authorizeLocationCorrectionRead(
          identity,
          readLocationCorrectionAuthorizationPolicy(pagesContext.env),
        );
      } catch (error) {
        if (
          error instanceof LocationCorrectionAuthorizationError &&
          error.code === 'configuration'
        ) {
          return jsonResponse(503, { error: 'location_correction_unavailable' });
        }
        return jsonResponse(403, { error: 'location_correction_denied' });
      }

      const candidateId = candidateIdFromContext(pagesContext);
      const locationId = locationIdFromRequest(pagesContext.request);
      if (candidateId === null || locationId === null) {
        return jsonResponse(400, { error: 'location_correction_invalid_request' });
      }

      try {
        return jsonResponse(
          200,
          await loadWorkspace(readContext, candidateId, locationId, pagesContext.env, now()),
        );
      } catch (error) {
        if (error instanceof LocationCorrectionWorkspaceError) {
          if (error.code === 'not_found') {
            return jsonResponse(404, { error: 'location_correction_not_found' });
          }
          if (
            error.code === 'invalid_candidate_id' ||
            error.code === 'invalid_location_id'
          ) {
            return jsonResponse(400, { error: 'location_correction_invalid_request' });
          }
          if (error.code === 'unauthorized') {
            return jsonResponse(403, { error: 'location_correction_denied' });
          }
        }
        return jsonResponse(503, { error: 'location_correction_unavailable' });
      }
    },

    async post(pagesContext: LocationCorrectionPagesContext): Promise<Response> {
      let readContext: LocationCorrectionReadContext;
      let mutationContext: LocationCorrectionMutationContext;
      try {
        const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
        const policy = readLocationCorrectionAuthorizationPolicy(pagesContext.env);
        readContext = authorizeLocationCorrectionRead(identity, policy);
        mutationContext = authorizeLocationCorrection(
          identity,
          policy,
          pagesContext.request.headers.get('Idempotency-Key'),
        );
      } catch (error) {
        if (
          error instanceof LocationCorrectionAuthorizationError &&
          error.code === 'configuration'
        ) {
          return jsonResponse(503, { error: 'location_correction_unavailable' });
        }
        if (
          error instanceof LocationCorrectionAuthorizationError &&
          error.code === 'invalid_request_id'
        ) {
          return jsonResponse(400, { error: 'location_correction_invalid_request_id' });
        }
        return jsonResponse(403, { error: 'location_correction_denied' });
      }

      const candidateId = candidateIdFromContext(pagesContext);
      const locationId = locationIdFromRequest(pagesContext.request);
      if (candidateId === null || locationId === null) {
        return jsonResponse(400, { error: 'location_correction_invalid_request' });
      }

      let body: unknown;
      try {
        body = await pagesContext.request.json();
      } catch {
        return jsonResponse(400, { error: 'location_correction_invalid_json' });
      }
      const bodyResult = locationCorrectionEditorRequestSchema.safeParse(body);
      if (!bodyResult.success) {
        return jsonResponse(400, {
          error: 'location_correction_invalid',
          issues: bodyResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        });
      }

      const decidedAt = now();
      try {
        const workspace = await loadWorkspace(
          readContext,
          candidateId,
          locationId,
          pagesContext.env,
          decidedAt,
        );
        if (
          !workspace.eligible ||
          workspace.candidate.candidate.updatedAt !==
            bodyResult.data.expectedCandidateUpdatedAt ||
          workspace.location.updatedAt !== bodyResult.data.expectedLocationUpdatedAt ||
          !exactSourceSet(workspace, bodyResult.data)
        ) {
          return jsonResponse(409, { error: 'location_correction_conflict' });
        }

        return jsonResponse(
          200,
          await writeCorrection(
            mutationContext,
            locationId,
            bodyResult.data,
            pagesContext.env,
            decidedAt,
          ),
        );
      } catch (error) {
        if (error instanceof LocationCorrectionWorkspaceError) {
          if (error.code === 'not_found') {
            return jsonResponse(404, { error: 'location_correction_not_found' });
          }
        }
        if (error instanceof LocationCorrectionDecisionError) {
          if (error.code === 'invalid_decision') {
            return jsonResponse(400, {
              error: 'location_correction_invalid',
              issues: [...error.issues],
            });
          }
          if (error.code === 'not_found') {
            return jsonResponse(404, { error: 'location_correction_not_found' });
          }
          if (error.code === 'conflict') {
            return jsonResponse(409, {
              error: 'location_correction_conflict',
              issues: [...error.issues],
            });
          }
          if (error.code === 'unauthorized') {
            return jsonResponse(403, { error: 'location_correction_denied' });
          }
        }
        return jsonResponse(503, { error: 'location_correction_unavailable' });
      }
    },
  };
}

const handlers = createLocationCorrectionHandlers();
export const onRequestGet = handlers.get;
export const onRequestPost = handlers.post;
