import { describe, expect, it, vi } from 'vitest';
import {
  EvidenceReviewWorkspaceError,
  loadEvidenceReviewDetail,
  loadEvidenceReviewQueue,
  parseEvidenceReviewQueueQuery,
  thresholdWithEvidenceIds,
  type EvidenceReviewDetailResponse,
  type EvidenceReviewReadContext,
  type EvidenceReviewWorkspaceBackend,
} from '../src/admin/evidence-review/workspace';

const context: EvidenceReviewReadContext = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human',
  capabilities: ['evidence:review'],
};
const now = new Date('2026-07-02T00:00:00.000Z');
const evidenceId = '10000000-0000-4000-8000-000000000001';
const claimId = '20000000-0000-4000-8000-000000000001';
const claimAssetId = '40000000-0000-4000-8000-000000000001';

function detail(): EvidenceReviewDetailResponse {
  return {
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
        networkSlug: 'lightning',
        networkStatus: 'active',
        paymentMethodSlug: 'lightning_invoice',
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

describe('Evidence review workspace contract', () => {
  it('parses bounded queue filters', () => {
    expect(
      parseEvidenceReviewQueueQuery(
        new URL(
          'https://example.test/admin/api/evidence?reviewStatus=pending&evidenceClass=a&limit=50',
        ),
      ),
    ).toEqual({ reviewStatus: 'pending', evidenceClass: 'a', limit: 50 });
  });

  it('rejects out-of-range queue limits', () => {
    expect(() =>
      parseEvidenceReviewQueueQuery(new URL('https://example.test/admin/api/evidence?limit=500')),
    ).toThrow(EvidenceReviewWorkspaceError);
  });

  it('loads a validated queue and payment-aware detail for an authorized reviewer', async () => {
    const backend: EvidenceReviewWorkspaceBackend = {
      loadQueue: vi.fn(async () => ({ items: [], hasMore: false })),
      loadDetail: vi.fn(async () => detail()),
    };

    await expect(
      loadEvidenceReviewQueue(context, backend, { reviewStatus: 'pending', limit: 25 }, now),
    ).resolves.toEqual({
      generatedAt: now.toISOString(),
      query: { reviewStatus: 'pending', limit: 25 },
      items: [],
      hasMore: false,
    });
    await expect(loadEvidenceReviewDetail(context, backend, evidenceId, now)).resolves.toEqual(
      detail(),
    );
  });

  it('rejects invalid Evidence identifiers before backend access', async () => {
    const backend: EvidenceReviewWorkspaceBackend = {
      loadQueue: vi.fn(async () => ({ items: [], hasMore: false })),
      loadDetail: vi.fn(async () => detail()),
    };

    await expect(
      loadEvidenceReviewDetail(context, backend, 'not-a-uuid', now),
    ).rejects.toMatchObject({
      code: 'invalid_evidence_id',
    });
    expect(backend.loadDetail).not.toHaveBeenCalled();
  });

  it('maps threshold indexes to accepted Evidence IDs', () => {
    expect(
      thresholdWithEvidenceIds(
        {
          eligible: true,
          basis: 'independent_b_pair',
          supportingIndexes: [0, 2],
          latestContradictionAt: null,
        },
        [
          '30000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000002',
          '30000000-0000-4000-8000-000000000003',
        ],
      ),
    ).toEqual({
      eligible: true,
      basis: 'independent_b_pair',
      supportingEvidenceIds: [
        '30000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000003',
      ],
      latestContradictionAt: null,
    });
  });
});
