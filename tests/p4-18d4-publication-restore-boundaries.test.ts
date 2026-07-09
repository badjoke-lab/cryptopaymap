import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createExportActivationPostHandler } from '../functions/admin/api/export-activate';
import { createExportHistoryHandler } from '../functions/admin/api/export-history';
import { authorizeReconfirmationExpiration } from '../src/admin/reconfirmation/authorization';

const auditRouteSource = readFileSync('functions/admin/api/audit-history.ts', 'utf8');
const durableAuditSources = readFileSync('src/admin/audit-history/drizzle-sources.ts', 'utf8');
const restoreWorkflowSource = readFileSync('src/admin/export-release/restore-workflow.ts', 'utf8');

const identity = {
  actorId: 'cloudflare-access:manual-reviewer',
  actorType: 'human' as const,
  subject: 'manual-reviewer',
  email: 'reviewer@example.test',
};

describe('P4-18D4 publication, restore, and Audit boundaries', () => {
  it('keeps publication activation and release history as explicit protected API boundaries', () => {
    expect(createExportActivationPostHandler).toBeTypeOf('function');
    expect(createExportHistoryHandler).toBeTypeOf('function');
  });

  it('keeps durable Audit wiring accurate without fabricating restore persistence', () => {
    expect(auditRouteSource).toContain('createDrizzleAuditHistorySources(database)');
    expect(auditRouteSource).toContain('createDrizzleLocationCorrectionAuditSource(database)');
    expect(durableAuditSources).toContain('createDrizzleExportReleaseAuditSource(database)');
    expect(durableAuditSources).toContain('createDrizzleExportActivationAuditSource(database)');
    expect(durableAuditSources).not.toContain('export_restore_execution');
  });

  it('preserves explicit post-switch persistence failure reconciliation receipts', () => {
    expect(restoreWorkflowSource).toContain("'execution_record_failed_after_switch'");
    expect(restoreWorkflowSource).toContain('pointerSwitches,');
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
