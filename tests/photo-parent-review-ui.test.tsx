import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhotoSubmissionDetailResponse } from '../src/admin/submissions/photo-parent';
import { PhotoSubmissionQueue } from '../src/components/admin/PhotoSubmissionQueue';
import { PhotoSubmissionReview } from '../src/components/admin/PhotoSubmissionReview';

const submissionId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';
const uploadId = '30000000-0000-4000-8000-000000000001';
const requestId = '40000000-0000-4000-8000-000000000001';

function detailResponse(
  workflowStatus: 'received' | 'triage',
  updatedAt = '2026-07-15T17:00:00.000Z',
): PhotoSubmissionDetailResponse {
  return {
    generatedAt: '2026-07-15T17:00:00.000Z',
    submission: {
      id: submissionId,
      publicId: 'CPM-S-2026-000001',
      submissionType: 'photos',
      targetType: 'location',
      targetId,
      workflowStatus,
      resolution: null,
      priority: 50,
      submittedAt: '2026-07-15T16:00:00.000Z',
      updatedAt,
    },
    projection: {
      targetType: 'location',
      targetId,
      relationship: 'customer',
      media: [
        {
          quarantineUploadId: uploadId,
          purpose: 'public_gallery_candidate',
          role: 'exterior',
          declaredMimeType: 'image/jpeg',
          declaredByteSize: 1_024,
          capturedAt: null,
          description: 'Storefront and payment sign.',
          suggestedAltText: 'Storefront with a crypto payment sign.',
          photographerPresent: true,
          rightsStatus: 'submitted_with_permission',
          rightsHolderPresent: true,
          permissionReferencePresent: false,
          licenseName: null,
          licenseUrl: null,
          publicDisplayPermission: true,
        },
      ],
      submitterNote: 'Recent exterior photo.',
    },
    events: [],
    eventsTruncated: false,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('P5-06B2B2 Photos parent reviewer UI', () => {
  it('loads the bounded Photos queue and links to parent detail', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          generatedAt: '2026-07-15T17:00:00.000Z',
          items: [
            {
              id: submissionId,
              publicId: 'CPM-S-2026-000001',
              targetType: 'location',
              targetId,
              workflowStatus: 'received',
              priority: 50,
              mediaCount: 1,
              relationship: 'customer',
              submittedAt: '2026-07-15T16:00:00.000Z',
              updatedAt: '2026-07-15T17:00:00.000Z',
            },
          ],
          hasNextPage: false,
          nextCursor: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<PhotoSubmissionQueue />);

    const link = await screen.findByRole('link', { name: 'Review Photos Submission' });
    expect(link).toHaveAttribute('href', `/admin/submissions/photo-detail?id=${submissionId}`);
    expect(screen.getByText('1 photo candidate')).toBeInTheDocument();
    expect(screen.queryByText(uploadId)).not.toBeInTheDocument();
  });

  it('moves a received Photos parent Submission into triage with exact state guards', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(detailResponse('received')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            state: 'committed',
            submissionId,
            submissionType: 'photos',
            fromStatus: 'received',
            toStatus: 'triage',
            action: 'begin_triage',
            changedAt: '2026-07-15T17:01:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(detailResponse('triage', '2026-07-15T17:01:00.000Z')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => requestId });

    render(<PhotoSubmissionReview submissionId={submissionId} />);

    await user.click(await screen.findByRole('button', { name: 'Begin triage' }));
    await screen.findByRole('button', { name: 'Begin review' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const transitionCall = fetchMock.mock.calls[1];
    expect(transitionCall?.[0]).toBe(`/admin/api/review-entry/${submissionId}`);
    expect(transitionCall?.[1]).toMatchObject({ method: 'POST', credentials: 'same-origin' });
    expect(JSON.parse(String(transitionCall?.[1]?.body))).toEqual({
      schemaVersion: 'submission-review-entry-v1',
      requestId,
      submissionType: 'photos',
      action: 'begin_triage',
      expectedStatus: 'received',
      expectedUpdatedAt: '2026-07-15T17:00:00.000Z',
    });
    expect(screen.queryByText(uploadId)).not.toBeInTheDocument();
  });
});
