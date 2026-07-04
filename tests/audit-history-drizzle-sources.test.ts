import { describe, expect, it } from 'vitest';
import {
  createDrizzleAuditHistorySources,
  createDrizzleEvidenceAuditSource,
} from '../src/admin/audit-history/drizzle-sources';
import type { CryptoPayMapDatabase } from '../src/db/client';

function evidenceRow(id: string, decidedAt: string) {
  return {
    id,
    requestId: id,
    evidenceId: '30000000-0000-4000-8000-000000000003',
    claimId: '30000000-0000-4000-8000-000000000004',
    disposition: 'accepted' as const,
    finding: 'supports_claim' as const,
    claimAction: 'confirm' as const,
    actorId: 'reviewer:evidence',
    actorType: 'human' as const,
    reasonCode: 'evidence_supported_claim',
    publicSummary: 'Claim confirmed from accepted Evidence.',
    internalNote: null,
    expectedEvidenceUpdatedAt: new Date('2026-07-04T08:00:00.000Z'),
    expectedClaimUpdatedAt: new Date('2026-07-04T08:00:00.000Z'),
    fromClaimStatus: 'candidate' as const,
    toClaimStatus: 'confirmed' as const,
    requestFingerprint: 'fingerprint',
    decidedAt: new Date(decidedAt),
    createdAt: new Date(decidedAt),
  };
}

function fakeDatabase(rows: ReturnType<typeof evidenceRow>[]) {
  const calls: string[] = [];
  const database = {
    select() {
      calls.push('select');
      return {
        from() {
          calls.push('from');
          return {
            where() {
              calls.push('where');
              return {
                orderBy() {
                  calls.push('orderBy');
                  return {
                    async limit(value: number) {
                      calls.push(`limit:${value}`);
                      return rows.slice(0, value);
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { database: database as unknown as CryptoPayMapDatabase, calls };
}

describe('audit history Drizzle sources', () => {
  it('loads one extra Evidence decision row and maps bounded source history', async () => {
    const { database, calls } = fakeDatabase([
      evidenceRow('10000000-0000-4000-8000-000000000001', '2026-07-04T10:00:00.000Z'),
      evidenceRow('10000000-0000-4000-8000-000000000002', '2026-07-04T09:00:00.000Z'),
    ]);

    const result = await createDrizzleEvidenceAuditSource(database).loadAuditHistorySource(
      { limit: 25 },
      1,
    );

    expect(calls).toContain('limit:2');
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      domain: 'evidence',
      sourceKind: 'evidence_review_decision',
      action: 'confirm',
      occurredAt: '2026-07-04T10:00:00.000Z',
    });
  });

  it('registers the seven currently durable Phase 3 table sources', () => {
    const { database } = fakeDatabase([]);
    const sources = createDrizzleAuditHistorySources(database);

    expect(sources).toHaveLength(7);
    expect(sources.map((source) => source.domain)).toEqual([
      'candidate',
      'candidate',
      'evidence',
      'reconfirmation',
      'media',
      'export',
      'export',
    ]);
  });
});
