import { describe, expect, it } from 'vitest';
import { createExportActivationPostHandler } from '../functions/admin/api/export-activate';
import { createExportHistoryHandler } from '../functions/admin/api/export-history';
import type { CryptoPayMapDatabase } from '../src/db/client';
import { createDrizzleAuditHistorySources } from '../src/admin/audit-history/drizzle-sources';
import { createDrizzleLocationCorrectionAuditSource } from '../src/admin/audit-history/location-correction-source';
import type { ExportRestorePointerSwitchReceipt } from '../src/admin/export-release/restore-execution';
import { ExportRestoreWorkflowError } from '../src/admin/export-release/restore-workflow';
import { authorizeReconfirmationExpiration } from '../src/admin/reconfirmation/authorization';

const identity = {
  actorId: 'cloudflare-access:manual-reviewer',
  actorType: 'human' as const,
  subject: 'manual-reviewer',
  email: 'reviewer@example.test',
};

const database = {} as CryptoPayMapDatabase;

describe('P4-18D4 publication, restore, and Audit boundaries', () => {
  it('keeps publication activation and release history as explicit protected API boundaries', () => {
    expect(createExportActivationPostHandler).toBeTypeOf('function');
    expect(createExportHistoryHandler).toBeTypeOf('function');
  });

  it('keeps durable Audit wiring explicit without fabricating restore persistence', () => {
    const durableSources = createDrizzleAuditHistorySources(database);
    const locationSource = createDrizzleLocationCorrectionAuditSource(database);

    expect(durableSources).toHaveLength(7);
    expect(durableSources.filter((source) => source.domain === 'export')).toHaveLength(2);
    expect(locationSource.domain).toBe('canonical');
  });

  it('preserves post-switch persistence failure reconciliation receipts on the error contract', () => {
    const pointerSwitches: ExportRestorePointerSwitchReceipt[] = [
      {
        pointerKey: 'active.json',
        previousEtag: 'old-etag',
        newEtag: 'new-etag',
        switchedAt: '2026-07-09T00:00:00.000Z',
      },
    ];
    const error = new ExportRestoreWorkflowError(
      'execution_record_failed_after_switch',
      'Persistence failed after pointer switching.',
      [],
      pointerSwitches,
    );

    expect(error.code).toBe('execution_record_failed_after_switch');
    expect(error.pointerSwitches).toEqual(pointerSwitches);
  });

  it('preserves the Access-derived actor ID for manual expiration attribution', () => {
    const context = authorizeReconfirmationExpiration(
      identity,
      { configured: true, allowedSubjects: new Set(['manual-reviewer']) },
      '10000000-0000-4000-8000-000000000001',
    );

    expect(context).toMatchObject({
      actorId: 'cloudflare-access:manual-reviewer',
      actorType: 'system',
      capabilities: ['claim:expire'],
    });
  });
});
