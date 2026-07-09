import { describe, expect, it } from 'vitest';
import { auditHistoryItemSchema } from '../src/admin/audit-history/contract';
import { createDrizzleSubmissionAuditSource } from '../src/admin/audit-history/drizzle-sources';
import { submissionEventAuditItem } from '../src/admin/audit-history/normalizers';
import type { CryptoPayMapDatabase } from '../src/db/client';

const safeRow = {
  id: '10000000-0000-4000-8000-000000000001',
  publicId: 'CPM-S-2026-000123',
  submissionType: 'suggest' as const,
  fromStatus: 'triage' as const,
  toStatus: 'in_review' as const,
  action: 'start_review',
  reasonCode: 'triage_complete',
  actorId: 'reviewer:alice',
  actorType: 'reviewer' as const,
  createdAt: new Date('2026-07-09T12:00:00.000Z'),
};

function fakeSubmissionAuditDatabase(rows = [safeRow]) {
  let selectedKeys: string[] = [];
  const calls: string[] = [];
  const database = {
    select(selection: Record<string, unknown>) {
      selectedKeys = Object.keys(selection);
      calls.push('select');
      return {
        from() {
          calls.push('from');
          return {
            innerJoin() {
              calls.push('innerJoin');
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
    },
  };
  return {
    database: database as unknown as CryptoPayMapDatabase,
    calls,
    selectedKeys: () => selectedKeys,
  };
}

describe('P5-01E Submission Audit history', () => {
  it('normalizes one Submission event into metadata-only Audit history', () => {
    const item = submissionEventAuditItem(safeRow);

    expect(auditHistoryItemSchema.parse(item)).toEqual(item);
    expect(item).toEqual({
      id: 'submission_event:10000000-0000-4000-8000-000000000001',
      occurredAt: '2026-07-09T12:00:00.000Z',
      domain: 'submission',
      sourceKind: 'submission_event',
      action: 'start_review',
      actorId: 'reviewer:alice',
      actorType: 'human',
      requestId: null,
      target: { type: 'submission', id: 'CPM-S-2026-000123' },
      secondaryTargets: [],
      reasonCode: 'triage_complete',
      summary: null,
      transition: { fromState: 'triage', toState: 'in_review' },
      sourceRecordId: '10000000-0000-4000-8000-000000000001',
    });
  });

  it('maps submitter actors to human and system actors to system', () => {
    expect(submissionEventAuditItem({ ...safeRow, actorType: 'submitter' }).actorType).toBe(
      'human',
    );
    expect(submissionEventAuditItem({ ...safeRow, actorType: 'system' }).actorType).toBe('system');
  });

  it('selects only metadata-safe Submission and event columns from Drizzle', async () => {
    const { database, selectedKeys, calls } = fakeSubmissionAuditDatabase();
    const result = await createDrizzleSubmissionAuditSource(database).loadAuditHistorySource(
      { domain: 'submission', limit: 25 },
      25,
    );

    expect(result.items).toHaveLength(1);
    expect(calls).toContain('innerJoin');
    expect(selectedKeys()).toEqual([
      'id',
      'publicId',
      'submissionType',
      'fromStatus',
      'toStatus',
      'action',
      'reasonCode',
      'actorId',
      'actorType',
      'createdAt',
    ]);
    expect(selectedKeys()).not.toEqual(
      expect.arrayContaining([
        'internalNote',
        'requestFingerprint',
        'statusTokenHash',
        'encryptedEmail',
        'emailHash',
        'originalPayload',
        'normalizedPayload',
        'proposedChanges',
      ]),
    );
  });

  it('returns no Submission items for a different target type', async () => {
    const { database, calls } = fakeSubmissionAuditDatabase();
    const result = await createDrizzleSubmissionAuditSource(database).loadAuditHistorySource(
      {
        targetType: 'acceptance_claim',
        targetId: '30000000-0000-4000-8000-000000000001',
        limit: 25,
      },
      25,
    );

    expect(result).toEqual({ items: [], hasMore: false });
    expect(calls).toEqual([]);
  });
});
