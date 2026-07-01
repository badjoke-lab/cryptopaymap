import { describe, expect, it } from 'vitest';
import {
  authorizeEvidenceReview,
  readEvidenceReviewAuthorizationPolicy,
} from '../src/admin/evidence-review/authorization';
import {
  createEvidenceReviewDecisionService,
  type EvidenceReviewDecisionInput,
  type EvidenceReviewMutationContext,
} from '../src/admin/evidence-review/decision';
import {
  InMemoryEvidenceReviewBackend,
  type InMemoryEvidenceReviewBackendOptions,
} from '../src/admin/evidence-review/in-memory-backend';

const ids = {
  request: '10000000-0000-4000-8000-000000000001',
  claim: '20000000-0000-4000-8000-000000000001',
  evidence: '30000000-0000-4000-8000-000000000001',
  priorEvidence: '30000000-0000-4000-8000-000000000002',
} as const;
const reviewedAt = '2026-07-01T00:00:00.000Z';
const decidedAt = '2026-07-02T00:00:00.000Z';
const nextReviewAt = '2026-08-01T00:00:00.000Z';

const context: EvidenceReviewMutationContext = {
  requestId: ids.request,
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human',
  capabilities: ['evidence:review'],
};

function claim(
  status: 'candidate' | 'confirmed' | 'stale' | 'ended' | 'rejected' = 'candidate',
) {
  return {
    id: ids.claim,
    claimStatus: status,
    visibility: 'hidden' as const,
    updatedAt: reviewedAt,
    howToPay: 'Scan the merchant wallet QR code.',
    customerPaysCrypto: true,
    merchantExplicitlyAcceptsCrypto: true,
    firstConfirmedAt: status === 'candidate' ? null : '2026-06-01T00:00:00.000Z',
    lastConfirmedAt: status === 'candidate' ? null : reviewedAt,
    nextReviewAt: status === 'confirmed' || status === 'stale' ? nextReviewAt : null,
    endedAt: status === 'ended' ? reviewedAt : null,
    endedReason: status === 'ended' ? 'Acceptance ended.' : null,
    deletedAt: null,
  };
}

function evidence(
  polarity: 'supporting' | 'contradicting' | 'neutral' = 'supporting',
  evidenceClass: 'a' | 'b' | 'c' = 'a',
) {
  return {
    id: ids.evidence,
    claimId: ids.claim,
    evidenceClass,
    originRole: 'merchant_side' as const,
    polarity,
    reviewStatus: 'pending' as const,
    observedAt: evidenceClass === 'c' ? null : reviewedAt,
    independenceKey: evidenceClass === 'b' ? 'merchant-source' : null,
    updatedAt: reviewedAt,
    deletedAt: null,
  };
}

function priorAcceptedEvidence() {
  return {
    id: ids.priorEvidence,
    claimId: ids.claim,
    evidenceClass: 'a' as const,
    originRole: 'merchant_side' as const,
    polarity: 'supporting' as const,
    reviewStatus: 'accepted' as const,
    observedAt: '2026-06-15T00:00:00.000Z',
    independenceKey: null,
    updatedAt: '2026-06-15T00:00:00.000Z',
    deletedAt: null,
  };
}

function backend(options: Partial<InMemoryEvidenceReviewBackendOptions> = {}) {
  return new InMemoryEvidenceReviewBackend({
    claims: options.claims ?? [claim()],
    evidence: options.evidence ?? [evidence()],
    ...(options.failBeforeCommit ? { failBeforeCommit: options.failBeforeCommit } : {}),
  });
}

function input(
  overrides: Partial<EvidenceReviewDecisionInput> = {},
): EvidenceReviewDecisionInput {
  return {
    evidenceId: ids.evidence,
    claimId: ids.claim,
    expectedEvidenceUpdatedAt: reviewedAt,
    expectedEvidenceReviewStatus: 'pending',
    expectedClaimUpdatedAt: reviewedAt,
    expectedClaimStatus: 'candidate',
    expectedClaimVisibility: 'hidden',
    expectedAcceptedEvidenceIds: [],
    decidedAt,
    disposition: 'accepted',
    finding: 'supports_claim',
    claimAction: 'confirm',
    reasonCode: 'threshold_met',
    publicSummary: 'The reviewed Evidence satisfies the confirmation threshold.',
    internalNote: null,
    nextReviewAt,
    endedReason: null,
    ...overrides,
  };
}

describe('Evidence review authorization', () => {
  it('uses a separate subject allowlist and idempotency key', () => {
    const policy = readEvidenceReviewAuthorizationPolicy({
      CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS: JSON.stringify(['reviewer-subject']),
    });
    expect(
      authorizeEvidenceReview(
        {
          actorId: 'cloudflare-access:reviewer-subject',
          actorType: 'human',
          subject: 'reviewer-subject',
          email: 'reviewer@example.test',
        },
        policy,
        ids.request,
      ),
    ).toEqual(context);
  });

  it('rejects an identity outside the Evidence review allowlist', () => {
    const policy = readEvidenceReviewAuthorizationPolicy({
      CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS: JSON.stringify(['reviewer-subject']),
    });
    expect(() =>
      authorizeEvidenceReview(
        {
          actorId: 'cloudflare-access:other-subject',
          actorType: 'human',
          subject: 'other-subject',
          email: null,
        },
        policy,
        ids.request,
      ),
    ).toThrow('not authorized to review Evidence');
  });
});

describe('Evidence review decision contract', () => {
  it('accepts Class A supporting Evidence and confirms a candidate Claim', async () => {
    const store = backend();
    const receipt = await createEvidenceReviewDecisionService(store).decide(context, input());
    const snapshot = store.snapshot();

    expect(receipt).toMatchObject({
      disposition: 'accepted',
      finding: 'supports_claim',
      claimAction: 'confirm',
      evidenceReviewStatus: 'accepted',
      claimStatus: 'confirmed',
      claimVisibility: 'hidden',
      verificationEventType: 'confirmed',
      state: 'committed',
    });
    expect(snapshot.claims[0]).toMatchObject({
      claimStatus: 'confirmed',
      firstConfirmedAt: decidedAt,
      lastConfirmedAt: decidedAt,
      nextReviewAt,
      visibility: 'hidden',
    });
    expect(snapshot.evidence[0]).toMatchObject({
      reviewStatus: 'accepted',
      updatedAt: decidedAt,
    });
    expect(snapshot.verificationEvents).toHaveLength(1);
  });

  it('holds Evidence as pending without changing the Claim', async () => {
    const store = backend();
    const receipt = await createEvidenceReviewDecisionService(store).decide(
      context,
      input({
        disposition: 'held',
        finding: 'insufficient',
        claimAction: 'no_change',
        reasonCode: 'needs_more_information',
        publicSummary: null,
        internalNote: 'Awaiting a dated source capture.',
        nextReviewAt: null,
      }),
    );

    expect(receipt).toMatchObject({
      evidenceReviewStatus: 'pending',
      claimStatus: 'candidate',
      verificationEventType: null,
    });
    expect(store.snapshot().verificationEvents).toHaveLength(0);
  });

  it('accepts contradicting Evidence and marks a confirmed Claim stale', async () => {
    const store = backend({
      claims: [claim('confirmed')],
      evidence: [priorAcceptedEvidence(), evidence('contradicting')],
    });
    const receipt = await createEvidenceReviewDecisionService(store).decide(
      context,
      input({
        expectedClaimStatus: 'confirmed',
        expectedAcceptedEvidenceIds: [ids.priorEvidence],
        finding: 'contradicts_claim',
        claimAction: 'mark_stale',
        reasonCode: 'recent_contradiction',
        publicSummary: 'Recent Evidence contradicts the prior confirmation.',
      }),
    );

    expect(receipt).toMatchObject({
      claimStatus: 'stale',
      verificationEventType: 'marked_stale',
    });
    expect(store.snapshot().claims[0]).toMatchObject({
      claimStatus: 'stale',
      nextReviewAt,
    });
  });

  it('replays identical content and rejects changed content for the same request ID', async () => {
    const store = backend();
    const service = createEvidenceReviewDecisionService(store);
    await expect(service.decide(context, input())).resolves.toMatchObject({ state: 'committed' });
    await expect(service.decide(context, input())).resolves.toMatchObject({ state: 'replayed' });
    await expect(
      service.decide(context, input({ reasonCode: 'different_reason' })),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(store.snapshot().decisions).toBe(1);
  });

  it('rejects a changed accepted Evidence set', async () => {
    const store = backend({ evidence: [priorAcceptedEvidence(), evidence()] });
    await expect(
      createEvidenceReviewDecisionService(store).decide(context, input()),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rejects confirmation when the accepted Evidence threshold is not satisfied', async () => {
    const store = backend({ evidence: [evidence('supporting', 'c')] });
    await expect(
      createEvidenceReviewDecisionService(store).decide(context, input()),
    ).rejects.toMatchObject({ code: 'invalid_decision' });
    expect(store.snapshot().claims[0]?.claimStatus).toBe('candidate');
  });

  it('rejects invalid Claim transitions', async () => {
    const store = backend({ evidence: [evidence('contradicting')] });
    await expect(
      createEvidenceReviewDecisionService(store).decide(
        context,
        input({
          finding: 'contradicts_claim',
          claimAction: 'mark_stale',
          reasonCode: 'recent_contradiction',
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid_decision' });
  });

  it('rolls back Evidence, Claim, event, and receipt state on injected failure', async () => {
    const store = backend({ failBeforeCommit: () => true });
    const before = store.snapshot();
    await expect(
      createEvidenceReviewDecisionService(store).decide(context, input()),
    ).rejects.toMatchObject({ code: 'backend_failure' });
    expect(store.snapshot()).toEqual(before);
  });
});
