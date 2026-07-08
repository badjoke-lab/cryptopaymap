import { describe, expect, it } from 'vitest';
import { createDrizzleLocationCorrectionAuditSource } from '../src/admin/audit-history/location-correction-source';
import type { CryptoPayMapDatabase } from '../src/db/client';

function correctionRow(id: string, locationId: string, decidedAt: string) {
  return {
    id,
    requestId: id,
    locationId,
    actorId: 'cloudflare-access:reviewer',
    actorType: 'human' as const,
    expectedLocationUpdatedAt: new Date('2026-07-07T00:00:00.000Z'),
    changedFieldPaths: ['phone'],
    changes: { phone: { operation: 'set', value: '+81 3 2222 2222' } },
    beforeValues: { phone: '+81 3 1111 1111' },
    afterValues: { phone: '+81 3 2222 2222' },
    sourceRecordIds: ['30000000-0000-4000-8000-000000000001'],
    provenanceAssignments: [
      {
        fieldPath: 'phone',
        sourceRecordIds: ['30000000-0000-4000-8000-000000000001'],
      },
    ],
    reasonCode: 'reviewed_profile_correction',
    publicSummary: 'Updated phone from reviewed official source.',
    internalNote: 'Protected note.',
    decidedAt: new Date(decidedAt),
    requestFingerprint: 'fingerprint',
    createdAt: new Date(decidedAt),
  };
}

function fakeDatabase(rows: ReturnType<typeof correctionRow>[]) {
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

describe('Location correction Audit source', () => {
  it('loads one extra durable correction row and returns bounded canonical history', async () => {
    const locationId = '20000000-0000-4000-8000-000000000001';
    const { database, calls } = fakeDatabase([
      correctionRow(
        '10000000-0000-4000-8000-000000000001',
        locationId,
        '2026-07-08T10:00:00.000Z',
      ),
      correctionRow(
        '10000000-0000-4000-8000-000000000002',
        locationId,
        '2026-07-08T09:00:00.000Z',
      ),
    ]);

    const result = await createDrizzleLocationCorrectionAuditSource(
      database,
    ).loadAuditHistorySource({ limit: 25, targetType: 'location', targetId: locationId }, 1);

    expect(calls).toContain('limit:2');
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      domain: 'canonical',
      sourceKind: 'location_profile_correction',
      action: 'correct_location_profile',
      target: { type: 'location', id: locationId },
      occurredAt: '2026-07-08T10:00:00.000Z',
    });
  });

  it('returns no rows for a target type outside the correction source', async () => {
    const { database, calls } = fakeDatabase([]);
    const result = await createDrizzleLocationCorrectionAuditSource(
      database,
    ).loadAuditHistorySource({ limit: 25, targetType: 'evidence' }, 25);

    expect(result).toEqual({ items: [], hasMore: false });
    expect(calls).toEqual([]);
  });
});
