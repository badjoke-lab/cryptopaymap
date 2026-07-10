import { describe, expect, it, vi } from 'vitest';
import { createSubmissionDetailHandler } from '../functions/admin/api/submissions/[submissionId]';
import { createSubmissionQueueHandler } from '../functions/admin/api/submissions';
import type { SuggestSubmissionReviewDetailResponse } from '../src/admin/submissions/detail';
import type { SuggestSubmissionQueueResponse } from '../src/admin/submissions/queue';

const submissionId = '10000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-10T02:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human' as const,
  subject: 'reviewer-subject',
  email: 'reviewer@example.com',
};

function queueResponse(): SuggestSubmissionQueueResponse {
  return {
    generatedAt: now.toISOString(),
    items: [
      {
        id: submissionId,
        publicId: 'CPM-S-2026-000001',
        suggestionKind: 'physical_place',
        name: 'Example Coffee',
        workflowStatus: 'received',
        priority: 0,
        relationship: 'customer',
        evidenceCount: 1,
        submittedAt: '2026-07-10T01:00:00.000Z',
        updatedAt: '2026-07-10T01:00:00.000Z',
      },
    ],
    hasNextPage: false,
    nextCursor: null,
  };
}

function detailResponse(): SuggestSubmissionReviewDetailResponse {
  return {
    generatedAt: now.toISOString(),
    submission: {
      id: submissionId,
      publicId: 'CPM-S-2026-000001',
      workflowStatus: 'received',
      resolution: null,
      priority: 0,
      relationship: 'customer',
      submittedAt: '2026-07-10T01:00:00.000Z',
      updatedAt: '2026-07-10T01:00:00.000Z',
    },
    projection: {
      suggestionKind: 'physical_place',
      entityType: 'merchant',
      entity: {
        name: 'Example Coffee',
        legalName: null,
        websiteUrl: 'https://coffee.example/',
        countryCode: 'JP',
      },
      place: {
        branchName: 'Shibuya',
        addressLine: '1-2-3 Jingumae',
        locality: 'Shibuya',
        region: 'Tokyo',
        postalCode: '150-0001',
        countryCode: 'JP',
        latitude: 35.6695,
        longitude: 139.7026,
        websiteUrl: null,
        phone: null,
        description: null,
        openingHours: null,
        amenities: [],
        socialLinks: [],
      },
      categories: [],
      paymentProposals: [
        {
          assetSlug: 'btc',
          networkSlug: 'bitcoin',
          routeType: 'direct_wallet',
          paymentMethod: 'onchain',
          processor: null,
          contractAddress: null,
          howToPay: 'Ask for a QR code.',
          restrictions: null,
          isPrimary: true,
        },
      ],
      observedAt: '2026-07-01',
      relationship: 'customer',
      evidenceLinks: [],
    },
    signals: {
      generatedAt: now.toISOString(),
      candidateSignals: [],
      canonicalTargetSignals: [],
      coverage: {
        candidateSearchComplete: true,
        canonicalSearchComplete: true,
        absenceIsConclusive: false,
      },
    },
    events: [],
    eventsTruncated: false,
  };
}

function queueContext(overrides: { identity?: unknown; subjects?: string } = {}) {
  return {
    request: new Request('https://example.test/admin/api/submissions'),
    env: {
      CPM_ADMIN_SUBMISSION_SUBJECTS: overrides.subjects ?? JSON.stringify(['reviewer-subject']),
    },
    params: {},
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

function detailContext(
  overrides: { identity?: unknown; subjects?: string; submissionId?: string | string[] } = {},
) {
  return {
    request: new Request(`https://example.test/admin/api/submissions/${submissionId}`),
    env: {
      CPM_ADMIN_SUBMISSION_SUBJECTS: overrides.subjects ?? JSON.stringify(['reviewer-subject']),
    },
    params: { submissionId: overrides.submissionId ?? submissionId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

describe('P5-02D protected Suggest Submission reviewer APIs', () => {
  it('returns a private no-store Suggest queue for an authorized subject', async () => {
    const loadQueue = vi.fn(async () => queueResponse());
    const response = await createSubmissionQueueHandler({ loadQueue, now: () => now })(
      queueContext(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    await expect(response.json()).resolves.toEqual(queueResponse());
    expect(loadQueue).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:read'],
      },
      expect.any(Object),
      expect.any(Object),
      now,
    );
  });

  it('denies queue access before the loader runs', async () => {
    const loadQueue = vi.fn(async () => queueResponse());
    const response = await createSubmissionQueueHandler({ loadQueue })(
      queueContext({ identity: null }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'submission_queue_denied' });
    expect(loadQueue).not.toHaveBeenCalled();
  });

  it('returns unavailable when Submission authorization is not configured', async () => {
    const loadQueue = vi.fn(async () => queueResponse());
    const response = await createSubmissionQueueHandler({ loadQueue })(
      queueContext({ subjects: '' }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'submission_queue_unavailable' });
    expect(loadQueue).not.toHaveBeenCalled();
  });

  it('returns one protected Suggest reviewer detail for an authorized subject', async () => {
    const loadDetail = vi.fn(async () => detailResponse());
    const response = await createSubmissionDetailHandler({ loadDetail, now: () => now })(
      detailContext(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual(detailResponse());
    expect(loadDetail).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:read'],
      },
      submissionId,
      expect.any(Object),
      now,
    );
  });

  it('rejects a non-string detail route parameter before the loader runs', async () => {
    const loadDetail = vi.fn(async () => detailResponse());
    const response = await createSubmissionDetailHandler({ loadDetail })(
      detailContext({ submissionId: [submissionId] }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'submission_detail_invalid_id' });
    expect(loadDetail).not.toHaveBeenCalled();
  });

  it('returns generic unavailable responses without leaking backend details', async () => {
    const response = await createSubmissionDetailHandler({
      loadDetail: vi.fn(async () => {
        throw new Error('private database detail');
      }),
    })(detailContext());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'submission_detail_unavailable' });
  });
});
