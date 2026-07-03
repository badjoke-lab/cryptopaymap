import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MediaReviewDetailResponse,
  MediaReviewQueueResponse,
} from '../src/admin/media-review/workspace';
import { MediaReviewDetail } from '../src/components/admin/MediaReviewDetail';
import { MediaReviewQueue } from '../src/components/admin/MediaReviewQueue';

const mediaAssetId = '20000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const displayFileId = '40000000-0000-4000-8000-000000000001';
const thumbnailFileId = '40000000-0000-4000-8000-000000000002';
const now = '2026-07-03T02:00:00.000Z';
const updatedAt = '2026-07-03T01:00:00.000Z';

function queue(): MediaReviewQueueResponse {
  return {
    generatedAt: now,
    query: { reviewStatus: 'pending', limit: 50 },
    hasMore: false,
    items: [
      {
        id: mediaAssetId,
        purpose: 'public_gallery_candidate',
        role: 'cover',
        reviewStatus: 'pending',
        rightsStatus: 'unknown',
        visibility: 'private',
        subject: { type: 'entity', id: entityId },
        altText: null,
        displayOrder: 0,
        fileCount: 2,
        updatedAt,
      },
    ],
  };
}

function detail(): MediaReviewDetailResponse {
  const item = queue().items[0];
  if (item === undefined) throw new Error('Missing Media fixture.');
  return {
    generatedAt: now,
    media: {
      ...item,
      licenseId: null,
      attribution: null,
      rightsHolder: null,
      consentReference: null,
      capturedAt: null,
      publishedAt: null,
      createdAt: '2026-07-03T00:00:00.000Z',
    },
    files: [
      {
        id: displayFileId,
        variant: 'display',
        storageScope: 'private',
        storageKey: `media/private/${mediaAssetId}/${displayFileId}-${'0'.repeat(64)}.webp`,
        originalFilename: null,
        mimeType: 'image/webp',
        byteSize: 120000,
        width: 960,
        height: 540,
        contentHash: '0'.repeat(64),
        createdAt: '2026-07-03T00:00:00.000Z',
      },
      {
        id: thumbnailFileId,
        variant: 'thumbnail',
        storageScope: 'private',
        storageKey: `media/private/${mediaAssetId}/${thumbnailFileId}-${'1'.repeat(64)}.webp`,
        originalFilename: null,
        mimeType: 'image/webp',
        byteSize: 12000,
        width: 160,
        height: 160,
        contentHash: '1'.repeat(64),
        createdAt: '2026-07-03T00:00:00.000Z',
      },
    ],
  };
}

beforeEach(() => {
  window.history.replaceState({}, '', '/admin/media/');
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => '10000000-0000-4000-8000-000000000001'),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Media review components', () => {
  it('renders protected Media summaries from a validated queue response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(queue()), { status: 200 })),
    );

    render(<MediaReviewQueue />);

    expect(await screen.findByRole('heading', { name: 'Media summaries' })).toBeInTheDocument();
    expect(screen.getByText('Public Gallery Candidate')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review Media' })).toHaveAttribute(
      'href',
      `/admin/media/detail/?id=${mediaAssetId}`,
    );
  });

  it('submits exact Media and file-set expectations for public approval', async () => {
    window.history.replaceState({}, '', `/admin/media/detail/?id=${mediaAssetId}`);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(detail()), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            requestId: '10000000-0000-4000-8000-000000000001',
            mediaAssetId,
            action: 'approve_public',
            reviewStatus: 'accepted',
            purpose: 'public_gallery',
            rightsStatus: 'submitted_with_permission',
            visibility: 'public',
            decidedAt: now,
            publicFileIds: [displayFileId, thumbnailFileId],
            state: 'committed',
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<MediaReviewDetail />);

    expect(await screen.findByRole('heading', { name: 'Decision' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Rights holder'), 'Example Merchant');
    await user.type(screen.getByLabelText('Public alt text'), 'Exterior of Example Merchant.');
    await user.type(screen.getByLabelText('Public summary'), 'Approved for the public gallery.');
    const submitButton = screen.getByRole('button', { name: 'Commit Media decision' });
    const form = submitButton.closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      expectedMediaUpdatedAt: updatedAt,
      expectedReviewStatus: 'pending',
      expectedPurpose: 'public_gallery_candidate',
      expectedRole: 'cover',
      expectedRightsStatus: 'unknown',
      expectedVisibility: 'private',
      expectedSubject: { type: 'entity', id: entityId },
      action: 'approve_public',
      targetMatch: 'confirmed',
      privacyReview: 'cleared',
      publicDisplayFileId: displayFileId,
      publicThumbnailFileId: thumbnailFileId,
      altText: 'Exterior of Example Merchant.',
      displayOrder: 0,
    });
    expect(body.expectedFiles).toEqual(
      detail().files.map((file) => ({
        id: file.id,
        variant: file.variant,
        storageScope: file.storageScope,
        storageKey: file.storageKey,
        mimeType: file.mimeType,
        contentHash: file.contentHash,
        width: file.width,
        height: file.height,
      })),
    );
  });
});
