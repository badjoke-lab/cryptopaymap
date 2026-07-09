import {
  loadEvidenceReviewDetail,
  loadEvidenceReviewQueue,
  parseEvidenceReviewQueueQuery,
  type EvidenceReviewDetailResponse,
  type EvidenceReviewQueueItem,
  type EvidenceReviewReadContext,
  type EvidenceReviewWorkspaceBackend,
} from '../src/admin/evidence-review/workspace';

const now = new Date('2026-07-02T00:00:00.000Z');
const evidenceId = '10000000-0000-4000-8000-000000000001';
const claimId = '20000000-0000-4000-8000-000000000001';
const claimAssetId = '30000000-0000-4000-8000-000000000001';
const context: EvidenceReviewReadContext = {
  actorId: 'system:workspace-check',
  actorType: 'system',
  capabilities: ['evidence:review'],
};

const detail: EvidenceReviewDetailResponse = {
  generatedAt: now.toISOString(),
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
    fetchedAt: now.toISOString(),
    summary: 'The merchant states that direct crypto payments are accepted.',
    attribution: null,
    independenceKey: null,
    updatedAt: '2026-07-01T12:00:00.000Z',
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
    updatedAt: '2026-07-01T12:00:00.000Z',
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

const queueItem: EvidenceReviewQueueItem = {
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

const backend: EvidenceReviewWorkspaceBackend = {
  async loadQueue() {
    return { items: [queueItem], hasMore: false };
  },
  async loadDetail() {
    return detail;
  },
};

const query = parseEvidenceReviewQueueQuery(
  new URL('https://example.test/admin/api/evidence?reviewStatus=pending&limit=25'),
);
const queue = await loadEvidenceReviewQueue(context, backend, query, now);
const loadedDetail = await loadEvidenceReviewDetail(context, backend, evidenceId, now);

if (
  queue.items.length !== 1 ||
  queue.items[0]?.id !== evidenceId ||
  loadedDetail.claim.id !== claimId ||
  loadedDetail.evidence.claimVisibility !== 'hidden'
) {
  throw new Error('Evidence review workspace contract produced an invalid result.');
}

console.log('Evidence review workspace checks passed.');