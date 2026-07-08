import { describe, expect, it, vi } from 'vitest';
import {
  createEvidenceDetailGetHandler,
  createEvidenceDetailPostHandler,
} from '../functions/admin/api/evidence/[evidenceId]';
import {
  EvidenceReviewDecisionError,
  type EvidenceReviewDecisionReceipt,
} from '../src/admin/evidence-review/decision';
import type { EvidenceReviewDetailResponse } from '../src/admin/evidence-review/workspace';

const evidenceId = '10000000-0000-4000-8000-000000000001';
const claimId = '20000000-0000-4000-8000-000000000001';
const requestId = '30000000-0000-4000-8000-000000000001';
const claimAssetId = '40000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-02T00:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human' as const,
  subject: 'reviewer-subject',
  email: 'reviewer@example.test',
};

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

function receipt(): EvidenceReviewDecisionReceipt {
  return {
    requestId,
    evidenceId,
    claimId,
    disposition: 'accepted',
    finding: 'supports_claim',
    claimAction: 'confirm',
    evidenceReviewStatus: 'accepted',
    claimStatus: 'confirmed',
    claimVisibility: 'hidden',
    verificationEventType: 'confirmed',
    decidedAt: now.toISOString(),
    state: 'committed',
  };
}

function context(method = 'GET', key: string | null = requestId) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (key !== null) headers.set('Idempotency-Key', key);
  const requestBody = {
    claimId,
    expectedEvidenceUpdatedAt: '2026-07-01T12:00:00.000Z',
    expectedEvidenceReviewStatus: 'pending',
    expectedClaimUpdatedAt: '2026-07-01T12:00:00.000Z',
    expectedClaimStatus: 'candidate',
    expectedClaimVisibility: 'hidden',
    expectedAcceptedEvidenceIds: [],
    expectedClaimAssetIds: [claimAssetId],
    disposition: 'accepted',
    finding: 'supports_claim',
    claimAction: 'confirm',
    reasonCode: 'threshold_met',
    publicSummary: 'The Evidence supports confirmation.',
    internalNote: null,
    nextReviewAt: '2026-08-01T00:00:00.000Z',
    endedReason: null,
  };
  const init: RequestInit = {
    method,
    headers,
    ...(method === 'POST' ? { body: JSON.stringify(requestBody) } : {}),
  };
  return {
    request: new Request(`https://example.test/admin/api/evidence/${evidenceId}`, init),
    env: { CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS: JSON.stringify(['reviewer-subject']) },
    params: { evidenceId },
    data: { adminIdentity: identity },
    waitUntil: vi.fn(),
  };
}

describe('protected Evidence detail endpoint', () => {
  it('loads a validated detail', async () => {
    const loadDetail = vi.fn(async () => detail());
    const response = await createEvidenceDetailGetHandler({ loadDetail, now: () => now })(
      context(),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(detail());
    expect(loadDetail).toHaveBeenCalled();
  });

  it('commits a decision with the isolated mutation context and exact payment set', async () => {
    const writeDecision = vi.fn(async () => receipt());
    const response = await createEvidenceDetailPostHandler({ writeDecision, now: () => now })(
      context('POST'),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(receipt());
    expect(writeDecision).toHaveBeenCalledWith(
      expect.objectContaining({ requestId, capabilities: ['evidence:review'] }),
      evidenceId,
      expect.objectContaining({
        claimId,
        expectedAcceptedEvidenceIds: [],
        expectedClaimAssetIds: [claimAssetId],
      }),
      expect.any(Object),
      now,
    );
  });

  it('requires an idempotency key', async () => {
    const writeDecision = vi.fn(async () => receipt());
    const response = await createEvidenceDetailPostHandler({ writeDecision })(
      context('POST', null),
    );
    expect(response.status).toBe(400);
    expect(writeDecision).not.toHaveBeenCalled();
  });

  it('returns conflict for changed reviewed state', async () => {
    const response = await createEvidenceDetailPostHandler({
      writeDecision: vi.fn(async () => {
        throw new EvidenceReviewDecisionError('conflict', 'Changed.', [
          'Evidence version changed.',
        ]);
      }),
    })(context('POST'));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'evidence_decision_conflict',
      issues: ['Evidence version changed.'],
    });
  });
});
