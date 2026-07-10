import { z } from 'zod';
import {
  submissionRelationshipSchema,
  submissionWorkflowStatusSchema,
  submissionWorkflowStatusValues,
} from '../../submissions/contract';
import { suggestionKindSchema } from '../../submissions/suggest-contract';
import type { SubmissionReviewContext } from './authorization';

const timestampSchema = z.iso.datetime({ offset: true });
const submissionReadCapabilitySchema = z.literal('submission:read');

export const submissionReviewContextSchema = z
  .object({
    actorId: z.string().trim().min(1).max(220),
    actorType: z.enum(['human', 'system']),
    capabilities: z.array(submissionReadCapabilitySchema).min(1),
  })
  .strict();

const submissionQueueCursorSchema = z
  .object({
    priority: z.number().int().min(0).max(1_000),
    submittedAt: timestampSchema,
    id: z.uuid(),
  })
  .strict();

export const actionableSuggestSubmissionStatuses = [
  'received',
  'triage',
  'in_review',
  'needs_information',
  'on_hold',
] as const;

export const suggestSubmissionQueueQuerySchema = z
  .object({
    statuses: z
      .array(submissionWorkflowStatusSchema)
      .max(submissionWorkflowStatusValues.length)
      .default([...actionableSuggestSubmissionStatuses]),
    limit: z.number().int().min(1).max(50).default(25),
    cursor: submissionQueueCursorSchema.nullable().default(null),
  })
  .strict();

export const suggestSubmissionQueueItemSchema = z
  .object({
    id: z.uuid(),
    publicId: z.string().regex(/^CPM-S-\d{4}-\d{6}$/),
    suggestionKind: suggestionKindSchema,
    name: z.string().trim().min(1).max(200),
    workflowStatus: submissionWorkflowStatusSchema,
    priority: z.number().int().min(0).max(1_000),
    relationship: submissionRelationshipSchema,
    evidenceCount: z.number().int().nonnegative().max(20),
    submittedAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const suggestSubmissionQueuePageDataSchema = z
  .object({
    items: z.array(suggestSubmissionQueueItemSchema).max(50),
    hasNextPage: z.boolean(),
    nextCursor: z.string().max(1_024).nullable(),
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

export const suggestSubmissionQueueResponseSchema = suggestSubmissionQueuePageDataSchema.safeExtend(
  {
    generatedAt: timestampSchema,
  },
);

export type SuggestSubmissionQueueQuery = z.infer<typeof suggestSubmissionQueueQuerySchema>;
export type SuggestSubmissionQueueItem = z.infer<typeof suggestSubmissionQueueItemSchema>;
export type SuggestSubmissionQueuePageData = z.infer<typeof suggestSubmissionQueuePageDataSchema>;
export type SuggestSubmissionQueueResponse = z.infer<typeof suggestSubmissionQueueResponseSchema>;
export type SuggestSubmissionQueueCursor = z.infer<typeof submissionQueueCursorSchema>;

export interface SuggestSubmissionQueueBackend {
  loadPage(query: SuggestSubmissionQueueQuery, asOf: Date): Promise<SuggestSubmissionQueuePageData>;
}

export class SuggestSubmissionQueueError extends Error {
  constructor(
    readonly code: 'unauthorized' | 'invalid_query' | 'invalid_page' | 'backend_failure',
    message: string,
    readonly issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SuggestSubmissionQueueError';
  }
}

function parseMultiValue(searchParameters: URLSearchParams, key: string): string[] {
  return searchParameters
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function encodeSuggestSubmissionQueueCursor(cursor: SuggestSubmissionQueueCursor): string {
  const validated = submissionQueueCursorSchema.parse(cursor);
  return globalThis
    .btoa(JSON.stringify(validated))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function decodeSuggestSubmissionQueueCursor(value: string): SuggestSubmissionQueueCursor {
  if (value.length === 0 || value.length > 1_024) {
    throw new SuggestSubmissionQueueError('invalid_query', 'Submission queue cursor is invalid.');
  }
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = (4 - (normalized.length % 4)) % 4;
    return submissionQueueCursorSchema.parse(
      JSON.parse(globalThis.atob(normalized.padEnd(normalized.length + padding, '='))),
    );
  } catch (error) {
    throw new SuggestSubmissionQueueError(
      'invalid_query',
      'Submission queue cursor is invalid.',
      [],
      { cause: error },
    );
  }
}

export function parseSuggestSubmissionQueueQuery(url: URL): SuggestSubmissionQueueQuery {
  const statuses = parseMultiValue(url.searchParams, 'status');
  const limitValue = url.searchParams.get('limit');
  const cursorValue = url.searchParams.get('cursor');
  const result = suggestSubmissionQueueQuerySchema.safeParse({
    ...(statuses.length > 0 ? { statuses } : {}),
    limit: limitValue === null ? undefined : Number(limitValue),
    cursor: cursorValue === null ? undefined : decodeSuggestSubmissionQueueCursor(cursorValue),
  });
  if (!result.success) {
    throw new SuggestSubmissionQueueError(
      'invalid_query',
      'Submission queue query is invalid.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}

export async function loadSuggestSubmissionQueue(
  context: SubmissionReviewContext,
  backend: SuggestSubmissionQueueBackend,
  query: SuggestSubmissionQueueQuery,
  asOf = new Date(),
): Promise<SuggestSubmissionQueueResponse> {
  const contextResult = submissionReviewContextSchema.safeParse(context);
  if (!contextResult.success || !context.capabilities.includes('submission:read')) {
    throw new SuggestSubmissionQueueError(
      'unauthorized',
      'The actor is not authorized to read the Suggest Submission queue.',
    );
  }
  if (Number.isNaN(asOf.getTime())) {
    throw new SuggestSubmissionQueueError('invalid_query', 'Submission queue time is invalid.');
  }

  let page: SuggestSubmissionQueuePageData;
  try {
    page = await backend.loadPage(query, asOf);
  } catch (error) {
    if (error instanceof SuggestSubmissionQueueError) throw error;
    throw new SuggestSubmissionQueueError(
      'backend_failure',
      'The Suggest Submission queue could not be loaded.',
      [],
      { cause: error },
    );
  }

  const result = suggestSubmissionQueueResponseSchema.safeParse({
    ...page,
    generatedAt: asOf.toISOString(),
  });
  if (!result.success) {
    throw new SuggestSubmissionQueueError(
      'invalid_page',
      'The Suggest Submission queue backend returned an invalid page.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}
