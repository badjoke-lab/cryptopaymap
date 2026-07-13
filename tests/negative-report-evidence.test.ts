import { describe, expect, it, vi } from 'vitest';
import type { NegativeReportEvidenceDecisionContext } from '../src/admin/submissions/authorization';
import {
  decideNegativeReportEvidence,
  type NegativeReportEvidenceBackend,
  type NegativeReportEvidenceCommitCommand,
  type NegativeReportEvidenceEventRecord,
  type NegativeReportEvidenceRequest,
  type NegativeReportEvidenceState,
} from '../src/admin/submissions/negative-report-evidence';
import { evaluateReconfirmationClaim } from '../src/admin/reconfirmation/queue';

const submissionId = '10000000-0000-4000-8000-000000000001';
const claimId = '20000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const requestId = '40000000-0000-4000-8000-000000000001';
const decidedAt = new Date('2026-07-13T06:00:00.000Z');
const context: NegativeReportEvidenceDecisionContext = {
  actorId: 'cloudflare-access:negative-reviewer',
  actorType: 'human',
  capabilities: ['submission:negative-evidence:decide'],
};

function state(overrides: Partial<NegativeReportEvidenceState> = {}): NegativeReportEvidenceState {
  return {
    submissionId,
    submissionType: 'payment_report',
    targetType: 'entity',
    targetId: entityId,
    workflowStatus: 'in_review',
    updatedAt: '2026-07-13T05:00:00.000Z',
    originalPayload: {
      schemaVersion: 'payment-report-v1',
      result: 'failed',
      paymentDate: '2026-07-12',
      payment: {
        assetSlug: 'btc',
        networkSlug: 'bitcoin',
        routeType: 'direct_wallet',
        paymentMethod: 'onchain',
        processor: null,
        context: 'qr_code',
        observedSteps: 'The displayed invoice expired before confirmation.',
      },
      privateTransactionUrl: null,
      notes: 'The merchant asked for another payment method.',
    },
    normalizedPayload: {
      reportKind: 'payment_report',
      targetType: 'entity',
      targetId: entityId,
      result: 'failed',
      paymentDate: '2026-07-12',
      payment: {
        assetSlug: 'btc',
        networkSlug: 'bitcoin',
        routeType: 'direct_wallet',
        paymentMethod: 'onchain',
        processor: null,
        context: 'qr_code',
        observedSteps: 'The displayed invoice expired before confirmation.',
      },
      notes: 'The merchant asked for another payment method.',
      evidenceLinks: [],
      restrictedEvidence: { privateTransactionUrlPresent: false },
    },
    payloadUpdatedAt: '2026-07-13T05:00:00.000Z',
    claim: {
      id: claimId,
      entityId,
      locationId: null,
      claimStatus: 'confirmed',
      visibility: 'public',
      updatedAt: '2026-07-13T04:00:00.000Z',
    },
    ...overrides,
  };
}

function request(
  overrides: Partial<NegativeReportEvidenceRequest> = {},
): NegativeReportEvidenceRequest {
  return {
    schemaVersion: 'negative-report-evidence-decision-v1',
    requestId,
    expectedStatus: 'in_review',
    expectedUpdatedAt: '2026-07-13T05:00:00.000Z',
    expectedPayloadUpdatedAt: '2026-07-13T05:00:00.000Z',
    claimId,
    expectedClaimUpdatedAt: '2026-07-13T04:00:00.000Z',
    expectedClaimStatus: 'confirmed',
    expectedClaimVisibility: 'public',
    decision: 'accept_and_prioritize_recheck',
    evidenceClass: 'b',
    evidenceVisibility: 'private',
    independenceKey: 'usage:negative-report-001',
    evidenceSummary: 'A failed BTC payment was reported on 2026-07-12.',
    reviewerNote: null,
    ...overrides,
  };
}

function backend(currentState = state()) {
  let event: NegativeReportEvidenceEventRecord | null = null;
  const committed: NegativeReportEvidenceCommitCommand[] = [];
  const adapter: NegativeReportEvidenceBackend = {
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
        action: 'negative_report_evidence_decided',
        reasonCode:
          command.decision === 'accept_and_prioritize_recheck'
            ? 'negative_evidence_recheck_priority'
            : 'negative_evidence_accepted',
        actorId: command.actorId,
        internalNote: command.eventInternalNote,
        createdAt: command.decidedAt.toISOString(),
      };
    },
  };
  return { adapter, committed };
}

describe('P5-03F negative report Evidence decision', () => {
  it('accepts a failed payment report as contradicting Evidence and prioritizes recheck', async () => {
    const harness = backend();
    const receipt = await decideNegativeReportEvidence(
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
      decision: 'accept_and_prioritize_recheck',
      claimStatus: 'confirmed',
      recheckPrioritized: true,
    });
    expect(harness.committed).toHaveLength(1);
    expect(harness.committed[0]).toMatchObject({
      evidenceClass: 'b',
      evidenceKind: 'independent_user_report',
      evidenceVisibility: 'private',
      decision: 'accept_and_prioritize_recheck',
    });
  });

  it('accepts only bounded negative problem report types', async () => {
    const problem = state({
      submissionType: 'problem_report',
      originalPayload: {
        schemaVersion: 'problem-report-v1',
        reportType: 'no_longer_accepts_crypto',
        observedAt: '2026-07-12',
        explanation: 'Checkout no longer offers cryptocurrency.',
        proposedCorrection: null,
        duplicateTarget: null,
        privateEvidenceUrl: null,
      },
      normalizedPayload: {
        reportKind: 'problem_report',
        targetType: 'entity',
        targetId: entityId,
        reportType: 'no_longer_accepts_crypto',
        observedAt: '2026-07-12',
        explanation: 'Checkout no longer offers cryptocurrency.',
        proposedCorrection: null,
        duplicateTarget: null,
        evidenceLinks: [],
        restrictedEvidence: { privateEvidenceUrlPresent: false },
      },
    });
    await expect(
      decideNegativeReportEvidence(
        context,
        backend(problem).adapter,
        submissionId,
        request({ decision: 'accept_negative_evidence' }),
        decidedAt,
      ),
    ).resolves.toMatchObject({ recheckPrioritized: false });

    problem.originalPayload = {
      ...(problem.originalPayload as Record<string, unknown>),
      reportType: 'business_closed',
    };
    problem.normalizedPayload = {
      ...(problem.normalizedPayload as Record<string, unknown>),
      reportType: 'business_closed',
    };
    await expect(
      decideNegativeReportEvidence(
        context,
        backend(problem).adapter,
        submissionId,
        request(),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_projection' });
  });

  it('requires restricted source proof for Class A', async () => {
    await expect(
      decideNegativeReportEvidence(
        context,
        backend().adapter,
        submissionId,
        request({
          evidenceClass: 'a',
          evidenceVisibility: 'restricted',
          independenceKey: null,
        }),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'ineligible' });
  });

  it('replays identical requests and rejects changed-content UUID reuse', async () => {
    const harness = backend();
    const first = await decideNegativeReportEvidence(
      context,
      harness.adapter,
      submissionId,
      request(),
      decidedAt,
    );
    await expect(
      decideNegativeReportEvidence(
        context,
        harness.adapter,
        submissionId,
        request(),
        decidedAt,
      ),
    ).resolves.toMatchObject({ state: 'replayed', evidenceId: first.evidenceId });

    await expect(
      decideNegativeReportEvidence(
        context,
        harness.adapter,
        submissionId,
        request({ evidenceSummary: 'Changed content under the same UUID.' }),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
  });

  it('checks authorization before backend access', async () => {
    const harness = backend();
    const readState = vi.spyOn(harness.adapter, 'readState');
    await expect(
      decideNegativeReportEvidence(
        { ...context, capabilities: [] } as unknown as NegativeReportEvidenceDecisionContext,
        harness.adapter,
        submissionId,
        request(),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(readState).not.toHaveBeenCalled();
  });

  it('gives unresolved negative Evidence priority without changing Claim status', () => {
    const claim = {
      id: claimId,
      claimStatus: 'confirmed' as const,
      visibility: 'public' as const,
      lastConfirmedAt: '2026-07-01T00:00:00.000Z',
      nextReviewAt: '2027-01-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      deletedAt: null,
    };
    expect(
      evaluateReconfirmationClaim(
        claim,
        decidedAt,
        { dueSoonDays: 30 },
        '2026-07-13T06:00:00.000Z',
      ),
    ).toMatchObject({
      claimStatus: 'confirmed',
      queueReason: 'negative_evidence',
      recommendedAction: 'review',
      priority: 5,
    });
    expect(evaluateReconfirmationClaim(claim, decidedAt, { dueSoonDays: 30 }, null)).toBeNull();
  });
});
