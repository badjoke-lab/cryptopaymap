import { z } from 'zod';
import {
  candidateStatusValues,
  candidateTypeValues,
  duplicateGroupStatusValues,
  sourceTypeValues,
} from '../../db/schema';

export const candidateQueueCapabilityValues = ['candidate:read'] as const;
export const candidateQueueCapabilitySchema = z.enum(candidateQueueCapabilityValues);

export const candidateQueueContextSchema = z
  .object({
    actorId: z.string().trim().min(1).max(220),
    actorType: z.enum(['human', 'system']),
    capabilities: z.array(candidateQueueCapabilitySchema).min(1),
  })
  .strict();

const candidateQueueCursorSchema = z
  .object({
    priority: z.number().int().min(-1).max(1000),
    lastSeenAt: z.iso.datetime({ offset: true }),
    id: z.uuid(),
  })
  .strict();

export const candidateQueuePriorityFilterValues = [
  'all',
  'high',
  'standard',
  'unscored',
] as const;
export const candidateQueueDuplicateFilterValues = ['all', 'flagged', 'unflagged'] as const;

export const candidateQueueQuerySchema = z
  .object({
    statuses: z.array(z.enum(candidateStatusValues)).max(candidateStatusValues.length).default(['new', 'triaged']),
    candidateTypes: z.array(z.enum(candidateTypeValues)).max(candidateTypeValues.length).default([]),
    sourceTypes: z.array(z.enum(sourceTypeValues)).max(sourceTypeValues.length).default([]),
    priority: z.enum(candidateQueuePriorityFilterValues).default('all'),
    duplicate: z.enum(candidateQueueDuplicateFilterValues).default('all'),
    limit: z.number().int().min(1).max(50).default(25),
    cursor: candidateQueueCursorSchema.nullable().default(null),
  })
  .strict();

export const candidateQueueItemSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(200),
    candidateType: z.enum(candidateTypeValues),
    status: z.enum(candidateStatusValues),
    priority: z.number().int().min(0).max(1000).nullable(),
    firstSeenAt: z.iso.datetime({ offset: true }),
    lastSeenAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    sourceTypes: z.array(z.enum(sourceTypeValues)).max(sourceTypeValues.length),
    sourceCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    duplicateSignal: z.boolean(),
    duplicateGroupStatus: z.enum(duplicateGroupStatusValues).nullable(),
    linkedToCanonical: z.boolean(),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.sourceCount < item.sourceTypes.length) {
      context.addIssue({
        code: 'custom',
        path: ['sourceCount'],
        message: 'sourceCount cannot be smaller than the number of distinct source types.',
      });
    }
    if (!item.duplicateSignal && item.duplicateGroupStatus !== null) {
      context.addIssue({
        code: 'custom',
        path: ['duplicateGroupStatus'],
        message: 'A duplicate-group status requires a duplicate signal.',
      });
    }
  });

export const candidateQueuePageDataSchema = z
  .object({
    items: z.array(candidateQueueItemSchema).max(50),
    hasNextPage: z.boolean(),
    nextCursor: z.string().max(1024).nullable(),
  })
  .strict()
  .superRefine((page, context) => {
    if (page.hasNextPage !== (page.nextCursor !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['nextCursor'],
        message: 'nextCursor must be present exactly when hasNextPage is true.',
      });
    }
  });

export const candidateQueueResponseSchema = candidateQueuePageDataSchema.safeExtend({
  generatedAt: z.iso.datetime({ offset: true }),
});

export type CandidateQueueContext = z.infer<typeof candidateQueueContextSchema>;
export type CandidateQueueCursor = z.infer<typeof candidateQueueCursorSchema>;
export type CandidateQueueQuery = z.infer<typeof candidateQueueQuerySchema>;
export type CandidateQueueItem = z.infer<typeof candidateQueueItemSchema>;
export type CandidateQueuePageData = z.infer<typeof candidateQueuePageDataSchema>;
export type CandidateQueueResponse = z.infer<typeof candidateQueueResponseSchema>;

export interface CandidateQueueBackend {
  loadPage(query: CandidateQueueQuery, asOf: Date): Promise<CandidateQueuePageData>;
}

export type CandidateQueueErrorCode =
  | 'unauthorized'
  | 'invalid_query'
  | 'invalid_page'
  | 'backend_failure';

export class CandidateQueueError extends Error {
  readonly code: CandidateQueueErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: CandidateQueueErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CandidateQueueError';
    this.code = code;
    this.issues = issues;
  }
}

function parseMultiValue<T extends string>(
  searchParameters: URLSearchParams,
  key: string,
): string[] {
  return searchParameters
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value): value is T => value.length > 0);
}

export function encodeCandidateQueueCursor(cursor: CandidateQueueCursor): string {
  const validated = candidateQueueCursorSchema.parse(cursor);
  return globalThis
    .btoa(JSON.stringify(validated))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function decodeCandidateQueueCursor(value: string): CandidateQueueCursor {
  if (value.length === 0 || value.length > 1024) {
    throw new CandidateQueueError('invalid_query', 'The Candidate queue cursor is invalid.');
  }

  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = (4 - (normalized.length % 4)) % 4;
    const decoded = JSON.parse(globalThis.atob(normalized.padEnd(normalized.length + padding, '=')));
    return candidateQueueCursorSchema.parse(decoded);
  } catch (error) {
    if (error instanceof CandidateQueueError) throw error;
    throw new CandidateQueueError('invalid_query', 'The Candidate queue cursor is invalid.', [], {
      cause: error,
    });
  }
}

export function parseCandidateQueueQuery(url: URL): CandidateQueueQuery {
  const limitValue = url.searchParams.get('limit');
  const cursorValue = url.searchParams.get('cursor');
  const input = {
    statuses: parseMultiValue(url.searchParams, 'status'),
    candidateTypes: parseMultiValue(url.searchParams, 'type'),
    sourceTypes: parseMultiValue(url.searchParams, 'source'),
    priority: url.searchParams.get('priority') ?? undefined,
    duplicate: url.searchParams.get('duplicate') ?? undefined,
    limit: limitValue === null ? undefined : Number(limitValue),
    cursor: cursorValue === null ? undefined : decodeCandidateQueueCursor(cursorValue),
  };

  if (input.statuses.length === 0) delete input.statuses;
  if (input.candidateTypes.length === 0) delete input.candidateTypes;
  if (input.sourceTypes.length === 0) delete input.sourceTypes;

  const result = candidateQueueQuerySchema.safeParse(input);
  if (!result.success) {
    throw new CandidateQueueError(
      'invalid_query',
      'The Candidate queue query is invalid.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}

export async function loadCandidateQueue(
  context: CandidateQueueContext,
  backend: CandidateQueueBackend,
  query: CandidateQueueQuery,
  asOf = new Date(),
): Promise<CandidateQueueResponse> {
  const contextResult = candidateQueueContextSchema.safeParse(context);
  if (!contextResult.success || !context.capabilities.includes('candidate:read')) {
    throw new CandidateQueueError(
      'unauthorized',
      'The actor is not authorized to read the Candidate queue.',
      contextResult.success
        ? []
        : contextResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  if (Number.isNaN(asOf.getTime())) {
    throw new CandidateQueueError('invalid_query', 'The Candidate queue time is invalid.');
  }

  let page: CandidateQueuePageData;
  try {
    page = await backend.loadPage(query, asOf);
  } catch (error) {
    if (error instanceof CandidateQueueError) throw error;
    throw new CandidateQueueError(
      'backend_failure',
      'The Candidate queue could not be loaded.',
      [],
      { cause: error },
    );
  }

  const result = candidateQueueResponseSchema.safeParse({
    ...page,
    generatedAt: asOf.toISOString(),
  });
  if (!result.success) {
    throw new CandidateQueueError(
      'invalid_page',
      'The Candidate queue backend returned an invalid page.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}
