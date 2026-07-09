import { createEvidenceReviewDecisionService } from '../src/admin/evidence-review/decision';
import { InMemoryEvidenceReviewBackend } from '../src/admin/evidence-review/in-memory-backend';
import {
  loadEvidenceReviewDetail,
  loadEvidenceReviewQueue,
  type EvidenceReviewDetailResponse,
  type EvidenceReviewReadContext,
  type EvidenceReviewWorkspaceBackend,
} from '../src/admin/evidence-review/workspace';

const evidenceId = '10000000-0000-4000-8000-000000000001';
const claimId = '20000000-0000-4000-8000-000000000001';
const requestId = '30000000-0000-4000-8000-000000000001';
const claimAssetId = '40000000-0000-4000-8000-000000000001';
const reviewedAt = '2026-07-01T12:00:00.000Z';
const decidedAt = new Date('2026-07-02T00:00:00.000Z');
const context: EvidenceReviewReadContext = {
  actorId: 'system:evidence-integration-check',
  actorType: 'system',
  capabilities: ['evidence:review'],
};

const detail: EvidenceReviewDetailResponse = {
  generatedAt: decidedAt.toISOString(),
  evidence: {
    id: evidenceId,
    claimId,
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
    id: claimId,
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
      id: claimAssetId,
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

const queueItem = {
  id: detail.evidence.id,
  claimId: detail.evidence.claimId,
  claimStatus: detail.evidence.claimStatus,
  claimVisibility: detail.evidence.claimVisibility,
  evidenceKind: detail.evidence.evidenceKind,
  evidenceClass: detail.evidence.evidenceClass,
  sourceType: detail.evidence.sourceType,
  originRole: detail.evidence.originRole,
  polarity: detail.evidence.polarity,
  reviewStatus: detail.evidence.reviewStatus,
  visibility: detail.evidence.visibility,
  sourceName: detail.evidence.sourceName,
  sourceUrl: detail.evidence.sourceUrl,
  observedAt: detail.evidence.observedAt,
  publishedAt: detail.evidence.publishedAt,
  summary: detail.evidence.summary,
  updatedAt: detail.evidence.updatedAt,
};
const workspace: EvidenceReviewWorkspaceBackend = {
  async loadQueue() {
    return { items: [queueItem], hasMore: false };
  },
  async loadDetail() {
    return detail;
  },
};
const loadedQueue = await loadEvidenceReviewQueue(
  context,
  workspace,
  { reviewStatus: 'pending', limit: 25 },
  decidedAt,
);
const loadedDetail = await loadEvidenceReviewDetail(context, workspace, evidenceId, decidedAt);

const store = new InMemoryEvidenceReviewBackend({
  claims: [
    {
      id: claimId,
      claimStatus: 'candidate',
      visibility: 'hidden',
      updatedAt: reviewedAt,
      howToPay: detail.claim.howToPay,
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
      id: evidenceId,
      claimId,
      evidenceClass: 'a',
      originRole: 'merchant_side',
      polarity: 'supporting',
      reviewStatus: 'pending',
      observedAt: detail.evidence.observedAt,
      independenceKey: null,
      updatedAt: reviewedAt,
      deletedAt: null,
    },
  ],
});
const receipt = await createEvidenceReviewDecisionService(store).decide(
  {
    requestId,
    actorId: context.actorId,
    actorType: context.actorType,
    capabilities: ['evidence:review'],
  },
  {
    evidenceId,
    claimId,
    expectedEvidenceUpdatedAt: reviewedAt,
    expectedEvidenceReviewStatus: 'pending',
    expectedClaimUpdatedAt: reviewedAt,
    expectedClaimStatus: 'candidate',
    expectedClaimVisibility: 'hidden',
    expectedAcceptedEvidenceIds: [],
    expectedClaimAssetIds: [claimAssetId],
    decidedAt: decidedAt.toISOString(),
    disposition: 'accepted',
    finding: 'supports_claim',
    claimAction: 'confirm',
    reasonCode: 'threshold_met',
    publicSummary: 'The Evidence satisfies the confirmation threshold.',
    internalNote: null,
    nextReviewAt: '2026-08-01T00:00:00.000Z',
    endedReason: null,
  },
);

if (
  loadedQueue.items[0]?.id !== evidenceId ||
  loadedDetail.claim.updatedAt !== reviewedAt ||
  receipt.evidenceReviewStatus !== 'accepted' ||
  receipt.claimStatus !== 'confirmed' ||
  receipt.claimVisibility !== 'hidden' ||
  store.snapshot().decisions !== 1
) {
  throw new Error('Evidence review integration check produced an invalid result.');
}

console.log('Evidence review integration checks passed.');
