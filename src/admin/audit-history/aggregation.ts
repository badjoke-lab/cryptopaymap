import {
  auditHistoryDomainValues,
  auditHistoryItemSchema,
  type AuditHistoryBackend,
  type AuditHistoryItem,
  type AuditHistoryQuery,
} from './contract';

export interface AuditHistorySource {
  readonly domain: (typeof auditHistoryDomainValues)[number];
  loadAuditHistorySource(
    query: AuditHistoryQuery,
    sourceLimit: number,
  ): Promise<{ items: AuditHistoryItem[]; hasMore: boolean }>;
}

export type AuditHistoryAggregationErrorCode =
  | 'source_failure'
  | 'invalid_source_response'
  | 'duplicate_item';

export class AuditHistoryAggregationError extends Error {
  readonly code: AuditHistoryAggregationErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: AuditHistoryAggregationErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AuditHistoryAggregationError';
    this.code = code;
    this.issues = issues;
  }
}

function targetMatches(item: AuditHistoryItem, query: AuditHistoryQuery): boolean {
  if (query.targetType === undefined) return true;
  const allTargets = [item.target, ...item.secondaryTargets];
  return allTargets.some(
    (target) =>
      target.type === query.targetType &&
      (query.targetId === undefined || target.id === query.targetId),
  );
}

function matchesQuery(item: AuditHistoryItem, query: AuditHistoryQuery): boolean {
  if (query.domain !== undefined && item.domain !== query.domain) return false;
  if (query.actorId !== undefined && item.actorId !== query.actorId) return false;
  if (!targetMatches(item, query)) return false;
  const occurredAt = Date.parse(item.occurredAt);
  if (query.from !== undefined && occurredAt < Date.parse(query.from)) return false;
  if (query.to !== undefined && occurredAt > Date.parse(query.to)) return false;
  if (query.before !== undefined && query.beforeId !== undefined) {
    const before = Date.parse(query.before);
    if (occurredAt > before) return false;
    if (occurredAt === before && item.id >= query.beforeId) return false;
  }
  return true;
}

function compareItems(left: AuditHistoryItem, right: AuditHistoryItem): number {
  const timeDifference = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
  if (timeDifference !== 0) return timeDifference;
  return right.id.localeCompare(left.id);
}

export function createAggregatedAuditHistoryBackend(
  sources: readonly AuditHistorySource[],
): AuditHistoryBackend {
  return {
    async loadAuditHistory(query: AuditHistoryQuery) {
      const selected =
        query.domain === undefined
          ? sources
          : sources.filter((source) => source.domain === query.domain);
      const sourceLimit = Math.min(query.limit + 1, 101);

      let batches: {
        items: AuditHistoryItem[];
        hasMore: boolean;
        domain: AuditHistorySource['domain'];
      }[];
      try {
        batches = await Promise.all(
          selected.map(async (source) => {
            const batch = await source.loadAuditHistorySource(query, sourceLimit);
            return { ...batch, domain: source.domain };
          }),
        );
      } catch (error) {
        throw new AuditHistoryAggregationError(
          'source_failure',
          'An authoritative audit history source could not be loaded.',
          [],
          { cause: error },
        );
      }

      const normalized: AuditHistoryItem[] = [];
      const seenIds = new Set<string>();
      for (const batch of batches) {
        for (const rawItem of batch.items) {
          const result = auditHistoryItemSchema.safeParse(rawItem);
          if (!result.success || result.data.domain !== batch.domain) {
            throw new AuditHistoryAggregationError(
              'invalid_source_response',
              'An audit history source returned an invalid normalized item.',
              result.success
                ? [result.data.id]
                : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
            );
          }
          if (seenIds.has(result.data.id)) {
            throw new AuditHistoryAggregationError(
              'duplicate_item',
              'Multiple audit history sources returned the same audit item identity.',
              [result.data.id],
            );
          }
          seenIds.add(result.data.id);
          if (matchesQuery(result.data, query)) normalized.push(result.data);
        }
      }

      normalized.sort(compareItems);
      const hasMore = normalized.length > query.limit || batches.some((batch) => batch.hasMore);
      return {
        items: normalized.slice(0, query.limit),
        hasMore,
      };
    },
  };
}
