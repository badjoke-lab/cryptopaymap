import { describe, expect, it, vi } from 'vitest';
import type { PaymentReportEvidenceDecisionContext } from '../src/admin/submissions/authorization';
import {
  decidePositivePaymentEvidence,
  type PositivePaymentEvidenceBackend,
  type PositivePaymentEvidenceCommitCommand,
  type PositivePaymentEvidenceEventRecord,
  type PositivePaymentEvidenceRequest,
  type PositivePaymentEvidenceState,
} from '../src/admin/submissions/payment-report-evidence';

const submissionId = '10000000-0000-4000-8000-000000000001';
const claimId = '20000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const claimAssetId = '40000000-0000-4000-8000-000000000001';
const requestId = '50000000-0000-4000-8000-000000000001';
const decidedAt = new Date('2026-07-13T05:00:00.000Z');
const context: PaymentReportEvidenceDecisionContext = {
  actorId: 'cloudflare-access:payment-reviewer',
  actorType: 'human',
  capabilities: ['submission:payment-evidence:decide'],
};

function state(
  overrides: Partial<PositivePaymentEvidenceState> = {},
): PositivePaymentEvidenceState {
  return {
    submissionId,
    submissionType: 'payment_report',
    targetType: 'entity',
    targetId: entityId,
    workflowStatus: 'in_review',
    updatedAt: '2026-07-13T04:00:00.000Z',
    normalizedPayload: {
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
        context: 'in_person',
        observedSteps: 'Scanned the displayed wallet QR code.',
      },
      notes: null,
      evidenceLinks: [
        {
          url: 'https://merchant.example/payments',
          observedAt: '2026-07-12',
          summary: 'Merchant payment page.',
        },
      ],
      restrictedEvidence: { privateTransactionUrlPresent: false },
    },
    payloadUpdatedAt: '2026-07-13T04:00:00.000Z',
    claim: {
      id: claimId,
      entityId,
      locationId: null,
      routeType: 'direct_wallet',
      processorName: null,
      claimStatus: 'confirmed',
      visibility: 'public',
      updatedAt: '2026-07-13T03:00:00.000Z',
      options: [
        {
          id: claimAssetId,
          assetSlug: 'btc',
          networkSlug: 'bitcoin',
          paymentMethod: 'onchain',
        },
      ],
    },
    ...overrides,
  };
}

function request(
  overrides: Partial<PositivePaymentEvidenceRequest> = {},
): PositivePaymentEvidenceRequest {
  return {
    schemaVersion: 'positive-payment-evidence-decision-v1',
    requestId,
    expectedStatus: 'in_review',
    expectedUpdatedAt: '2026-07-13T04:00:00.000Z',
    expectedPayloadUpdatedAt: '2026-07-13T04:00:00.000Z',
    claimId,
    expectedClaimUpdatedAt: '2026-07-13T03:00:00.000Z',
    expectedClaimStatus: 'confirmed',
    expectedClaimVisibility: 'public',
    expectedClaimAssetIds: [claimAssetId],
    decision: 'accept_evidence',
    evidenceClass: 'b',
    evidenceVisibility: 'private',
    independenceKey: 'usage:payment-report-001',
    summary: 'A successful BTC payment was reported on 2026-07-12.',
    reviewerNote: null,
    nextReviewAt: null,
    ...overrides,
  };
}

function backend(currentState = state()) {
  let event: PositivePaymentEvidenceEventRecord | null = null;
  const committed: PositivePaymentEvidenceCommitCommand[] = [];
  const adapter: PositivePaymentEvidenceBackend = {
    async readState() {
      return currentState;
    },
    async readDecisionEvent() {
      return event;
    },
    async commitDecision(command) {
      committed.push(command);
      event = {
        eventId: command.eventId,
        submissionId: command.submissionId,
        fromStatus: 'in_review',
        toStatus: 'resolved',
        action: 'positive_payment_evidence_decided',
        actorId: command.actorId,
        internalNote: command.eventInternalNote,
        createdAt: command.decidedAt.toISOString(),
      };
    },
  };
  return { adapter, committed };
}

describe('P5-03E positive payment Evidence decision', () => {
  it('accepts a successful payment report as private Class B Evidence only', async () => {
    const harness = backend();
    const receipt = await decidePositivePaymentEvidence(
      context,
      harness.adapter,
      submissionId,
      request(),
      decidedAt,
    );

    expect(receipt).toMatchObject({
      state: 'committed',
      submissionId,
      claimId,
      decision: 'accept_evidence',
      claimStatus: 'confirmed',
      verificationEventType: null,
    });
    expect(harness.committed).toHaveLength(1);
    expect(harness.committed[0]).toMatchObject({
      evidenceClass: 'b',
      evidenceKind: 'independent_user_report',
      evidenceVisibility: 'private',
      sourceType: 'user_submission',
      decision: 'accept_evidence',
      nextReviewAt: null,
    });
  });

  it('accepts restricted Class A proof and reconfirms an exact matching Claim', async () => {
    const current = state();
    current.normalizedPayload = {
      ...(current.normalizedPayload as Record<string, unknown>),
      restrictedEvidence: { privateTransactionUrlPresent: true },
    };
    const harness = backend(current);
    const receipt = await decidePositivePaymentEvidence(
      context,
      harness.adapter,
      submissionId,
      request({
        decision: 'accept_and_reconfirm',
        evidenceClass: 'a',
        evidenceVisibility: 'restricted',
        independenceKey: null,
        nextReviewAt: '2027-01-09T05:00:00.000Z',
      }),
      decidedAt,
    );

    expect(receipt).toMatchObject({
      claimStatus: 'confirmed',
      verificationEventType: 'reconfirmed',
    });
    expect(harness.committed[0]).toMatchObject({
      evidenceKind: 'payment_proof',
      sourceType: 'payment_proof',
      decision: 'accept_and_reconfirm',
    });
    expect(harness.committed[0]?.verificationEventId).not.toBeNull();
  });

  it('restores a stale Claim after an exact successful payment match', async () => {
    const current = state();
    if (current.claim) current.claim.claimStatus = 'stale';
    const harness = backend(current);
    const receipt = await decidePositivePaymentEvidence(
      context,
      harness.adapter,
      submissionId,
      request({
        expectedClaimStatus: 'stale',
        decision: 'accept_and_reconfirm',
        nextReviewAt: '2027-01-09T05:00:00.000Z',
      }),
      decidedAt,
    );

    expect(receipt.verificationEventType).toBe('restored');
    expect(receipt.claimStatus).toBe('confirmed');
  });

  it('rejects failed reports, target mismatches, and payment mismatches', async () => {
    const failed = state();
    failed.normalizedPayload = {
      ...(failed.normalizedPayload as Record<string, unknown>),
      result: 'failed',
    };
    await expect(
      decidePositivePaymentEvidence(
        context,
        backend(failed).adapter,
        submissionId,
        request(),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_projection' });

    await expect(
      decidePositivePaymentEvidence(
        context,
        backend(state({ targetId: claimId })).adapter,
        submissionId,
        request(),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'ineligible' });

    const mismatched = state();
    if (mismatched.claim) mismatched.claim.options[0].networkSlug = 'lightning';
    await expect(
      decidePositivePaymentEvidence(
        context,
        backend(mismatched).adapter,
        submissionId,
        request({
          decision: 'accept_and_reconfirm',
          nextReviewAt: '2027-01-09T05:00:00.000Z',
        }),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'ineligible' });
  });

  it('replays an identical request and rejects changed-content UUID reuse', async () => {
    const harness = backend();
    const first = await decidePositivePaymentEvidence(
      context,
      harness.adapter,
      submissionId,
      request(),
      decidedAt,
    );
    const replay = await decidePositivePaymentEvidence(
      context,
      harness.adapter,
      submissionId,
      request(),
      decidedAt,
    );
    expect(replay).toMatchObject({ state: 'replayed', evidenceId: first.evidenceId });

    await expect(
      decidePositivePaymentEvidence(
        context,
        harness.adapter,
        submissionId,
        request({ summary: 'Changed summary under the same request UUID.' }),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
  });

  it('checks authorization before backend access', async () => {
    const harness = backend();
    const readState = vi.spyOn(harness.adapter, 'readState');
    await expect(
      decidePositivePaymentEvidence(
        { ...context, capabilities: [] } as unknown as PaymentReportEvidenceDecisionContext,
        harness.adapter,
        submissionId,
        request(),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(readState).not.toHaveBeenCalled();
  });
});
