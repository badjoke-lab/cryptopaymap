import { describe, expect, it } from 'vitest';
import {
  auditHistoryItemSchema,
  type AuditHistoryBackend,
  type AuditHistoryItem,
  type AuditHistoryReadContext,
} from '../src/admin/audit-history/contract';
import {
  AuditHistoryError,
  loadAuditHistory,
  parseAuditHistoryQuery,
} from '../src/admin/audit-history/history';

const context: AuditHistoryReadContext = {
  actorId: 'cloudflare-access:audit-reviewer',
  actorType: 'human',
  capabilities: ['audit:read'],
};

const exportItem: AuditHistoryItem = {
  id: 'export_activation:20000000-0000-4000-8000-000000000001',
  occurredAt: '2026-07-04T10:00:00.000Z',
  domain: 'export',
  sourceKind: 'export_activation',
  action: 'activate_release',
  actorId: 'cloudflare-access:release-operator',
  actorType: 'human',
  requestId: '20000000-0000-4000-8000-000000000001',
  target: { type: 'export_snapshot', id: 'a'.repeat(64) },
  secondaryTargets: [],
  reasonCode: 'approved_release',
  summary: 'Activated a validated export release.',
  transition: { fromState: 'previous_snapshot', toState: 'active' },
  sourceRecordId: '20000000-0000-4000-8000-000000000001',
};

const evidenceItem: AuditHistoryItem = {
  id: 'evidence_review_decision:10000000-0000-4000-8000-000000000001',
  occurredAt: '2026-07-04T09:00:00.000Z',
  domain: 'evidence',
  sourceKind: 'evidence_review_decision',
  action: 'confirm',
  actorId: 'cloudflare-access:evidence-reviewer',
  actorType: 'human',
  requestId: '10000000-0000-4000-8000-000000000001',
  target: { type: 'evidence', id: '30000000-0000-4000-8000-000000000001' },
  secondaryTargets: [
    { type: 'acceptance_claim', id: '40000000-0000-4000-8000-000000000001' },
  ],
  reasonCode: 'evidence_supported_claim',
  summary: null,
  transition: { fromState: 'candidate', toState: 'confirmed' },
  sourceRecordId: '50000000-0000-4000-8000-000000000001',
};

function backend(items: AuditHistoryItem[] = [exportItem, evidenceItem]): AuditHistoryBackend {
  return {
    loadAuditHistory: async () => ({ items, hasMore: false }),
  };
}

describe('audit history contract', () => {
  it('parses bounded filters and stable cursor pairs', () => {
    const query = parseAuditHistoryQuery(
      new URL(
        'https://example.test/admin/api/audit?domain=export&actorId=cloudflare-access%3Arelease-operator&targetType=export_snapshot&targetId=abc&from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-04T00%3A00%3A00.000Z&before=2026-07-03T00%3A00%3A00.000Z&beforeId=event-1&limit=50',
      ),
    );

    expect(query).toEqual({
      domain: 'export',
      actorId: 'cloudflare-access:release-operator',
      targetType: 'export_snapshot',
      targetId: 'abc',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-04T00:00:00.000Z',
      before: '2026-07-03T00:00:00.000Z',
      beforeId: 'event-1',
      limit: 50,
    });
  });

  it('rejects incomplete pagination cursor pairs', () => {
    expect(() =>
      parseAuditHistoryQuery(
        new URL('https://example.test/admin/api/audit?before=2026-07-03T00%3A00%3A00.000Z'),
      ),
    ).toThrow(AuditHistoryError);
  });

  it('loads normalized cross-domain metadata in deterministic order', async () => {
    await expect(
      loadAuditHistory(context, backend(), { limit: 25 }, new Date('2026-07-04T11:00:00.000Z')),
    ).resolves.toEqual({
      generatedAt: '2026-07-04T11:00:00.000Z',
      query: { limit: 25 },
      items: [exportItem, evidenceItem],
      hasMore: false,
    });
  });

  it('requires the isolated audit read capability', async () => {
    await expect(
      loadAuditHistory(
        { ...context, capabilities: [] },
        backend(),
        { limit: 25 },
        new Date('2026-07-04T11:00:00.000Z'),
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('rejects source kinds assigned to the wrong domain', () => {
    expect(
      auditHistoryItemSchema.safeParse({ ...exportItem, domain: 'media' }).success,
    ).toBe(false);
  });

  it('rejects backend results outside deterministic descending order', async () => {
    await expect(
      loadAuditHistory(
        context,
        backend([evidenceItem, exportItem]),
        { limit: 25 },
        new Date('2026-07-04T11:00:00.000Z'),
      ),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('rejects duplicate event identities', async () => {
    await expect(
      loadAuditHistory(
        context,
        backend([exportItem, exportItem]),
        { limit: 25 },
        new Date('2026-07-04T11:00:00.000Z'),
      ),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('rejects a backend response larger than the requested limit', async () => {
    await expect(
      loadAuditHistory(
        context,
        backend([exportItem, evidenceItem]),
        { limit: 1 },
        new Date('2026-07-04T11:00:00.000Z'),
      ),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
