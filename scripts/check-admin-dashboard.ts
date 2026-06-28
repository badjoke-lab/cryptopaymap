import {
  authorizeAdminDashboardRead,
  readAdminDashboardAuthorizationPolicy,
} from '../src/admin/dashboard/authorization';
import { readProtectedAdminIdentity } from '../src/admin/dashboard/identity-context';
import {
  loadAdminDashboardSummary,
  type AdminDashboardSummaryBackend,
} from '../src/admin/dashboard/summary';

const identity = readProtectedAdminIdentity({
  actorId: 'cloudflare-access:runtime-reviewer',
  actorType: 'human',
  subject: 'runtime-reviewer',
  email: 'runtime-reviewer@example.com',
});
const policy = readAdminDashboardAuthorizationPolicy({
  CPM_ADMIN_DASHBOARD_SUBJECTS: JSON.stringify(['runtime-reviewer']),
});
const context = authorizeAdminDashboardRead(identity, policy);
const asOf = new Date('2026-06-28T12:00:00.000Z');

const backend: AdminDashboardSummaryBackend = {
  async loadSummary() {
    return {
      candidateQueue: {
        totalActionable: 3,
        new: 2,
        triaged: 1,
        linked: 0,
        highPriority: 1,
        openDuplicateGroups: 1,
      },
      evidenceReview: { pending: 2 },
      rechecks: { overdue: 1, dueSoon: 2, stale: 0 },
      mediaReview: { pending: 1 },
      imports: {
        lastCompletedAt: null,
        latestAcceptedCount: 0,
        latestRejectedCount: 0,
        latestDuplicateSignalCount: 0,
      },
      publication: {
        state: 'not_available',
        reason: 'release_control_not_implemented',
      },
      recentActivity: [],
    };
  },
};

const summary = await loadAdminDashboardSummary(context, backend, asOf);
if (
  summary.generatedAt !== asOf.toISOString() ||
  summary.candidateQueue.totalActionable !== 3 ||
  summary.publication.state !== 'not_available'
) {
  throw new Error('Administration dashboard summary runtime validation failed.');
}

let backendCalled = false;
try {
  await loadAdminDashboardSummary(
    { ...context, capabilities: [] },
    {
      async loadSummary() {
        backendCalled = true;
        return backend.loadSummary(asOf);
      },
    },
    asOf,
  );
  throw new Error('Unauthorized dashboard summary request was accepted.');
} catch (error) {
  if (backendCalled) {
    throw new Error('Unauthorized dashboard request reached the backend.', { cause: error });
  }
}

console.log('Administration dashboard checks passed.');
