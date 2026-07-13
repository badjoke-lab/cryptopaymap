import { describe, expect, it, vi } from 'vitest';
import { createReportDetailHandler } from '../functions/admin/api/reports/[submissionId]';
import { createReportQueueHandler } from '../functions/admin/api/reports';
import type { ReportSubmissionReviewDetailResponse } from '../src/admin/submissions/report-detail';
import type { ReportSubmissionQueueResponse } from '../src/admin/submissions/report-queue';

const submissionId = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-13T04:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human' as const,
  subject: 'reviewer-subject',
  email: 'reviewer@example.com',
};

function queueResponse(): ReportSubmissionQueueResponse {
  return {
    generatedAt: now.toISOString(),
    items: [
      {
        id: submissionId,
        publicId: 'CPM-S-2026-000001',
        reportKind: 'problem_report',
        targetType: 'entity',
        targetId: entityId,
        paymentResult: null,
        problemType: 'privacy_issue',
        workflowStatus: 'received',
        priority: 100,
        evidenceCount: 0,
        submittedAt: '2026-07-13T03:00:00.000Z',
        updatedAt: '2026-07-13T03:00:00.000Z',
      },
    ],
    hasNextPage: false,
    nextCursor: null,
  };
}

function detailResponse(): ReportSubmissionReviewDetailResponse {
  return {
    generatedAt: now.toISOString(),
    submission: {
      id: submissionId,
      publicId: 'CPM-S-2026-000001',
      submissionType: 'problem_report',
      targetType: 'entity',
      targetId: entityId,
      workflowStatus: 'received',
      resolution: null,
      priority: 100,
      submittedAt: '2026-07-13T03:00:00.000Z',
      updatedAt: '2026-07-13T03:00:00.000Z',
    },
    projection: {
      reportKind: 'problem_report',
      targetType: 'entity',
      targetId: entityId,
      reportType: 'privacy_issue',
      observedAt: '2026-07-12',
      explanation: 'The public page appears to disclose personal information.',
      proposedCorrection: null,
      duplicateTarget: null,
      evidenceLinks: [],
      restrictedEvidence: { privateEvidenceUrlPresent: true },
    },
    events: [],
    eventsTruncated: false,
    targetContext: {
      generatedAt: now.toISOString(),
      target: {
        targetType: 'entity',
        targetId: entityId,
        canonicalPath: '/service/example-service',
        entity: {
          id: entityId,
          entityType: 'online_service',
          name: 'Example Service',
          slug: 'example-service',
          websiteUrl: 'https://service.example/',
          countryCode: 'US',
          entityStatus: 'active',
          visibility: 'public',
          updatedAt: '2026-07-12T00:00:00.000Z',
        },
        location: null,
        selectedClaimId: null,
      },
      reportability: { publiclyReachable: true, reasons: [] },
      claimSignals: [],
      coverage: {
        targetLookupComplete: true,
        claimContextComplete: true,
        absenceIsConclusive: false,
      },
    },
  };
}

function queueContext(overrides: { identity?: unknown; subjects?: string } = {}) {
  return {
    request: new Request('https://example.test/admin/api/reports'),
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
    request: new Request(`https://example.test/admin/api/reports/${submissionId}`),
    env: {
      CPM_ADMIN_SUBMISSION_SUBJECTS: overrides.subjects ?? JSON.stringify(['reviewer-subject']),
    },
    params: { submissionId: overrides.submissionId ?? submissionId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

describe('P5-03D protected report reviewer APIs', () => {
  it('returns a private no-store report queue for an authorized subject', async () => {
    const loadQueue = vi.fn(async () => queueResponse());
    const response = await createReportQueueHandler({ loadQueue, now: () => now })(queueContext());

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

  it('denies report queue access before the loader runs', async () => {
    const loadQueue = vi.fn(async () => queueResponse());
    const response = await createReportQueueHandler({ loadQueue })(
      queueContext({ identity: null }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'report_queue_denied' });
    expect(loadQueue).not.toHaveBeenCalled();
  });

  it('returns unavailable when report authorization is not configured', async () => {
    const loadQueue = vi.fn(async () => queueResponse());
    const response = await createReportQueueHandler({ loadQueue })(queueContext({ subjects: '' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'report_queue_unavailable' });
    expect(loadQueue).not.toHaveBeenCalled();
  });

  it('returns one protected report detail for an authorized subject', async () => {
    const loadDetail = vi.fn(async () => detailResponse());
    const response = await createReportDetailHandler({ loadDetail, now: () => now })(
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

  it('rejects a non-string report detail parameter before the loader runs', async () => {
    const loadDetail = vi.fn(async () => detailResponse());
    const response = await createReportDetailHandler({ loadDetail })(
      detailContext({ submissionId: [submissionId] }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'report_detail_invalid_id' });
    expect(loadDetail).not.toHaveBeenCalled();
  });

  it('returns a generic unavailable response without leaking backend detail', async () => {
    const response = await createReportDetailHandler({
      loadDetail: vi.fn(async () => {
        throw new Error('private database detail');
      }),
    })(detailContext());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'report_detail_unavailable' });
  });
});
