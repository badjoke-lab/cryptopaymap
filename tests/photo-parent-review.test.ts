import { describe, expect, it, vi } from 'vitest';
import { createPhotoDetailHandler } from '../functions/admin/api/photo-submissions/[submissionId]';
import { createPhotoQueueHandler } from '../functions/admin/api/photo-submissions';
import type { SubmissionReviewContext } from '../src/admin/submissions/authorization';
import {
  loadPhotoSubmissionDetail,
  loadPhotoSubmissionQueue,
  type PhotoSubmissionDetailData,
  type PhotoSubmissionQueuePageData,
} from '../src/admin/submissions/photo-parent';

const submissionId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';
const uploadId = '30000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-15T17:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human' as const,
  subject: 'reviewer-subject',
  email: 'reviewer@example.com',
};
const reviewContext: SubmissionReviewContext = {
  actorId: identity.actorId,
  actorType: identity.actorType,
  capabilities: ['submission:read'],
};

function queuePage(): PhotoSubmissionQueuePageData {
  return {
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
        updatedAt: '2026-07-15T16:00:00.000Z',
      },
    ],
    hasNextPage: false,
    nextCursor: null,
  };
}

function detailData(): PhotoSubmissionDetailData {
  return {
    submission: {
      id: submissionId,
      publicId: 'CPM-S-2026-000001',
      submissionType: 'photos',
      targetType: 'location',
      targetId,
      workflowStatus: 'received',
      resolution: null,
      priority: 50,
      submittedAt: '2026-07-15T16:00:00.000Z',
      updatedAt: '2026-07-15T16:00:00.000Z',
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

function pagesContext(url: string, submissionIdParam: string | string[] = submissionId) {
  return {
    request: new Request(url),
    env: {
      CPM_ADMIN_SUBMISSION_SUBJECTS: JSON.stringify(['reviewer-subject']),
    },
    params: { submissionId: submissionIdParam },
    data: { adminIdentity: identity },
    waitUntil: vi.fn(),
  };
}

describe('P5-06B2B Photos parent review', () => {
  it('loads a bounded Photos parent queue and detail without storage values', async () => {
    const queue = await loadPhotoSubmissionQueue(
      reviewContext,
      { loadPage: vi.fn(async () => queuePage()) },
      { statuses: ['received'], limit: 25, cursor: null },
      now,
    );
    expect(queue).toEqual({ ...queuePage(), generatedAt: now.toISOString() });

    const detail = await loadPhotoSubmissionDetail(
      reviewContext,
      { loadDetail: vi.fn(async () => detailData()) },
      submissionId,
      now,
    );
    expect(detail.submission.submissionType).toBe('photos');
    expect(detail.projection.media).toHaveLength(1);
    expect(JSON.stringify(detail)).not.toContain('storageKey');
    expect(JSON.stringify(detail)).not.toContain('signedUrl');
  });

  it('exposes protected queue and detail APIs with bounded errors', async () => {
    const loadQueue = vi.fn(async () => ({ ...queuePage(), generatedAt: now.toISOString() }));
    const queueResponse = await createPhotoQueueHandler({ loadQueue, now: () => now })(
      pagesContext('https://example.test/admin/api/photo-submissions'),
    );
    expect(queueResponse.status).toBe(200);
    expect(queueResponse.headers.get('cache-control')).toBe('private, no-store');
    expect(loadQueue).toHaveBeenCalledWith(
      reviewContext,
      expect.any(Object),
      expect.any(Object),
      now,
    );

    const loadDetail = vi.fn(async () => ({ ...detailData(), generatedAt: now.toISOString() }));
    const detailResponse = await createPhotoDetailHandler({ loadDetail, now: () => now })(
      pagesContext(`https://example.test/admin/api/photo-submissions/${submissionId}`),
    );
    expect(detailResponse.status).toBe(200);
    expect(loadDetail).toHaveBeenCalledWith(reviewContext, submissionId, expect.any(Object), now);

    const invalid = await createPhotoDetailHandler({ loadDetail })(
      pagesContext('https://example.test/admin/api/photo-submissions/invalid', [submissionId]),
    );
    expect(invalid.status).toBe(400);
    expect(loadDetail).toHaveBeenCalledTimes(1);
  });
});
