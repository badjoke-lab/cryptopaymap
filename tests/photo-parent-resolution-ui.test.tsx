import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhotoParentResolutionPreviewResponse } from '../src/admin/submissions/photo-parent-resolution-preview';
import { PhotoParentResolutionPanel } from '../src/components/admin/PhotoParentResolutionPanel';

const submissionId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const handoffEventId = '30000000-0000-4000-8000-000000000001';
const mediaIds = [
  '40000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
] as const;
const decisionIds = [
  '50000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002',
] as const;
const submissionUpdatedAt = '2026-07-16T06:20:00.000Z';
const decisionTimes = ['2026-07-16T06:21:00.000Z', '2026-07-16T06:22:00.000Z'] as const;
const changedAt = '2026-07-16T06:23:00.000Z';

function readyPreview(): PhotoParentResolutionPreviewResponse {
  return {
    submissionId,
    workflowStatus: 'in_review',
    currentResolution: null,
    expectedSubmissionUpdatedAt: submissionUpdatedAt,
    handoffEventId,
    readiness: 'ready',
    derivedResolution: 'partially_approved',
    approvedCount: 1,
    rejectedCount: 1,
    pendingCount: 0,
    media: [
      {
        mediaReference: `MEDIA-${mediaIds[0].toUpperCase()}`,
        mediaAssetId: mediaIds[0],
        mediaUpdatedAt: decisionTimes[0],
        reviewStatus: 'accepted',
        publicDecision: 'approved',
        decisionId: decisionIds[0],
        decisionAction: 'approve_public',
        decisionDecidedAt: decisionTimes[0],
        expectedReviewStatus: 'accepted',
      },
      {
        mediaReference: `MEDIA-${mediaIds[1].toUpperCase()}`,
        mediaAssetId: mediaIds[1],
        mediaUpdatedAt: decisionTimes[1],
        reviewStatus: 'rejected',
        publicDecision: 'rejected',
        decisionId: decisionIds[1],
        decisionAction: 'reject',
        decisionDecidedAt: decisionTimes[1],
        expectedReviewStatus: 'rejected',
      },
    ],
    expectedRequest: {
      expectedSubmissionStatus: 'in_review',
      expectedSubmissionUpdatedAt: submissionUpdatedAt,
      expectedHandoffEventId: handoffEventId,
      expectedMedia: [
        {
          mediaAssetId: mediaIds[0],
          expectedMediaUpdatedAt: decisionTimes[0],
          decisionId: decisionIds[0],
          expectedDecisionAction: 'approve_public',
          expectedDecisionDecidedAt: decisionTimes[0],
          expectedReviewStatus: 'accepted',
        },
        {
          mediaAssetId: mediaIds[1],
          expectedMediaUpdatedAt: decisionTimes[1],
          decisionId: decisionIds[1],
          expectedDecisionAction: 'reject',
          expectedDecisionDecidedAt: decisionTimes[1],
          expectedReviewStatus: 'rejected',
        },
      ],
    },
    generatedAt: changedAt,
  };
}

function pendingPreview(): PhotoParentResolutionPreviewResponse {
  const ready = readyPreview();
  const approvedMedia = ready.media[0];
  const rejectedMedia = ready.media[1];
  if (approvedMedia === undefined || rejectedMedia === undefined) {
    throw new Error('Expected preview Media snapshots are missing.');
  }
  return {
    ...ready,
    readiness: 'pending',
    derivedResolution: null,
    approvedCount: 1,
    rejectedCount: 0,
    pendingCount: 1,
    media: [
      approvedMedia,
      {
        ...rejectedMedia,
        mediaUpdatedAt: submissionUpdatedAt,
        reviewStatus: 'pending',
        publicDecision: 'pending',
        decisionId: null,
        decisionAction: null,
        decisionDecidedAt: null,
        expectedReviewStatus: null,
      },
    ],
    expectedRequest: null,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('P5-06E2 Photos parent resolution reviewer controls', () => {
  it('submits only the exact server-projected child snapshot', async () => {
    const user = userEvent.setup();
    const publicMessage = 'One submitted photo was approved and one was not approved.';
    const initialPreview = readyPreview();
    const exactRequest = initialPreview.expectedRequest;
    if (exactRequest === null) throw new Error('Expected ready request snapshot is missing.');
    const resolvedPreview: PhotoParentResolutionPreviewResponse = {
      ...initialPreview,
      workflowStatus: 'resolved',
      currentResolution: 'partially_approved',
      readiness: 'resolved',
      expectedRequest: null,
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(initialPreview), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            state: 'committed',
            submissionId,
            fromStatus: 'in_review',
            toStatus: 'resolved',
            resolution: 'partially_approved',
            publicMessage,
            approvedCount: 1,
            rejectedCount: 1,
            mediaDecisions: [
              {
                mediaReference: `MEDIA-${mediaIds[0].toUpperCase()}`,
                decision: 'approved',
              },
              {
                mediaReference: `MEDIA-${mediaIds[1].toUpperCase()}`,
                decision: 'rejected',
              },
            ],
            changedAt,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(resolvedPreview), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => requestId });

    render(<PhotoParentResolutionPanel submissionId={submissionId} />);

    await screen.findByText(/derived parent outcome is partially approved/i);
    expect(screen.getByText(/1 approved · 1 rejected · 0 pending/i)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Public status message' }), publicMessage);
    await user.click(screen.getByRole('button', { name: 'Resolve Photos parent' }));

    await screen.findByText(/Parent resolution committed: partially_approved/i);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/admin/api/photo-submissions/${submissionId}/parent-resolution`,
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `/admin/api/photo-submissions/${submissionId}/parent-resolution`,
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      schemaVersion: 'photo-parent-resolution-v1',
      requestId,
      expectedSubmissionStatus: 'in_review',
      expectedSubmissionUpdatedAt: submissionUpdatedAt,
      expectedHandoffEventId: handoffEventId,
      expectedMedia: exactRequest.expectedMedia,
      publicMessage,
      internalNote: null,
    });
  });

  it('shows pending child decisions without exposing a resolution button', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify(pendingPreview()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<PhotoParentResolutionPanel submissionId={submissionId} />);

    await screen.findByText(/1 child Media decision remains pending/i);
    expect(screen.getByText(/1 approved · 0 rejected · 1 pending/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolve Photos parent' })).not.toBeInTheDocument();
    expect(
      screen.getByText(/No P5-06E parent-resolution request is available/i),
    ).toBeInTheDocument();
  });
});
