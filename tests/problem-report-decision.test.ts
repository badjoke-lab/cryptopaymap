import { describe, expect, it, vi } from 'vitest';
import type { ProblemReportMutationContext } from '../src/admin/submissions/authorization';
import {
  decideProblemReport,
  type ProblemReportDecisionBackend,
  type ProblemReportDecisionCommand,
  type ProblemReportDecisionEventRecord,
  type ProblemReportDecisionRequest,
  type ProblemReportDecisionState,
} from '../src/admin/submissions/problem-report-decision';

const submissionId = '10000000-0000-4000-8000-000000000001';
const claimId = '20000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const evidenceId = '40000000-0000-4000-8000-000000000001';
const duplicateId = '50000000-0000-4000-8000-000000000001';
const requestId = '60000000-0000-4000-8000-000000000001';
const decidedAt = new Date('2026-07-13T09:00:00.000Z');

const fullContext: ProblemReportMutationContext = {
  actorId: 'cloudflare-access:problem-reviewer',
  actorType: 'human',
  capabilities: ['submission:problem:decide', 'submission:urgent-visibility:decide'],
};

function problemState(
  reportType = 'wrong_address',
  overrides: Partial<ProblemReportDecisionState> = {},
): ProblemReportDecisionState {
  const correction =
    reportType === 'wrong_address'
      ? {
          kind: 'location_profile' as const,
          addressLine: '2 Corrected Street',
          locality: null,
          region: null,
          postalCode: null,
          countryCode: null,
          latitude: null,
          longitude: null,
          websiteUrl: null,
          phone: null,
          description: null,
          openingHours: null,
          amenities: null,
          socialLinks: null,
        }
      : null;
  const duplicateTarget =
    reportType === 'duplicate' ? { targetType: 'entity' as const, targetId: duplicateId } : null;
  return {
    submissionId,
    submissionType: 'problem_report',
    targetType: 'entity',
    targetId: entityId,
    workflowStatus: 'in_review',
    resolution: null,
    updatedAt: '2026-07-13T08:00:00.000Z',
    originalPayload: {
      schemaVersion: 'problem-report-v1',
      reportType,
      observedAt: '2026-07-12',
      explanation: 'The current public information appears incorrect.',
      proposedCorrection: correction,
      duplicateTarget,
      privateEvidenceUrl: ['business_closed', 'privacy_issue', 'unauthorized_image'].includes(
        reportType,
      )
        ? 'https://evidence.example/private-case'
        : null,
    },
    normalizedPayload: {
      reportKind: 'problem_report',
      targetType: 'entity',
      targetId: entityId,
      reportType,
      observedAt: '2026-07-12',
      explanation: 'The current public information appears incorrect.',
      proposedCorrection: correction,
      duplicateTarget,
      evidenceLinks: [],
      restrictedEvidence: {
        privateEvidenceUrlPresent: [
          'business_closed',
          'privacy_issue',
          'unauthorized_image',
        ].includes(reportType),
      },
    },
    payloadUpdatedAt: '2026-07-13T08:00:00.000Z',
    claim: null,
    evidence: null,
    ...overrides,
  };
}

function failedPaymentState(): ProblemReportDecisionState {
  return {
    submissionId,
    submissionType: 'payment_report',
    targetType: 'entity',
    targetId: entityId,
    workflowStatus: 'resolved',
    resolution: 'approved',
    updatedAt: '2026-07-13T08:00:00.000Z',
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
        observedSteps: 'The invoice expired before confirmation.',
      },
      privateTransactionUrl: 'https://evidence.example/private-transaction',
      notes: 'The merchant requested another payment method.',
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
        observedSteps: 'The invoice expired before confirmation.',
      },
      notes: 'The merchant requested another payment method.',
      evidenceLinks: [],
      restrictedEvidence: { privateTransactionUrlPresent: true },
    },
    payloadUpdatedAt: '2026-07-13T08:00:00.000Z',
    claim: {
      id: claimId,
      entityId,
      locationId: null,
      claimStatus: 'confirmed',
      visibility: 'public',
      updatedAt: '2026-07-13T07:00:00.000Z',
    },
    evidence: {
      id: evidenceId,
      claimId,
      submissionId,
      reviewStatus: 'accepted',
      polarity: 'contradicting',
      deletedAt: null,
    },
  };
}

function ordinaryRequest(
  operation: 'approve_correction_handoff' | 'resolve_duplicate' | 'resolve_no_change',
): ProblemReportDecisionRequest {
  return {
    schemaVersion: 'problem-report-decision-v1',
    requestId,
    operation,
    expectedSubmissionStatus: 'in_review',
    expectedSubmissionResolution: null,
    expectedSubmissionUpdatedAt: '2026-07-13T08:00:00.000Z',
    expectedPayloadUpdatedAt: '2026-07-13T08:00:00.000Z',
    claimId: null,
    expectedClaimUpdatedAt: null,
    expectedClaimStatus: null,
    expectedClaimVisibility: null,
    evidenceId: null,
    claimAction: null,
    nextReviewAt: null,
    endedReason: null,
    publicSummary: 'Reviewed problem report decision.',
    internalNote: null,
  };
}

function urgentHideRequest(): ProblemReportDecisionRequest {
  return {
    schemaVersion: 'problem-report-decision-v1',
    requestId,
    operation: 'temporarily_hide_claim',
    expectedSubmissionStatus: 'in_review',
    expectedSubmissionResolution: null,
    expectedSubmissionUpdatedAt: '2026-07-13T08:00:00.000Z',
    expectedPayloadUpdatedAt: '2026-07-13T08:00:00.000Z',
    claimId,
    expectedClaimUpdatedAt: '2026-07-13T07:00:00.000Z',
    expectedClaimStatus: 'confirmed',
    expectedClaimVisibility: 'public',
    evidenceId: null,
    claimAction: null,
    nextReviewAt: null,
    endedReason: null,
    publicSummary: 'Temporarily hidden while the restricted report is reviewed.',
    internalNote: null,
  };
}

function negativeActionRequest(action: 'mark_stale' | 'end'): ProblemReportDecisionRequest {
  return {
    schemaVersion: 'problem-report-decision-v1',
    requestId,
    operation: 'apply_negative_claim_action',
    expectedSubmissionStatus: 'resolved',
    expectedSubmissionResolution: 'approved',
    expectedSubmissionUpdatedAt: '2026-07-13T08:00:00.000Z',
    expectedPayloadUpdatedAt: '2026-07-13T08:00:00.000Z',
    claimId,
    expectedClaimUpdatedAt: '2026-07-13T07:00:00.000Z',
    expectedClaimStatus: 'confirmed',
    expectedClaimVisibility: 'public',
    evidenceId,
    claimAction: action,
    nextReviewAt: action === 'mark_stale' ? '2026-08-13T09:00:00.000Z' : null,
    endedReason: action === 'end' ? 'Accepted negative payment Evidence.' : null,
    publicSummary: 'Claim state updated after explicit Evidence review.',
    internalNote: null,
  };
}

function backend(currentState: ProblemReportDecisionState, duplicateExists = true) {
  let event: ProblemReportDecisionEventRecord | null = null;
  const committed: ProblemReportDecisionCommand[] = [];
  const adapter: ProblemReportDecisionBackend = {
    async readDecisionEvent() {
      return event;
    },
    async readState() {
      return currentState;
    },
    async readDuplicateTargetExists() {
      return duplicateExists;
    },
    async commitDecision(command) {
      committed.push(command);
      event = {
        eventId: command.requestId,
        submissionId: command.submissionId,
        fromStatus:
          command.operation === 'apply_negative_claim_action'
            ? null
            : command.expectedSubmissionStatus,
        toStatus: command.toSubmissionStatus,
        action: command.eventAction,
        reasonCode: command.eventReasonCode,
        actorId: command.actorId,
        internalNote: command.eventInternalNote,
        createdAt: command.decidedAt.toISOString(),
      };
    },
  };
  return { adapter, committed };
}

describe('P5-03G problem report decisions', () => {
  it('approves a typed correction as a handoff without canonical mutation', async () => {
    const harness = backend(problemState());
    const receipt = await decideProblemReport(
      fullContext,
      harness.adapter,
      submissionId,
      ordinaryRequest('approve_correction_handoff'),
      decidedAt,
    );

    expect(receipt).toMatchObject({
      operation: 'approve_correction_handoff',
      submissionStatus: 'resolved',
      submissionResolution: 'approved',
      claimId: null,
      verificationEventId: null,
    });
    expect(harness.committed[0]).toMatchObject({
      toClaimStatus: null,
      toClaimVisibility: null,
      eventAction: 'problem_correction_handoff_approved',
    });
  });

  it('resolves a duplicate only while the stored target still exists', async () => {
    await expect(
      decideProblemReport(
        fullContext,
        backend(problemState('duplicate'), false).adapter,
        submissionId,
        ordinaryRequest('resolve_duplicate'),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'ineligible' });

    await expect(
      decideProblemReport(
        fullContext,
        backend(problemState('duplicate')).adapter,
        submissionId,
        ordinaryRequest('resolve_duplicate'),
        decidedAt,
      ),
    ).resolves.toMatchObject({
      submissionStatus: 'duplicate',
      submissionResolution: 'duplicate',
    });
  });

  it('temporarily hides but does not end a Claim for a restricted urgent report', async () => {
    const current = problemState('privacy_issue', {
      claim: {
        id: claimId,
        entityId,
        locationId: null,
        claimStatus: 'confirmed',
        visibility: 'public',
        updatedAt: '2026-07-13T07:00:00.000Z',
      },
    });
    const harness = backend(current);
    const receipt = await decideProblemReport(
      fullContext,
      harness.adapter,
      submissionId,
      urgentHideRequest(),
      decidedAt,
    );

    expect(receipt).toMatchObject({
      operation: 'temporarily_hide_claim',
      claimStatus: 'confirmed',
      claimVisibility: 'temporarily_hidden',
    });
    expect(harness.committed[0]).toMatchObject({
      toClaimStatus: null,
      toClaimVisibility: 'temporarily_hidden',
    });
  });

  it('requires accepted contradicting Evidence before marking stale or ending', async () => {
    const invalid = failedPaymentState();
    invalid.evidence = { ...invalid.evidence!, reviewStatus: 'pending' };
    await expect(
      decideProblemReport(
        fullContext,
        backend(invalid).adapter,
        submissionId,
        negativeActionRequest('mark_stale'),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'ineligible' });

    await expect(
      decideProblemReport(
        fullContext,
        backend(failedPaymentState()).adapter,
        submissionId,
        negativeActionRequest('mark_stale'),
        decidedAt,
      ),
    ).resolves.toMatchObject({ claimStatus: 'stale', claimVisibility: 'public' });

    await expect(
      decideProblemReport(
        fullContext,
        backend(failedPaymentState()).adapter,
        submissionId,
        negativeActionRequest('end'),
        decidedAt,
      ),
    ).resolves.toMatchObject({ claimStatus: 'ended', claimVisibility: 'public' });
  });

  it('replays identical operations and rejects changed-content UUID reuse', async () => {
    const harness = backend(problemState('other'));
    const first = ordinaryRequest('resolve_no_change');
    await expect(
      decideProblemReport(fullContext, harness.adapter, submissionId, first, decidedAt),
    ).resolves.toMatchObject({ state: 'committed' });
    await expect(
      decideProblemReport(fullContext, harness.adapter, submissionId, first, decidedAt),
    ).resolves.toMatchObject({ state: 'replayed' });
    await expect(
      decideProblemReport(
        fullContext,
        harness.adapter,
        submissionId,
        { ...first, publicSummary: 'Changed decision content.' },
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
  });

  it('checks the operation-specific capability before backend access', async () => {
    const harness = backend(problemState('privacy_issue'));
    const readEvent = vi.spyOn(harness.adapter, 'readDecisionEvent');
    await expect(
      decideProblemReport(
        {
          actorId: fullContext.actorId,
          actorType: 'human',
          capabilities: ['submission:problem:decide'],
        },
        harness.adapter,
        submissionId,
        urgentHideRequest(),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(readEvent).not.toHaveBeenCalled();
  });
});
