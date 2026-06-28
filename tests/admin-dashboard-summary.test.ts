import { describe, expect, it, vi } from 'vitest';
import {
  loadAdminDashboardSummary,
  type AdminDashboardSummaryBackend,
  type AdminDashboardSummaryData,
  type AdminDashboardSummaryError,
} from '../src/admin/dashboard/summary';

const asOf = new Date('2026-06-28T12:00:00.000Z');
const authorizedContext = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human' as const,
  capabilities: ['dashboard:read' as const],
};

function validData(): AdminDashboardSummaryData {
  return {
    candidateQueue: {
      totalActionable: 7,
      new: 5,
      triaged: 2,
      linked: 1,
      highPriority: 3,
      openDuplicateGroups: 2,
    },
    evidenceReview: { pending: 4 },
    rechecks: { overdue: 1, dueSoon: 2, stale: 3 },
    mediaReview: { pending: 2 },
    imports: {
      lastCompletedAt: '2026-06-28T11:00:00.000Z',
      latestAcceptedCount: 6,
      latestRejectedCount: 1,
      latestDuplicateSignalCount: 2,
    },
    publication: {
      state: 'not_available',
      reason: 'release_control_not_implemented',
    },
    recentActivity: [
      {
        eventType: 'reconfirmed',
        effectiveAt: '2026-06-28T10:00:00.000Z',
      },
    ],
  };
}

describe('administration dashboard summary service', () => {
  it('rejects a missing capability before calling the backend', async () => {
    const backend: AdminDashboardSummaryBackend = {
      loadSummary: vi.fn(async () => validData()),
    };

    await expect(
      loadAdminDashboardSummary(
        {
          actorId: authorizedContext.actorId,
          actorType: authorizedContext.actorType,
          capabilities: [],
        },
        backend,
        asOf,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(backend.loadSummary).not.toHaveBeenCalled();
  });

  it('returns a validated bounded summary with a generated time', async () => {
    const backend: AdminDashboardSummaryBackend = {
      loadSummary: vi.fn(async () => validData()),
    };

    await expect(loadAdminDashboardSummary(authorizedContext, backend, asOf)).resolves.toEqual({
      ...validData(),
      generatedAt: asOf.toISOString(),
    });
    expect(backend.loadSummary).toHaveBeenCalledWith(asOf);
  });

  it('rejects an inconsistent actionable total', async () => {
    const invalidData = validData();
    invalidData.candidateQueue.totalActionable = 99;
    const backend: AdminDashboardSummaryBackend = {
      loadSummary: vi.fn(async () => invalidData),
    };

    await expect(loadAdminDashboardSummary(authorizedContext, backend, asOf)).rejects.toMatchObject(
      {
        code: 'invalid_summary',
      },
    );
  });

  it('wraps an unexpected backend failure without exposing it', async () => {
    const backend: AdminDashboardSummaryBackend = {
      loadSummary: vi.fn(async () => {
        throw new Error('database detail that must not escape');
      }),
    };

    await expect(loadAdminDashboardSummary(authorizedContext, backend, asOf)).rejects.toEqual(
      expect.objectContaining<Partial<AdminDashboardSummaryError>>({
        code: 'backend_failure',
        message: 'The administration dashboard summary could not be loaded.',
      }),
    );
  });
});
