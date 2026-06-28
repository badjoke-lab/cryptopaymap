import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CandidateDuplicateReviewResponse } from '../src/admin/candidates/duplicate-review';
import { CandidateDuplicateReview } from '../src/components/admin/CandidateDuplicateReview';

const groupId = '10000000-0000-4000-8000-000000000001';
const leftId = '20000000-0000-4000-8000-000000000001';
const rightId = '20000000-0000-4000-8000-000000000002';
const requestId = '40000000-0000-4000-8000-000000000001';

function review(status: 'open' | 'resolved' = 'open'): CandidateDuplicateReviewResponse {
  const member = (id: string, name: string) => ({
    id,
    name,
    candidateType: 'physical_place' as const,
    status: status === 'open' ? ('new' as const) : id === leftId ? ('duplicate' as const) : ('triaged' as const),
    priority: 500,
    firstSeenAt: '2026-06-01T00:00:00.000Z',
    lastSeenAt: '2026-06-28T00:00:00.000Z',
    updatedAt: '2026-06-28T01:00:00.000Z',
    sourceTypes: ['legacy_import' as const],
    sourceCount: 1,
    linkedEntity: false,
    linkedLocation: false,
  });
  return {
    generatedAt: '2026-06-29T03:00:00.000Z',
    group: {
      id: groupId,
      status,
      updatedAt: status === 'open' ? '2026-06-28T01:00:00.000Z' : '2026-06-29T03:00:00.000Z',
      resolvedAt: status === 'open' ? null : '2026-06-29T03:00:00.000Z',
    },
    members: [member(leftId, 'Left Cafe'), member(rightId, 'Right Cafe')],
    signals: [
      {
        id: '30000000-0000-4000-8000-000000000001',
        leftCandidateId: leftId,
        rightCandidateId: rightId,
        reason: 'shared_osm_identity',
        strength: 'strong',
        createdAt: '2026-06-28T01:00:00.000Z',
      },
    ],
    signalsTruncated: false,
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
  window.history.replaceState({}, '', '/');
});

describe('CandidateDuplicateReview', () => {
  it('loads a validated group and commits the selected primary Candidate', async () => {
    window.history.replaceState({}, '', `/admin/candidates/duplicates/?group=${groupId}`);
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(review()))
      .mockResolvedValueOnce(
        jsonResponse({
          decisionId: '50000000-0000-4000-8000-000000000001',
          requestId,
          duplicateGroupId: groupId,
          action: 'confirm_duplicate',
          primaryCandidateId: rightId,
          memberCandidateIds: [leftId, rightId],
          groupStatus: 'resolved',
          decidedAt: '2026-06-29T03:00:00.000Z',
          state: 'committed',
        }),
      )
      .mockResolvedValueOnce(jsonResponse(review('resolved')));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => requestId });

    render(<CandidateDuplicateReview />);

    expect(await screen.findByRole('heading', { name: 'Candidate comparison' })).toBeInTheDocument();
    expect(screen.getByText('Shared OSM Identity · Strong')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Select Right Cafe as primary Candidate' }));
    await user.click(screen.getByRole('button', { name: 'Commit decision' }));

    expect(await screen.findByText('This group is closed. No further decision control is displayed.')).toBeInTheDocument();
    const postCall = fetchMock.mock.calls[1];
    expect(postCall?.[0]).toBe(`/admin/api/duplicates/${groupId}`);
    const request = postCall?.[1] as RequestInit;
    expect(request.method).toBe('POST');
    expect(JSON.parse(String(request.body))).toMatchObject({
      action: 'confirm_duplicate',
      primaryCandidateId: rightId,
      memberCandidateIds: [leftId, rightId],
      expectedGroupUpdatedAt: '2026-06-28T01:00:00.000Z',
    });
  });

  it('fails closed on an invalid response', async () => {
    window.history.replaceState({}, '', `/admin/candidates/duplicates/?group=${groupId}`);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ group: { id: groupId } })));

    render(<CandidateDuplicateReview />);

    expect(await screen.findByText('The response could not be verified.')).toBeInTheDocument();
    expect(screen.queryByText('Left Cafe')).not.toBeInTheDocument();
  });

  it('shows read denial without rendering private group values', async () => {
    window.history.replaceState({}, '', `/admin/candidates/duplicates/?group=${groupId}`);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'duplicate_review_denied' }, 403)));

    render(<CandidateDuplicateReview />);

    expect(await screen.findByText('This identity cannot read the group.')).toBeInTheDocument();
    expect(screen.queryByText(groupId)).not.toBeInTheDocument();
  });
});
