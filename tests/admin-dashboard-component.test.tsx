import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminDashboardSummary } from '../src/admin/dashboard/summary';
import { AdminDashboard } from '../src/components/admin/AdminDashboard';

const summary: AdminDashboardSummary = {
  generatedAt: '2026-06-28T12:00:00.000Z',
  candidateQueue: {
    totalActionable: 3,
    new: 2,
    triaged: 1,
    linked: 1,
    highPriority: 1,
    openDuplicateGroups: 2,
  },
  evidenceReview: { pending: 4 },
  rechecks: { overdue: 1, dueSoon: 2, stale: 3 },
  mediaReview: { pending: 5 },
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AdminDashboard', () => {
  it('shows loading then verified operational summaries', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(summary));
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminDashboard />);

    expect(
      screen.getByRole('heading', { name: 'Loading operational summary' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Candidate review' })).toBeInTheDocument();
    expect(screen.getByText('2 new · 1 triaged · 1 high priority')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Public release' })).toBeInTheDocument();
    expect(
      screen.getByText('Release controls are intentionally disabled until P3-11.'),
    ).toBeInTheDocument();
    expect(screen.getByText('reconfirmed')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/admin/api/dashboard',
      expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }),
    );
  });

  it('shows a denied state without rendering operational counts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'dashboard_denied' }, 403)),
    );

    render(<AdminDashboard />);

    expect(
      await screen.findByRole('heading', { name: 'Dashboard access denied' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Candidate review' })).not.toBeInTheDocument();
  });

  it('fails closed on an invalid response and retries on request', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ generatedAt: 'invalid' }))
      .mockResolvedValueOnce(jsonResponse(summary));
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminDashboard />);

    expect(
      await screen.findByRole('heading', { name: 'Dashboard response could not be verified' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry summary' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Candidate review' })).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
