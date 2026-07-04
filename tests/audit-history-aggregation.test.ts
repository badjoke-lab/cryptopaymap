import { describe, expect, it, vi } from 'vitest';
import type { AuditHistoryItem } from '../src/admin/audit-history/contract';
import {
  AuditHistoryAggregationError,
  createAggregatedAuditHistoryBackend,
  type AuditHistorySource,
} from '../src/admin/audit-history/aggregation';

function item(overrides: Partial<AuditHistoryItem>): AuditHistoryItem {
  return {
    id: 'candidate_promotion:event-1',
    occurredAt: '2026-07-04T09:00:00.000Z',
    domain: 'candidate',
    sourceKind: 'candidate_promotion',
    action: 'promote_candidate',
    actorId: 'reviewer:candidate',
    actorType: 'human',
    requestId: '10000000-0000-4000-8000-000000000001',
    target: { type: 'source_candidate', id: 'candidate-1' },
    secondaryTargets: [{ type: 'acceptance_claim', id: 'claim-1' }],
    reasonCode: null,
    summary: null,
    transition: null,
    sourceRecordId: 'event-1',
    ...overrides,
  };
}

function source(
  domain: AuditHistorySource['domain'],
  items: AuditHistoryItem[],
  hasMore = false,
): AuditHistorySource {
  return {
    domain,
    loadAuditHistorySource: vi.fn(async () => ({ items, hasMore })),
  };
}

describe('audit history aggregation', () => {
  it('merges source batches in deterministic descending order', async () => {
    const candidate = source('candidate', [item({})]);
    const exported = source('export', [
      item({
        id: 'export_activation:event-2',
        occurredAt: '2026-07-04T10:00:00.000Z',
        domain: 'export',
        sourceKind: 'export_activation',
        action: 'activate_release',
        target: { type: 'export_snapshot', id: 'a'.repeat(64) },
        secondaryTargets: [],
        sourceRecordId: 'event-2',
      }),
    ]);

    const result = await createAggregatedAuditHistoryBackend([candidate, exported]).loadAuditHistory({
      limit: 25,
    });

    expect(result.items.map((entry) => entry.id)).toEqual([
      'export_activation:event-2',
      'candidate_promotion:event-1',
    ]);
    expect(result.hasMore).toBe(false);
  });

  it('selects only the requested domain source', async () => {
    const candidate = source('candidate', [item({})]);
    const exported = source('export', []);

    await createAggregatedAuditHistoryBackend([candidate, exported]).loadAuditHistory({
      domain: 'export',
      limit: 25,
    });

    expect(candidate.loadAuditHistorySource).not.toHaveBeenCalled();
    expect(exported.loadAuditHistorySource).toHaveBeenCalledTimes(1);
  });

  it('applies secondary target filters as a defense boundary', async () => {
    const result = await createAggregatedAuditHistoryBackend([
      source('candidate', [item({})]),
    ]).loadAuditHistory({
      targetType: 'acceptance_claim',
      targetId: 'claim-1',
      limit: 25,
    });

    expect(result.items).toHaveLength(1);
  });

  it('reports more history when any bounded source has more data', async () => {
    const result = await createAggregatedAuditHistoryBackend([
      source('candidate', [item({})], true),
    ]).loadAuditHistory({ limit: 25 });

    expect(result.hasMore).toBe(true);
  });

  it('rejects duplicate normalized event identities across sources', async () => {
    const duplicate = item({});
    await expect(
      createAggregatedAuditHistoryBackend([
        source('candidate', [duplicate]),
        source('candidate', [duplicate]),
      ]).loadAuditHistory({ limit: 25 }),
    ).rejects.toBeInstanceOf(AuditHistoryAggregationError);
  });
});
