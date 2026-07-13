import { describe, expect, it } from 'vitest';
import type { SubmissionReviewContext } from '../src/admin/submissions/authorization';
import {
  loadReportSubmissionReviewDetail,
  reportSubmissionReviewDetailResponseSchema,
  type ReportSubmissionReviewDetailData,
} from '../src/admin/submissions/report-detail';
import {
  loadReportSubmissionQueue,
  reportSubmissionQueueQuerySchema,
  type ReportSubmissionQueuePageData,
} from '../src/admin/submissions/report-queue';
import type { ReportCanonicalTargetMaterial } from '../src/submissions/report-target-context';

const context: SubmissionReviewContext = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human',
  capabilities: ['submission:read'],
};
const submissionId = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const claimId = '30000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-13T04:00:00.000Z');

function queuePage(): ReportSubmissionQueuePageData {
  return {
    items: [
      {
        id: submissionId,
        publicId: 'CPM-S-2026-000001',
        reportKind: 'payment_report',
        targetType: 'entity',
        targetId: entityId,
        paymentResult: 'successful',
        problemType: null,
        workflowStatus: 'received',
        priority: 20,
        evidenceCount: 1,
        submittedAt: '2026-07-13T03:00:00.000Z',
        updatedAt: '2026-07-13T03:00:00.000Z',
      },
    ],
    hasNextPage: false,
    nextCursor: null,
  };
}

function detailData(): ReportSubmissionReviewDetailData {
  return {
    submission: {
      id: submissionId,
      publicId: 'CPM-S-2026-000001',
      submissionType: 'payment_report',
      targetType: 'entity',
      targetId: entityId,
      workflowStatus: 'received',
      resolution: null,
      priority: 20,
      submittedAt: '2026-07-13T03:00:00.000Z',
      updatedAt: '2026-07-13T03:00:00.000Z',
    },
    projection: {
      reportKind: 'payment_report',
      targetType: 'entity',
      targetId: entityId,
      result: 'successful',
      paymentDate: '2026-07-12',
      payment: {
        assetSlug: 'btc',
        networkSlug: 'bitcoin',
        routeType: 'direct_wallet',
        paymentMethod: 'onchain',
        processor: null,
        context: 'hosted_checkout',
        observedSteps: 'Selected Bitcoin and paid the displayed invoice.',
      },
      notes: null,
      evidenceLinks: [
        {
          url: 'https://service.example/help/payments',
          observedAt: '2026-07-12',
          summary: 'Official payment instructions.',
        },
      ],
      restrictedEvidence: { privateTransactionUrlPresent: true },
    },
    events: [
      {
        fromStatus: null,
        toStatus: 'received',
        action: 'submission_received',
        reasonCode: null,
        actorType: 'submitter',
        createdAt: '2026-07-13T03:00:00.000Z',
      },
    ],
    eventsTruncated: false,
  };
}

function targetMaterial(): ReportCanonicalTargetMaterial {
  return {
    targetType: 'entity',
    targetId: entityId,
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
    claims: [
      {
        id: claimId,
        entityId,
        locationId: null,
        claimScope: 'online_service',
        routeType: 'direct_wallet',
        acceptanceScope: 'all_checkout',
        claimStatus: 'confirmed',
        visibility: 'public',
        processorName: null,
        howToPay: 'Select Bitcoin during checkout.',
        restrictions: null,
        firstConfirmedAt: '2026-01-01T00:00:00.000Z',
        lastConfirmedAt: '2026-07-12T00:00:00.000Z',
        nextReviewAt: '2027-01-08T00:00:00.000Z',
        endedAt: null,
        updatedAt: '2026-07-12T00:00:00.000Z',
        options: [
          {
            assetSlug: 'btc',
            networkSlug: 'bitcoin',
            paymentMethod: 'onchain',
            isPrimary: true,
          },
        ],
      },
    ],
    selectedClaimId: null,
  };
}

describe('P5-03D report Submission reviewer contracts', () => {
  it('loads a bounded report queue for an authorized reviewer', async () => {
    const response = await loadReportSubmissionQueue(
      context,
      {
        async loadPage() {
          return queuePage();
        },
      },
      reportSubmissionQueueQuerySchema.parse({}),
      now,
    );

    expect(response.generatedAt).toBe(now.toISOString());
    expect(response.items[0]).toMatchObject({
      reportKind: 'payment_report',
      paymentResult: 'successful',
      targetId: entityId,
    });
  });

  it('rejects queue access without the Submission read capability', async () => {
    const unauthorized = {
      actorId: 'actor',
      actorType: 'human',
      capabilities: [],
    } as unknown as SubmissionReviewContext;

    await expect(
      loadReportSubmissionQueue(
        unauthorized,
        {
          async loadPage() {
            return queuePage();
          },
        },
        reportSubmissionQueueQuerySchema.parse({}),
        now,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('loads normalized report detail and composes read-only target context', async () => {
    const response = await loadReportSubmissionReviewDetail(
      context,
      {
        async loadDetail() {
          return detailData();
        },
      },
      {
        async loadTarget() {
          return targetMaterial();
        },
      },
      submissionId,
      now,
    );

    expect(response.projection.reportKind).toBe('payment_report');
    expect(response.targetContext.target.canonicalPath).toBe('/service/example-service');
    expect(response.targetContext.claimSignals).toEqual([
      {
        claimId,
        claimStatus: 'confirmed',
        visibility: 'public',
        reasons: [
          'target_level_claim_context',
          'same_route_type',
          'same_asset',
          'same_network',
          'same_payment_method',
        ],
      },
    ]);
    expect(response.targetContext.coverage.absenceIsConclusive).toBe(false);
  });

  it('fails closed when stored metadata does not match the normalized report', async () => {
    const invalid = detailData();
    invalid.submission.targetId = claimId;

    await expect(
      loadReportSubmissionReviewDetail(
        context,
        {
          async loadDetail() {
            return invalid;
          },
        },
        {
          async loadTarget() {
            return targetMaterial();
          },
        },
        submissionId,
        now,
      ),
    ).rejects.toMatchObject({ code: 'invalid_detail' });
  });

  it('strictly rejects protected operational fields in the reviewer response', () => {
    const candidate = {
      ...detailData(),
      targetContext: {
        generatedAt: now.toISOString(),
        target: {
          targetType: 'entity',
          targetId: entityId,
          canonicalPath: '/service/example-service',
          entity: targetMaterial().entity,
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
      generatedAt: now.toISOString(),
      originalPayload: { private: true },
      contact: { encryptedEmail: 'ciphertext' },
      statusTokenHash: `sha256:${'0'.repeat(64)}`,
      internalNote: 'private reviewer note',
    };

    expect(reportSubmissionReviewDetailResponseSchema.safeParse(candidate).success).toBe(false);
  });
});
