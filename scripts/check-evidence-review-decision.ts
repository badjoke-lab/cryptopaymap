import { createEvidenceReviewDecisionService } from '../src/admin/evidence-review/decision';
import { InMemoryEvidenceReviewBackend } from '../src/admin/evidence-review/in-memory-backend';

const claimId = '10000000-0000-4000-8000-000000000001';
const evidenceId = '20000000-0000-4000-8000-000000000001';
const requestId = '30000000-0000-4000-8000-000000000001';
const reviewedAt = '2026-07-01T00:00:00.000Z';
const decidedAt = '2026-07-02T00:00:00.000Z';
const nextReviewAt = '2026-08-01T00:00:00.000Z';

const backend = new InMemoryEvidenceReviewBackend({
  claims: [
    {
      id: claimId,
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
      id: evidenceId,
      claimId,
      evidenceClass: 'a',
      originRole: 'merchant_side',
      polarity: 'supporting',
      reviewStatus: 'pending',
      observedAt: reviewedAt,
      independenceKey: null,
      updatedAt: reviewedAt,
      deletedAt: null,
    },
  ],
});

const receipt = await createEvidenceReviewDecisionService(backend).decide(
  {
    requestId,
    actorId: 'system:contract-check',
    actorType: 'system',
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
    expectedClaimAssetIds: [],
    decidedAt,
    disposition: 'accepted',
    finding: 'supports_claim',
    claimAction: 'confirm',
    reasonCode: 'threshold_met',
    publicSummary: 'The Evidence satisfies the confirmation threshold.',
    internalNote: null,
    nextReviewAt,
    endedReason: null,
  },
);

if (
  receipt.evidenceReviewStatus !== 'accepted' ||
  receipt.claimStatus !== 'confirmed' ||
  receipt.claimVisibility !== 'hidden' ||
  receipt.verificationEventType !== 'confirmed'
) {
  throw new Error('Evidence review decision contract produced an invalid receipt.');
}

console.log('Evidence review decision checks passed.');