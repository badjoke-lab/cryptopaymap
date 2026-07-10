import { describe, expect, it } from 'vitest';
import {
  loadSuggestSubmissionReviewDetail,
  suggestSubmissionReviewDetailResponseSchema,
  type SuggestSubmissionReviewDetailData,
} from '../src/admin/submissions/detail';
import {
  loadSuggestSubmissionQueue,
  suggestSubmissionQueueQuerySchema,
  type SuggestSubmissionQueuePageData,
} from '../src/admin/submissions/queue';

const context = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human' as const,
  capabilities: ['submission:read'] as const,
};
const submissionId = '10000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-10T02:00:00.000Z');

function queuePage(): SuggestSubmissionQueuePageData {
  return {
    items: [
      {
        id: submissionId,
        publicId: 'CPM-S-2026-000001',
        suggestionKind: 'online_service',
        name: 'Example Hosting',
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

function detailData(): SuggestSubmissionReviewDetailData {
  return {
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
      suggestionKind: 'online_service',
      entityType: 'online_service',
      entity: {
        name: 'Example Hosting',
        legalName: null,
        websiteUrl: 'https://hosting.example/',
        countryCode: 'US',
      },
      place: null,
      categories: [],
      paymentProposals: [
        {
          assetSlug: 'usdc',
          networkSlug: 'base',
          routeType: 'processor_checkout',
          paymentMethod: 'processor_checkout',
          processor: { name: 'Processor', websiteUrl: null },
          contractAddress: null,
          howToPay: 'Choose crypto during hosted checkout.',
          restrictions: null,
          isPrimary: true,
        },
      ],
      observedAt: '2026-07-01',
      relationship: 'customer',
      evidenceLinks: [
        {
          url: 'https://hosting.example/help/payments',
          observedAt: '2026-07-01',
          summary: 'Official payment information.',
        },
      ],
    },
    events: [
      {
        fromStatus: null,
        toStatus: 'received',
        action: 'submission_received',
        reasonCode: null,
        actorType: 'submitter',
        createdAt: '2026-07-10T01:00:00.000Z',
      },
    ],
    eventsTruncated: false,
  };
}

describe('P5-02D Suggest Submission reviewer contracts', () => {
  it('loads a bounded Suggest queue for an authorized Submission reviewer', async () => {
    const query = suggestSubmissionQueueQuerySchema.parse({});
    const response = await loadSuggestSubmissionQueue(
      context,
      { async loadPage() { return queuePage(); } },
      query,
      now,
    );

    expect(response.generatedAt).toBe(now.toISOString());
    expect(response.items[0]).toMatchObject({
      publicId: 'CPM-S-2026-000001',
      suggestionKind: 'online_service',
      name: 'Example Hosting',
    });
  });

  it('rejects queue access without the Submission read capability', async () => {
    await expect(
      loadSuggestSubmissionQueue(
        { actorId: 'actor', actorType: 'human', capabilities: [] as never[] },
        { async loadPage() { return queuePage(); } },
        suggestSubmissionQueueQuerySchema.parse({}),
        now,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('loads normalized Suggest detail and composes P5-02C signals', async () => {
    const response = await loadSuggestSubmissionReviewDetail(
      context,
      { async loadDetail() { return detailData(); } },
      {
        candidateBackend: {
          async searchCandidateSignalMaterial() {
            return [];
          },
        },
        canonicalTargetBackend: {
          async searchTargets() {
            return [];
          },
        },
      },
      submissionId,
      now,
    );

    expect(response.projection.entity.name).toBe('Example Hosting');
    expect(response.events).toHaveLength(1);
    expect(response.signals).toMatchObject({
      candidateSignals: [],
      canonicalTargetSignals: [],
      coverage: { absenceIsConclusive: false },
    });
  });

  it('rejects invalid normalized projection shapes instead of exposing them', async () => {
    const invalid = detailData();
    invalid.projection = {
      ...invalid.projection,
      entityType: 'merchant',
    };

    await expect(
      loadSuggestSubmissionReviewDetail(
        context,
        { async loadDetail() { return invalid; } },
        {
          candidateBackend: { async searchCandidateSignalMaterial() { return []; } },
          canonicalTargetBackend: { async searchTargets() { return []; } },
        },
        submissionId,
        now,
      ),
    ).rejects.toMatchObject({ code: 'invalid_detail' });
  });

  it('strictly rejects private operational fields in the reviewer response contract', () => {
    const candidate = {
      ...detailData(),
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
      generatedAt: now.toISOString(),
      contact: { encryptedEmail: 'ciphertext' },
      originalPayload: { private: true },
      statusTokenHash: `sha256:${'0'.repeat(64)}`,
      requestFingerprint: 'a'.repeat(64),
      internalNote: 'private reviewer note',
    };

    expect(suggestSubmissionReviewDetailResponseSchema.safeParse(candidate).success).toBe(false);
  });
});
