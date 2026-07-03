import { readProtectedAdminIdentity } from '../dashboard/identity-context';
import { createDatabase } from '../../db/client';
import {
  ReconfirmationAuthorizationError,
  authorizeReconfirmationRead,
  readReconfirmationAuthorizationPolicy,
} from './authorization';
import { createDrizzleProtectedReconfirmationWorkspaceBackend } from './drizzle-protected-workspace-backend';
import { claimIdFromContext, databaseUrl, jsonResponse, type ReconfirmationPagesContext } from './http-common';
import {
  ReconfirmationWorkspaceError,
  loadProtectedReconfirmationDetail,
  type ProtectedReconfirmationDetailResponse,
  type ReconfirmationReadContext,
} from './protected-workspace';

type DetailLoader = (
  context: ReconfirmationReadContext,
  claimId: string,
  environment: ReconfirmationPagesContext['env'],
  asOf: Date,
) => Promise<ProtectedReconfirmationDetailResponse>;

export interface ReconfirmationDetailGetDependencies {
  loadDetail?: DetailLoader;
  now?: () => Date;
}

export function createReconfirmationDetailGetHandler(
  dependencies: ReconfirmationDetailGetDependencies = {},
) {
  const now = dependencies.now ?? (() => new Date());
  const loadDetail =
    dependencies.loadDetail ??
    ((context, claimId, environment, asOf) =>
      loadProtectedReconfirmationDetail(
        context,
        createDrizzleProtectedReconfirmationWorkspaceBackend(
          createDatabase(databaseUrl(environment)),
        ),
        claimId,
        asOf,
      ));

  return async (pagesContext: ReconfirmationPagesContext): Promise<Response> => {
    let context: ReconfirmationReadContext;
    try {
      context = authorizeReconfirmationRead(
        readProtectedAdminIdentity(pagesContext.data.adminIdentity),
        readReconfirmationAuthorizationPolicy(pagesContext.env),
      );
    } catch (error) {
      if (error instanceof ReconfirmationAuthorizationError && error.code === 'configuration') {
        return jsonResponse(503, { error: 'reconfirmation_detail_unavailable' });
      }
      return jsonResponse(403, { error: 'reconfirmation_detail_denied' });
    }

    const claimId = claimIdFromContext(pagesContext);
    if (claimId === null) return jsonResponse(400, { error: 'reconfirmation_detail_invalid_id' });
    try {
      return jsonResponse(200, await loadDetail(context, claimId, pagesContext.env, now()));
    } catch (error) {
      if (error instanceof ReconfirmationWorkspaceError) {
        if (error.code === 'invalid_claim_id') return jsonResponse(400, { error: 'reconfirmation_detail_invalid_id' });
        if (error.code === 'not_found') return jsonResponse(404, { error: 'reconfirmation_detail_not_found' });
        if (error.code === 'unauthorized') return jsonResponse(403, { error: 'reconfirmation_detail_denied' });
      }
      return jsonResponse(503, { error: 'reconfirmation_detail_unavailable' });
    }
  };
}
