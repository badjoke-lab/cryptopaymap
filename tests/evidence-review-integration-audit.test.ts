import { describe, expect, it, vi } from 'vitest';
import { createEvidenceQueueHandler } from '../functions/admin/api/evidence';
import {
  createEvidenceDetailGetHandler,
  createEvidenceDetailPostHandler,
} from '../functions/admin/api/evidence/[evidenceId]';
import {
  createEvidenceReviewDecisionService,
  type EvidenceReviewDecisionInput,
} from '../src/admin/evidence-review/decision';
import { InMemoryEvidenceReviewBackend } from '../src/admin/evidence-review/in-memory-backend';
import type {
  EvidenceReviewDetailResponse,
  EvidenceReviewQueueResponse,
} from '../src/admin/evidence-review/workspace';

const ids = {
  evidence: '10000000-0000-4000-8000-000000000001',
  claim: '20000000-0000-4000-8000-000000000001',
  request: '30000000-0000-4000-8000-000000000001',
  claimAsset: '40000000-0000-4000-8000-000000000001',
} as const;
const reviewedAt = '2026-07-01T12:00:00.000Z';
const decidedAt = new Date('2026-07-02T00:00:00.000Z');
const nextReviewAt = '2026-08-01T00:00:00.000Z';
const identity = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human' as const,
  subject: 'reviewer-subject',
  email: 'reviewer@example.test',
};

function detail(): EvidenceReviewDetailResponse {
  return {
    generatedAt: decidedAt.toISOString(),
    evidence: {
      id: ids.evidence,
      claimId: ids.claim,
      claimStatus: 'candidate',
      claimVisibility: 'hidden',
      evidenceKind: 'official_payment_page',
      evidenceClass: 'a',
      sourceType: 'official_page',
      originRole: 'merchant_side',
      polarity: 'supporting',
      reviewStatus: 'pending',
      visibility: 'private',
      sourceName: 'Official payment page',
      sourceUrl: 'https://example.test/payments',
      archiveUrl: null,
      sourceNativeId: null,
      observedAt: '2026-07-01T00:00:00.000Z',
      publishedAt: null,
      fetchedAt: reviewedAt,
      summary: 'The merchant states that direct crypto payments are accepted.',
      attribution: null,
      independenceKey: null,
      updatedAt: reviewedAt,
    },
    claim: {
      id: ids.claim,
      claimStatus: 'candidate',
      visibility: 'hidden',
      routeType: 'direct_wallet',
      acceptanceScope: 'all_checkout',
      customerPaysCrypto: true,
      merchantExplicitlyAcceptsCrypto: true,
      howToPay: 'Scan the merchant wallet QR code.',
      merchantReceives: 'crypto',
      restrictions: null,
      firstConfirmedAt: null,
      lastConfirmedAt: null,
      nextReviewAt: null,
      endedAt: null,
      endedReason: null,
      updatedAt: reviewedAt,
    },
    paymentCombinations: [
      {
        id: ids.claimAsset,
        assetSymbol: 'BTC',
        assetStatus: 'active',
        networkSlug: 'bitcoin',
        networkStatus: 'active',
        paymentMethodSlug: 'onchain',
        paymentMethodStatus: 'active',
        isPrimary: true,
      },
    ],
    paymentPrerequisites: { eligible: true, issues: [] },
    acceptedEvidence: [],
    threshold: {
      eligible: false,
      basis: null,
      supportingEvidenceIds: [],
      latestContradictionAt: null,
    },
  };
}

function queue(): EvidenceReviewQueueResponse {
  const reviewed = detail();
  return {
    generatedAt: decidedAt.toISOString(),
    query: { reviewStatus: 'pending', limit: 25 },
    items: [
      {
        id: reviewed.evidence.id,
        claimId: reviewed.evidence.claimId,
        claimStatus: reviewed.evidence.claimStatus,
        claimVisibility: reviewed.evidence.claimVisibility,
        evidenceKind: reviewed.evidence.evidenceKind,
        evidenceClass: reviewed.evidence.evidenceClass,
        sourceType: reviewed.evidence.sourceType,
        originRole: reviewed.evidence.originRole,
        polarity: reviewed.evidence.polarity,
        reviewStatus: reviewed.evidence.reviewStatus,
        visibility: reviewed.evidence.visibility,
        sourceName: reviewed.evidence.sourceName,
        sourceUrl: reviewed.evidence.sourceUrl,
        observedAt: reviewed.evidence.observedAt,
        publishedAt: reviewed.evidence.publishedAt,
        summary: reviewed.evidence.summary,
        updatedAt: reviewed.evidence.updatedAt,
      },
    ],
    hasMore: false,
  };
}

function pagesContext(request: Request) {
  return {
    request,
    env: {
      CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS: JSON.stringify(['reviewer-subject']),
    },
    params: { evidenceId: ids.evidence },
    data: { adminIdentity: identity },
    waitUntil: vi.fn(),
  };
}

function decisionBody(reasonCode = 'threshold_met') {
  return {
    claimId: ids.claim,
    expectedEvidenceUpdatedAt: reviewedAt,
    expectedEvidenceReviewStatus: 'pending',
    expectedClaimUpdatedAt: reviewedAt,
    expectedClaimStatus: 'candidate',
    expectedClaimVisibility: 'hidden',
    expectedAcceptedEvidenceIds: [],
    expectedClaimAssetIds: [ids.claimAsset],
    disposition: 'accepted',
    finding: 'supports_claim',
    claimAction: 'confirm',
    reasonCode,
    publicSummary: 'The Evidence satisfies the confirmation threshold.',
    internalNote: null,
    nextReviewAt,
    endedReason: null,
  };
}

function decisionRequest(body: unknown, requestId = ids.request) {
  return new Request(`https://example.test/admin/api/evidence/${ids.evidence}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': requestId,
    },
    body: JSON.stringify(body),
  });
}

describe('P3-08 Evidence review integration audit', () => {
  it('moves one protected queue item through detail, decision, and replay without changing visibility', async () => {
    const store = new InMemoryEvidenceReviewBackend({
      claims: [
        {
          id: ids.claim,
          claimStatus: 'candidate',
          visibility: 'hidden',
          updatedAt: reviewedAt,
          howToPay: 'Scan the merchant wallet QR code.',
          customerPaysCrypto: true,
          merchantExplicitlyAcceptsCrypto: true,
          firstConfirmedAt: null,
          lastConfirmedAt: null,
          nextReviewAt: null,
          endedAt: null,
          endedReason: null,
          deletedAt: null,
        },
      ],
      evidence: [
        {
          id: ids.evidence,
          claimId: ids.claim,
          evidenceClass: 'a',
          originRole: 'merchant_side',
          polarity: 'supporting',
          reviewStatus: 'pending',
          observedAt: '2026-07-01T00:00:00.000Z',
          independenceKey: null,
          updatedAt: reviewedAt,
          deletedAt: null,
        },
      ],
    });
    const service = createEvidenceReviewDecisionService(store);
    const writeDecision = async (
      context: Parameters<typeof service.decide>[0],
      evidenceId: string,
      body: unknown,
      _environment: unknown,
      time: Date,
    ) =>
      service.decide(context, {
        ...(body as Omit<EvidenceReviewDecisionInput, 'evidenceId' | 'decidedAt'>),
        evidenceId,
        decidedAt: time.toISOString(),
      });

    const queueResponse = await createEvidenceQueueHandler({
      loadQueue: vi.fn(async () => queue()),
      now: () => decidedAt,
    })(pagesContext(new Request('https://example.test/admin/api/evidence')));
    expect(queueResponse.status).toBe(200);
    await expect(queueResponse.json()).resolves.toMatchObject({
      items: [expect.objectContaining({ id: ids.evidence, claimVisibility: 'hidden' })],
    });

    const detailResponse = await createEvidenceDetailGetHandler({
      loadDetail: vi.fn(async () => detail()),
      now: () => decidedAt,
    })(pagesContext(new Request(`https://example.test/admin/api/evidence/${ids.evidence}`)));
    expect(detailResponse.status).toBe(200);
    await expect(detailResponse.json()).resolves.toMatchObject({
      evidence: { id: ids.evidence, updatedAt: reviewedAt, claimVisibility: 'hidden' },
      claim: { id: ids.claim, updatedAt: reviewedAt, visibility: 'hidden' },
      paymentCombinations: [expect.objectContaining({ id: ids.claimAsset })],
      paymentPrerequisites: { eligible: true, issues: [] },
      acceptedEvidence: [],
    });

    const postHandler = createEvidenceDetailPostHandler({ writeDecision, now: () => decidedAt });
    const committed = await postHandler(pagesContext(decisionRequest(decisionBody())));
    expect(committed.status).toBe(200);
    await expect(committed.json()).resolves.toMatchObject({
      evidenceReviewStatus: 'accepted',
      claimStatus: 'confirmed',
      claimVisibility: 'hidden',
      verificationEventType: 'confirmed',
      state: 'committed',
    });

    const replayed = await postHandler(pagesContext(decisionRequest(decisionBody())));
    expect(replayed.status).toBe(200);
    await expect(replayed.json()).resolves.toMatchObject({ state: 'replayed' });

    const conflict = await postHandler(
      pagesContext(decisionRequest(decisionBody('changed_reason'))),
    );
    expect(conflict.status).toBe(409);
    expect(store.snapshot()).toMatchObject({
      claims: [expect.objectContaining({ claimStatus: 'confirmed', visibility: 'hidden' })],
      evidence: [expect.objectContaining({ reviewStatus: 'accepted' })],
      decisions: 1,
      verificationEvents: [expect.objectContaining({ eventType: 'confirmed' })],
    });
  });

  it('rejects attempts to add a visibility mutation to the strict decision payload', async () => {
    const response = await createEvidenceDetailPostHandler({
      writeDecision: async (context, evidenceId, body, _environment, time) =>
        createEvidenceReviewDecisionService(new InMemoryEvidenceReviewBackend()).decide(context, {
          ...(body as EvidenceReviewDecisionInput),
          evidenceId,
          decidedAt: time.toISOString(),
        }),
      now: () => decidedAt,
    })(
      pagesContext(
        decisionRequest({
          ...decisionBody(),
          claimVisibility: 'public',
        }),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'evidence_decision_invalid',
    });
  });
});
