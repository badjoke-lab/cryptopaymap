import { describe, expect, it } from 'vitest';
import {
  readNegativeRecheckApplication,
  type NegativeRecheckApplicationBackend,
  type NegativeRecheckDecisionState,
  type NegativeRecheckEvidenceClaimState,
  type NegativeRecheckResolutionEventState,
} from '../src/admin/submissions/negative-recheck-application';
import type { SubmissionApplicationLifecycleRecord } from '../src/admin/submissions/application-lifecycle';
import { serializeNegativeReportEvidenceEvent } from '../src/submissions/negative-report-evidence-contract';

const applicationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000001';
const eventId = '30000000-0000-4000-8000-000000000001';
const evidenceId = '40000000-0000-4000-8000-000000000001';
const claimId = '50000000-0000-4000-8000-000000000001';
const registrationEventId = '60000000-0000-4000-8000-000000000001';
const resolutionEventId = '70000000-0000-4000-8000-000000000001';
const signalAt = '2026-07-18T06:00:00.000Z';
const registeredAt = '2026-07-18T06:05:00.000Z';
const generatedAt = new Date('2026-07-18T08:00:00.000Z');

const context = {
  actorId: 'reviewer:negative-recheck',
  actorType: 'human' as const,
  capabilities: ['submission:negative-recheck-application:read'] as [
    'submission:negative-recheck-application:read',
  ],
};

function application(): SubmissionApplicationLifecycleRecord {
  return {
    applicationId,
    submissionId,
    submissionType: 'problem_report',
    sourceDecisionKind: 'negative_report_evidence',
    sourceDecisionEventId: eventId,
    applicationKind: 'report_evidence',
    applicationStatus: 'committed',
    publicationStatus: 'pending',
    applicationReceipt: { kind: 'submission_event', ids: [eventId] },
    publicationReceipt: null,
    registeredAt,
    updatedAt: registeredAt,
    events: [
      {
        eventId: registrationEventId,
        action: 'registered',
        fromApplicationStatus: null,
        toApplicationStatus: 'committed',
        fromPublicationStatus: null,
        toPublicationStatus: 'pending',
        createdAt: registeredAt,
      },
    ],
  };
}

function decisionState(): NegativeRecheckDecisionState {
  return {
    submission: {
      submissionId,
      submissionType: 'problem_report',
      workflowStatus: 'resolved',
      resolution: 'approved',
    },
    event: {
      eventId,
      submissionId,
      fromStatus: 'in_review',
      toStatus: 'resolved',
      action: 'negative_report_evidence_decided',
      reasonCode: 'negative_evidence_recheck_priority',
      internalNote: serializeNegativeReportEvidenceEvent({
        schemaVersion: 'negative-report-evidence-event-v1',
        requestFingerprint: 'a'.repeat(64),
        evidenceId,
        claimId,
        decision: 'accept_and_prioritize_recheck',
        evidenceSummary: 'Payment failed at checkout.',
        reviewerNote: 'Private reviewer note.',
      }),
      createdAt: signalAt,
    },
  };
}

function evidenceClaim(): NegativeRecheckEvidenceClaimState {
  return {
    evidence: {
      evidenceId,
      claimId,
      submissionId,
      originRole: 'usage_side',
      polarity: 'contradicting',
      visibility: 'private',
      reviewStatus: 'accepted',
      createdAt: signalAt,
      deletedAt: null,
    },
    claim: {
      claimId,
      claimStatus: 'confirmed',
      visibility: 'public',
      lastConfirmedAt: '2026-07-01T00:00:00.000Z',
      nextReviewAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      deletedAt: null,
    },
  };
}

function createBackend(overrides: {
  application?: SubmissionApplicationLifecycleRecord | null;
  decision?: NegativeRecheckDecisionState | null;
  evidenceClaim?: NegativeRecheckEvidenceClaimState | null;
  resolution?: NegativeRecheckResolutionEventState | null;
} = {}) {
  let reads = 0;
  const applicationState =
    overrides.application === undefined ? application() : overrides.application;
  const decision = overrides.decision === undefined ? decisionState() : overrides.decision;
  const evidence = overrides.evidenceClaim === undefined ? evidenceClaim() : overrides.evidenceClaim;
  const resolution = overrides.resolution === undefined ? null : overrides.resolution;

  const backend: NegativeRecheckApplicationBackend & { reads(): number } = {
    reads() {
      return reads;
    },
    async readApplication(id) {
      reads += 1;
      return id === applicationId ? structuredClone(applicationState) : null;
    },
    async readDecisionState(id, decisionEventId) {
      reads += 1;
      return id === submissionId && decisionEventId === eventId
        ? structuredClone(decision)
        : null;
    },
    async readEvidenceClaim(id) {
      reads += 1;
      return id === evidenceId ? structuredClone(evidence) : null;
    },
    async readResolutionEvent(id, since) {
      reads += 1;
      expect(id).toBe(claimId);
      expect(since.toISOString()).toBe(signalAt);
      return structuredClone(resolution);
    },
  };
  return backend;
}

describe('P5-07D2 negative recheck application projection', () => {
  it('projects an active durable negative-Evidence signal at queue priority 5', async () => {
    const result = await readNegativeRecheckApplication(
      context,
      createBackend(),
      applicationId,
      generatedAt,
    );

    expect(result).toEqual({
      schemaVersion: 'negative-recheck-application-projection-v1',
      generatedAt: generatedAt.toISOString(),
      application: {
        applicationId,
        submissionId,
        submissionType: 'problem_report',
        sourceDecisionEventId: eventId,
        applicationStatus: 'committed',
        publicationStatus: 'pending',
        receiptKind: 'submission_event',
        receiptEventId: eventId,
      },
      signal: {
        status: 'active',
        decisionEventId: eventId,
        evidenceId,
        claimId,
        signalAt,
        claimStatus: 'confirmed',
        claimVisibility: 'public',
        nextReviewAt: '2026-08-01T00:00:00.000Z',
        queueProjection: {
          queueReason: 'negative_evidence',
          recommendedAction: 'review',
          dueAt: signalAt,
          daysUntilReview: -0,
          priority: 5,
        },
        resolution: null,
      },
    });
  });

  it('preserves overdue priority 0 instead of downgrading the Claim to priority 5', async () => {
    const state = evidenceClaim();
    if (state.claim !== null) state.claim.nextReviewAt = '2026-07-17T00:00:00.000Z';
    const result = await readNegativeRecheckApplication(
      context,
      createBackend({ evidenceClaim: state }),
      applicationId,
      generatedAt,
    );

    expect(result.signal.queueProjection).toMatchObject({
      queueReason: 'overdue',
      recommendedAction: 'mark_stale',
      priority: 0,
    });
  });

  it('projects the first later resolving Verification Event without exposing private Evidence', async () => {
    const result = await readNegativeRecheckApplication(
      context,
      createBackend({
        resolution: {
          verificationEventId: resolutionEventId,
          claimId,
          eventType: 'reconfirmed',
          effectiveAt: '2026-07-18T07:00:00.000Z',
        },
      }),
      applicationId,
      generatedAt,
    );

    expect(result.signal.status).toBe('resolved');
    expect(result.signal.queueProjection).toBeNull();
    expect(result.signal.resolution).toEqual({
      verificationEventId: resolutionEventId,
      eventType: 'reconfirmed',
      effectiveAt: '2026-07-18T07:00:00.000Z',
    });
    expect(JSON.stringify(result)).not.toContain('Payment failed at checkout');
    expect(JSON.stringify(result)).not.toContain('Private reviewer note');
  });

  it('rejects a non-priority decision, changed receipt, and mismatched Evidence chain', async () => {
    const nonPriority = decisionState();
    if (nonPriority.event !== null) {
      nonPriority.event.reasonCode = 'negative_evidence_accepted';
      nonPriority.event.internalNote = serializeNegativeReportEvidenceEvent({
        schemaVersion: 'negative-report-evidence-event-v1',
        requestFingerprint: 'b'.repeat(64),
        evidenceId,
        claimId,
        decision: 'accept_negative_evidence',
        evidenceSummary: 'Negative Evidence only.',
        reviewerNote: null,
      });
    }
    await expect(
      readNegativeRecheckApplication(
        context,
        createBackend({ decision: nonPriority }),
        applicationId,
        generatedAt,
      ),
    ).rejects.toMatchObject({ code: 'ineligible' });

    const changedReceipt = application();
    changedReceipt.applicationReceipt = {
      kind: 'submission_event',
      ids: ['30000000-0000-4000-8000-000000000002'],
    };
    await expect(
      readNegativeRecheckApplication(
        context,
        createBackend({ application: changedReceipt }),
        applicationId,
        generatedAt,
      ),
    ).rejects.toMatchObject({ code: 'ineligible' });

    const mismatchedEvidence = evidenceClaim();
    mismatchedEvidence.evidence.submissionId = '20000000-0000-4000-8000-000000000002';
    await expect(
      readNegativeRecheckApplication(
        context,
        createBackend({ evidenceClaim: mismatchedEvidence }),
        applicationId,
        generatedAt,
      ),
    ).rejects.toMatchObject({ code: 'ineligible' });
  });

  it('fails authorization before loading application state', async () => {
    const backend = createBackend();
    await expect(
      readNegativeRecheckApplication(
        { actorId: 'reviewer:nope', actorType: 'human', capabilities: [] as never },
        backend,
        applicationId,
        generatedAt,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(backend.reads()).toBe(0);
  });
});
