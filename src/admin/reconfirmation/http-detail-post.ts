import {
  ReconfirmationAuthorizationError,
  authorizeReconfirmationExpiration,
  readReconfirmationAuthorizationPolicy,
} from './authorization';
import {
  ReconfirmationExpirationError,
  type ReconfirmationExpirationContext,
  type ReconfirmationExpirationInput,
  type ReconfirmationExpirationReceipt,
} from './expiration';
import { readProtectedAdminIdentity } from '../dashboard/identity-context';
import { claimIdFromContext, jsonResponse, type ReconfirmationPagesContext } from './http-common';
import { writeStaleTransition } from './stale-transition-writer';

export interface ReconfirmationDetailPostDependencies {
  writeTransition?: typeof writeStaleTransition;
  now?: () => Date;
}

export function createReconfirmationDetailPostHandler(
  dependencies: ReconfirmationDetailPostDependencies = {},
) {
  const writeTransition = dependencies.writeTransition ?? writeStaleTransition;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: ReconfirmationPagesContext): Promise<Response> => {
    let context: ReconfirmationExpirationContext;
    try {
      context = authorizeReconfirmationExpiration(
        readProtectedAdminIdentity(pagesContext.data.adminIdentity),
        readReconfirmationAuthorizationPolicy(pagesContext.env),
        pagesContext.request.headers.get('Idempotency-Key'),
      );
    } catch (error) {
      if (error instanceof ReconfirmationAuthorizationError) {
        if (error.code === 'configuration') {
          return jsonResponse(503, { error: 'reconfirmation_transition_unavailable' });
        }
        if (error.code === 'invalid_request_id') {
          return jsonResponse(400, { error: 'reconfirmation_transition_invalid_request_id' });
        }
      }
      return jsonResponse(403, { error: 'reconfirmation_transition_denied' });
    }

    const claimId = claimIdFromContext(pagesContext);
    if (claimId === null) {
      return jsonResponse(400, { error: 'reconfirmation_transition_invalid_id' });
    }

    let body: unknown;
    try {
      body = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'reconfirmation_transition_invalid_json' });
    }
    const fields =
      body !== null && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const input = {
      ...fields,
      claimId,
      effectiveAt: now().toISOString(),
      reasonCode: 'review_window_expired',
    } as ReconfirmationExpirationInput;

    try {
      const receipt: ReconfirmationExpirationReceipt = await writeTransition(
        context,
        claimId,
        input,
        pagesContext.env,
      );
      return jsonResponse(200, receipt);
    } catch (error) {
      if (error instanceof ReconfirmationExpirationError) {
        if (error.code === 'invalid_expiration') {
          return jsonResponse(400, {
            error: 'reconfirmation_transition_invalid',
            issues: [...error.issues],
          });
        }
        if (error.code === 'not_found') {
          return jsonResponse(404, { error: 'reconfirmation_transition_not_found' });
        }
        if (error.code === 'conflict') {
          return jsonResponse(409, {
            error: 'reconfirmation_transition_conflict',
            issues: [...error.issues],
          });
        }
        if (error.code === 'unauthorized') {
          return jsonResponse(403, { error: 'reconfirmation_transition_denied' });
        }
      }
      return jsonResponse(503, { error: 'reconfirmation_transition_unavailable' });
    }
  };
}
