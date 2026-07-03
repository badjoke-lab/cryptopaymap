import { withAdminSecurityHeaders } from '../../../src/admin/access/config';
import {
  MediaReviewAuthorizationError,
  authorizeMediaReview,
  readMediaReviewAuthorizationPolicy,
} from '../../../src/admin/media-review/authorization';
import {
  MediaReviewDecisionError,
  type MediaReviewDecisionReceipt,
  type MediaReviewMutationContext,
} from '../../../src/admin/media-review/decision';
import {
  type MediaDecisionEnvironment,
  writeMediaDecision,
} from '../../../src/admin/media-review/http-decision-writer';
import { MediaStorageError } from '../../../src/admin/media-review/storage-contract';
import { readProtectedAdminIdentity } from '../../../src/admin/dashboard/identity-context';

interface MediaDecisionPagesContext {
  request: Request;
  env: MediaDecisionEnvironment;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
}

type DecisionWriter = (
  context: MediaReviewMutationContext,
  mediaAssetId: string,
  body: unknown,
  environment: MediaDecisionEnvironment,
  decidedAt: Date,
) => Promise<MediaReviewDecisionReceipt>;

export interface MediaDecisionHandlerDependencies {
  writeDecision?: DecisionWriter;
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

function decisionErrorResponse(error: unknown): Response {
  if (error instanceof MediaReviewDecisionError) {
    if (error.code === 'unauthorized') {
      return jsonResponse(403, { error: 'media_decision_denied' });
    }
    if (error.code === 'invalid_decision') {
      return jsonResponse(400, {
        error: 'media_decision_invalid',
        issues: [...error.issues],
      });
    }
    if (error.code === 'not_found') {
      return jsonResponse(404, { error: 'media_decision_not_found' });
    }
    if (error.code === 'conflict') {
      return jsonResponse(409, {
        error: 'media_decision_conflict',
        issues: [...error.issues],
      });
    }
  }
  if (error instanceof MediaStorageError) {
    if (['source_missing', 'source_mismatch'].includes(error.code)) {
      return jsonResponse(409, { error: 'media_storage_conflict' });
    }
    if (error.code === 'invalid_plan') {
      return jsonResponse(503, { error: 'media_storage_unavailable' });
    }
  }
  return jsonResponse(503, { error: 'media_decision_unavailable' });
}

export function createMediaDecisionPostHandler(
  dependencies: MediaDecisionHandlerDependencies = {},
) {
  const decisionWriter = dependencies.writeDecision ?? writeMediaDecision;
  const now = dependencies.now ?? (() => new Date());

  return async (pagesContext: MediaDecisionPagesContext): Promise<Response> => {
    let context: MediaReviewMutationContext;
    try {
      const identity = readProtectedAdminIdentity(pagesContext.data.adminIdentity);
      context = authorizeMediaReview(
        identity,
        readMediaReviewAuthorizationPolicy(pagesContext.env),
        pagesContext.request.headers.get('Idempotency-Key'),
      );
    } catch (error) {
      if (
        error instanceof MediaReviewAuthorizationError &&
        error.code === 'configuration'
      ) {
        return jsonResponse(503, { error: 'media_decision_unavailable' });
      }
      if (
        error instanceof MediaReviewAuthorizationError &&
        error.code === 'invalid_request_id'
      ) {
        return jsonResponse(400, { error: 'media_decision_invalid_request_id' });
      }
      return jsonResponse(403, { error: 'media_decision_denied' });
    }

    const mediaAssetId = new URL(pagesContext.request.url).searchParams.get('mediaAssetId');
    if (mediaAssetId === null) {
      return jsonResponse(400, { error: 'media_decision_invalid_id' });
    }

    let body: unknown;
    try {
      body = await pagesContext.request.json();
    } catch {
      return jsonResponse(400, { error: 'media_decision_invalid_json' });
    }

    try {
      return jsonResponse(
        200,
        await decisionWriter(context, mediaAssetId, body, pagesContext.env, now()),
      );
    } catch (error) {
      return decisionErrorResponse(error);
    }
  };
}

export const onRequestPost = createMediaDecisionPostHandler();
