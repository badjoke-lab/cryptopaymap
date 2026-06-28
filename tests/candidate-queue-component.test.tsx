import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CandidateQueueResponse } from '../src/admin/candidates/queue';
import { CandidateQueue } from '../src/components/admin/CandidateQueue';

function page(
  name: string,
  id: string,
  nextCursor: string | null = null,
): CandidateQueueResponse {
  return {
    generatedAt: '2026-06-28T12:00:00.000Z',
    items: [
      {
        id,
        name,
        candidateType: 'physical_place',
        status: 'new',
        priority: 900,
        firstSeenAt: '2026-06-01T00:00:00.000Z',
        lastSeenAt: '2026-06-27T00:00:00.000Z',
        updatedAt: '2026-06-27T01:00:00.000Z',
        sourceTypes: ['official_site'],
        sourceCount: 1,
        duplicateSignal: false,
        duplicateGroupStatus: null,
        linkedToCanonical: false,
      },
    ],
    hasNextPage: nextCursor !== null,
    nextCursor,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CandidateQueue', () => {
  it('loads and displays validated Candidate summaries', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(page('Example Candidate', '00000000-0000-4000-8000-000000000001')),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<CandidateQueue />);

    expect(screen.getByRole('heading', { name: 'Loading Candidate queue' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Example Candidate' })).toBeInTheDocument();
    expect(screen.getByText('Official Site · 1 record')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[0]).toContain('status=new%2Ctriaged');
  });

  it('applies filters and replaces the current page', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(page('First Candidate', '00000000-0000-4000-8000-000000000001')),
      )
      .mockResolvedValueOnce(
        jsonResponse(page('Filtered Candidate', '00000000-0000-4000-8000-000000000002')),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<CandidateQueue />);
    expect(await screen.findByRole('heading', { name: 'First Candidate' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Priority'), 'high');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));

    expect(await screen.findByRole('heading', { name: 'Filtered Candidate' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'First Candidate' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls[1]?.[0]).toContain('priority=high');
  });

  it('appends the next cursor page without replacing loaded Candidates', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          page('First Candidate', '00000000-0000-4000-8000-000000000001', 'next-page'),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(page('Second Candidate', '00000000-0000-4000-8000-000000000002')),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<CandidateQueue />);
    expect(await screen.findByRole('heading', { name: 'First Candidate' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByRole('heading', { name: 'Second Candidate' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'First Candidate' })).toBeInTheDocument();
    expect(fetchMock.mock.calls[1]?.[0]).toContain('cursor=next-page');
  });

  it('fails closed on denied and invalid responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'candidate_queue_denied' }, 403)));
    const { unmount } = render(<CandidateQueue />);
    expect(
      await screen.findByRole('heading', { name: 'Candidate queue access denied' }),
    ).toBeInTheDocument();
    unmount();

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ generatedAt: 'invalid' })));
    render(<CandidateQueue />);
    expect(
      await screen.findByRole('heading', {
        name: 'Candidate queue response could not be verified',
      }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Example Candidate')).not.toBeInTheDocument();
    });
  });
});
