import { z } from 'zod';
import {
  protectedReconfirmationDetailResponseSchema,
  protectedReconfirmationQueueQuerySchema,
  protectedReconfirmationQueueResponseSchema,
  reconfirmationReadContextSchema,
  type ProtectedReconfirmationDetailResponse,
  type ProtectedReconfirmationQueueQuery,
  type ProtectedReconfirmationQueueResponse,
  type ProtectedReconfirmationWorkspaceBackend,
  type ReconfirmationReadContext,
} from './protected-contract';

export type ReconfirmationWorkspaceErrorCode =
  | 'unauthorized'
  | 'invalid_query'
  | 'invalid_claim_id'
  | 'not_found'
  | 'backend_failure';

export class ReconfirmationWorkspaceError extends Error {
  readonly code: ReconfirmationWorkspaceErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: ReconfirmationWorkspaceErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ReconfirmationWorkspaceError';
    this.code = code;
    this.issues = issues;
  }
}

function authorize(context: ReconfirmationReadContext) {
  const result = reconfirmationReadContextSchema.safeParse(context);
  if (!result.success || !context.capabilities.includes('claim:recheck')) {
    throw new ReconfirmationWorkspaceError(
      'unauthorized',
      'The actor is not authorized to read reconfirmation data.',
      result.success
        ? []
        : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
}

export function parseProtectedReconfirmationQueueQuery(
  url: URL,
): ProtectedReconfirmationQueueQuery {
  const result = protectedReconfirmationQueueQuerySchema.safeParse({
    dueSoonDays: url.searchParams.get('dueSoonDays') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!result.success) {
    throw new ReconfirmationWorkspaceError(
      'invalid_query',
      'The reconfirmation queue query is invalid.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}

export async function loadProtectedReconfirmationQueue(
  context: ReconfirmationReadContext,
  backend: ProtectedReconfirmationWorkspaceBackend,
  query: ProtectedReconfirmationQueueQuery,
  asOf: Date,
): Promise<ProtectedReconfirmationQueueResponse> {
  authorize(context);
  try {
    const result = await backend.loadQueue(query, asOf);
    return protectedReconfirmationQueueResponseSchema.parse({
      generatedAt: asOf.toISOString(),
      query,
      items: result.items,
      hasMore: result.hasMore,
    });
  } catch (error) {
    if (error instanceof ReconfirmationWorkspaceError) throw error;
    throw new ReconfirmationWorkspaceError(
      'backend_failure',
      'The reconfirmation queue could not be loaded.',
      [],
      { cause: error },
    );
  }
}

export async function loadProtectedReconfirmationDetail(
  context: ReconfirmationReadContext,
  backend: ProtectedReconfirmationWorkspaceBackend,
  claimId: string,
  asOf: Date,
  dueSoonDays = 30,
): Promise<ProtectedReconfirmationDetailResponse> {
  authorize(context);
  const idResult = z.uuid().safeParse(claimId);
  if (!idResult.success) {
    throw new ReconfirmationWorkspaceError('invalid_claim_id', 'The Claim identifier is invalid.');
  }
  try {
    const detail = await backend.loadDetail(idResult.data, asOf, dueSoonDays);
    if (detail === null) {
      throw new ReconfirmationWorkspaceError('not_found', 'The Claim record was not found.');
    }
    return protectedReconfirmationDetailResponseSchema.parse(detail);
  } catch (error) {
    if (error instanceof ReconfirmationWorkspaceError) throw error;
    throw new ReconfirmationWorkspaceError(
      'backend_failure',
      'The reconfirmation detail could not be loaded.',
      [],
      { cause: error },
    );
  }
}

export type {
  ProtectedReconfirmationDetailResponse,
  ProtectedReconfirmationQueueItem,
  ProtectedReconfirmationQueueQuery,
  ProtectedReconfirmationQueueResponse,
  ProtectedReconfirmationWorkspaceBackend,
  ReconfirmationReadContext,
} from './protected-contract';
export {
  protectedReconfirmationDetailResponseSchema,
  protectedReconfirmationQueueItemSchema,
  protectedReconfirmationQueueQuerySchema,
  protectedReconfirmationQueueResponseSchema,
  reconfirmationReadContextSchema,
} from './protected-contract';
