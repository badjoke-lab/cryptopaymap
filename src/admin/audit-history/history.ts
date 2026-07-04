import { z } from 'zod';
import {
  auditHistoryItemSchema,
  auditHistoryQuerySchema,
  auditHistoryReadContextSchema,
  auditHistoryResponseSchema,
  type AuditHistoryBackend,
  type AuditHistoryItem,
  type AuditHistoryQuery,
  type AuditHistoryReadContext,
  type AuditHistoryResponse,
} from './contract';

export type AuditHistoryErrorCode =
  | 'unauthorized'
  | 'invalid_query'
  | 'backend_failure'
  | 'invalid_response';

export class AuditHistoryError extends Error {
  readonly code: AuditHistoryErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: AuditHistoryErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AuditHistoryError';
    this.code = code;
    this.issues = issues;
  }
}

function optionalSearchParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name);
  return value === null || value.trim() === '' ? undefined : value;
}

export function parseAuditHistoryQuery(url: URL): AuditHistoryQuery {
  const result = auditHistoryQuerySchema.safeParse({
    domain: optionalSearchParam(url, 'domain'),
    actorId: optionalSearchParam(url, 'actorId'),
    targetType: optionalSearchParam(url, 'targetType'),
    targetId: optionalSearchParam(url, 'targetId'),
    from: optionalSearchParam(url, 'from'),
    to: optionalSearchParam(url, 'to'),
    before: optionalSearchParam(url, 'before'),
    beforeId: optionalSearchParam(url, 'beforeId'),
    limit: optionalSearchParam(url, 'limit'),
  });
  if (!result.success) {
    throw new AuditHistoryError(
      'invalid_query',
      'The audit history query is invalid.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}

function assertDeterministicOrder(items: AuditHistoryItem[]): void {
  const ids = new Set<string>();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === undefined) continue;
    if (ids.has(item.id)) {
      throw new AuditHistoryError(
        'invalid_response',
        'The audit history backend returned duplicate item IDs.',
        [item.id],
      );
    }
    ids.add(item.id);

    const previous = items[index - 1];
    if (previous === undefined) continue;
    const previousTime = Date.parse(previous.occurredAt);
    const itemTime = Date.parse(item.occurredAt);
    if (itemTime > previousTime || (itemTime === previousTime && item.id >= previous.id)) {
      throw new AuditHistoryError(
        'invalid_response',
        'The audit history backend returned items outside deterministic descending order.',
        [item.id],
      );
    }
  }
}

export async function loadAuditHistory(
  context: AuditHistoryReadContext,
  backend: AuditHistoryBackend,
  query: AuditHistoryQuery,
  asOf: Date,
): Promise<AuditHistoryResponse> {
  const contextResult = auditHistoryReadContextSchema.safeParse(context);
  if (!contextResult.success || !context.capabilities.includes('audit:read')) {
    throw new AuditHistoryError(
      'unauthorized',
      'The actor is not authorized to read audit history.',
      contextResult.success
        ? []
        : contextResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  const queryResult = auditHistoryQuerySchema.safeParse(query);
  if (!queryResult.success) {
    throw new AuditHistoryError(
      'invalid_query',
      'The audit history query is invalid.',
      queryResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  let loaded: { items: AuditHistoryItem[]; hasMore: boolean };
  try {
    loaded = await backend.loadAuditHistory(queryResult.data);
  } catch (error) {
    if (error instanceof AuditHistoryError) throw error;
    throw new AuditHistoryError(
      'backend_failure',
      'The audit history could not be loaded.',
      [],
      { cause: error },
    );
  }

  const itemsResult = z.array(auditHistoryItemSchema).safeParse(loaded.items);
  if (!itemsResult.success || itemsResult.data.length > queryResult.data.limit) {
    throw new AuditHistoryError(
      'invalid_response',
      'The audit history backend returned an invalid result set.',
      itemsResult.success
        ? ['items.length']
        : itemsResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  assertDeterministicOrder(itemsResult.data);

  return auditHistoryResponseSchema.parse({
    generatedAt: asOf.toISOString(),
    query: queryResult.data,
    items: itemsResult.data,
    hasMore: loaded.hasMore,
  });
}
