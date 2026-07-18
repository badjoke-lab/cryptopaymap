import { describe, expect, it } from 'vitest';
import type {
  SubmissionApplicationLifecycleRecord,
  SubmissionApplicationTransitionCommand,
  SubmissionApplicationTransitionReplayRecord,
} from '../src/admin/submissions/application-lifecycle';
import {
  applyProblemClaimInstructionCorrectionApplication,
  type ProblemClaimInstructionCorrectionApplicationBackend,
  type ProblemClaimInstructionCorrectionApplicationState,
  problemClaimInstructionCorrectionEventPayloadSchema,
} from '../src/admin/submissions/problem-claim-instruction-correction-application';
import { serializeProblemReportDecisionEvent } from '../src/submissions/problem-report-decision-contract';

const applicationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000001';
const sourceDecisionEventId = '30000000-0000-4000-8000-000000000001';
const claimId = '40000000-0000-4000-8000-000000000001';
const sourceId = '50000000-0000-4000-8000-000000000001';
const registrationEventId = '60000000-0000-4000-8000-000000000001';
const requestId = '70000000-0000-4000-8000-000000000001';
const registeredAt = '2026-07-18T11:00:00.000Z';
const claimUpdatedAt = '2026-07-18T10:00:00.000Z';
const appliedAt = new Date('2026-07-18T12:00:00.000Z');

const context = {
  actorId: 'reviewer:claim-instructions',
  actorType: 'human' as const,
  capabilities: ['submission:problem-claim-instructions:apply'] as [
    'submission:problem-claim-instructions:apply',
  ],
};

const correction = {
  kind: 'instructions' as const,
  howToPay: 'Ask staff to display the Lightning invoice and scan it before confirming.',
};

function application(): SubmissionApplicationLifecycleRecord {
  return {
    applicationId,
    submissionId,
    submissionType: 'problem_report',
    sourceDecisionKind: 'problem_correction_handoff',
    sourceDecisionEventId,
    applicationKind: 'problem_correction',
    applicationStatus: 'pending',
    publicationStatus: 'blocked',
    applicationReceipt: null,
    publicationReceipt: null,
    registeredAt,
    updatedAt: registeredAt,
    events: [
      {
        eventId: registrationEventId,
        action: 'registered',
        fromApplicationStatus: null,
        toApplicationStatus: 'pending',
        fromPublicationStatus: null,
        toPublicationStatus: 'blocked',
        createdAt: registeredAt,
      },
    ],
  };
}

function state(): ProblemClaimInstructionCorrectionApplicationState {
  return {
    application: application(),
    submission: {
      submissionId,
      publicId: 'CPM-S-2026-000654',
      submissionType: 'problem_report',
      targetType: 'claim',
      targetId: claimId,
      workflowStatus: 'resolved',
      resolution: 'approved',
      normalizedPayload: {
        reportKind: 'problem_report',
        targetType: 'claim',
        targetId: claimId,
        reportType: 'wrong_instructions',
        observedAt: '2026-07-12',
        explanation: 'The old payment steps no longer match checkout.',
        proposedCorrection: correction,
        duplicateTarget: null,
        evidenceLinks: [],
        restrictedEvidence: { privateEvidenceUrlPresent: true },
      },
    },
    sourceDecisionEvent: {
      eventId: sourceDecisionEventId,
      submissionId,
      toStatus: 'resolved',
      action: 'problem_correction_handoff_approved',
      internalNote: serializeProblemReportDecisionEvent({
        schemaVersion: 'problem-report-decision-event-v1',
        requestFingerprint: 'a'.repeat(64),
        operation: 'approve_correction_handoff',
        reportType: 'wrong_instructions',
        claimId: null,
        evidenceId: null,
        verificationEventId: null,
        claimAction: null,
        proposedCorrection: correction,
        duplicateTarget: null,
        publicSummary: 'Payment instructions were corrected.',
        internalNote: 'Reviewer note must remain private.',
      }),
      createdAt: '2026-07-18T10:30:00.000Z',
    },
    claim: {
      claimId,
      claimStatus: 'confirmed',
      visibility: 'public',
      howToPay: 'Scan the QR code shown at checkout.',
      updatedAt: claimUpdatedAt,
      deletedAt: null,
    },
    correctionEvent: null,
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'problem-claim-instruction-correction-application-v1',
    requestId,
    expectedApplicationUpdatedAt: registeredAt,
    expectedClaimUpdatedAt: claimUpdatedAt,
    ...overrides,
  };
}

function createBackend(initial = state()) {
  const current = structuredClone(initial);
  const transitions = new Map<string, SubmissionApplicationTransitionReplayRecord>();
  const commits: Parameters<
    ProblemClaimInstructionCorrectionApplicationBackend['commitClaimInstructionCorrection']
  >[0][] = [];

  const backend: ProblemClaimInstructionCorrectionApplicationBackend & {
    commits: typeof commits;
  } = {
    commits,
    async readApplicationState(id, correctionEventId) {
      if (id !== applicationId) return null;
      const copy = structuredClone(current);
      if (copy.correctionEvent?.eventId !== correctionEventId) copy.correctionEvent = null;
      return copy;
    },
    async readApplication(id) {
      return id === applicationId ? structuredClone(current.application) : null;
    },
    async readTransition(id) {
      return structuredClone(transitions.get(id) ?? null);
    },
    async commitTransition(command: SubmissionApplicationTransitionCommand) {
      if (
        current.application.applicationStatus !== command.fromApplicationStatus ||
        current.application.publicationStatus !== command.fromPublicationStatus ||
        current.application.updatedAt !== command.expectedUpdatedAt.toISOString()
      ) {
        const error = new Error('synthetic application conflict') as Error & { code: string };
        error.code = 'conflict';
        throw error;
      }
      current.application = {
        ...current.application,
        applicationStatus: command.toApplicationStatus,
        publicationStatus: command.toPublicationStatus,
        applicationReceipt: command.nextApplicationReceipt,
        publicationReceipt: command.nextPublicationReceipt,
        updatedAt: command.changedAt.toISOString(),
        events: [
          ...current.application.events,
          {
            eventId: command.transitionEventId,
            action: command.action,
            fromApplicationStatus: command.fromApplicationStatus,
            toApplicationStatus: command.toApplicationStatus,
            fromPublicationStatus: command.fromPublicationStatus,
            toPublicationStatus: command.toPublicationStatus,
            createdAt: command.changedAt.toISOString(),
          },
        ],
      };
      transitions.set(command.transitionEventId, {
        transitionEventId: command.transitionEventId,
        applicationId: command.applicationId,
        action: command.action,
        fromApplicationStatus: command.fromApplicationStatus,
        toApplicationStatus: command.toApplicationStatus,
        fromPublicationStatus: command.fromPublicationStatus,
        toPublicationStatus: command.toPublicationStatus,
        actorId: command.actorId,
        requestFingerprint: command.requestFingerprint,
        changedAt: command.changedAt.toISOString(),
      });
    },
    async commitClaimInstructionCorrection(command) {
      commits.push(command);
      if (current.correctionEvent !== null) {
        const payload = problemClaimInstructionCorrectionEventPayloadSchema.parse(
          JSON.parse(current.correctionEvent.internalNote ?? ''),
        );
        return {
          state: 'replayed',
          correctionEventId: current.correctionEvent.eventId,
          claimId: payload.claimId,
          sourceRecordId: payload.sourceRecordId,
          verificationEventId: payload.verificationEventId,
          appliedAt: current.correctionEvent.createdAt,
        };
      }
      const payload = problemClaimInstructionCorrectionEventPayloadSchema.parse({
        schemaVersion: 'problem-claim-instruction-correction-event-v1',
        requestFingerprint: command.requestFingerprint,
        applicationId: command.applicationId,
        sourceDecisionEventId: command.sourceDecisionEventId,
        claimId: command.claimId,
        sourceRecordId: command.sourceRecord.id,
        verificationEventId: command.verificationEventId,
        expectedClaimUpdatedAt: command.expectedClaimUpdatedAt.toISOString(),
        beforeHowToPay: command.beforeHowToPay,
        afterHowToPay: command.afterHowToPay,
      });
      current.correctionEvent = {
        eventId: command.requestId,
        submissionId: command.submissionId,
        toStatus: 'resolved',
        action: 'problem_claim_instructions_applied',
        reasonCode: 'problem_report_instruction_correction',
        actorId: command.actorId,
        internalNote: JSON.stringify(payload),
        createdAt: command.appliedAt.toISOString(),
      };
      if (current.claim !== null) {
        current.claim.howToPay = command.afterHowToPay;
        current.claim.updatedAt = command.appliedAt.toISOString();
      }
      return {
        state: 'committed',
        correctionEventId: command.requestId,
        claimId: command.claimId,
        sourceRecordId: command.sourceRecord.id,
        verificationEventId: command.verificationEventId,
        appliedAt: command.appliedAt.toISOString(),
      };
    },
  };
  return backend;
}

describe('P5-07D4 Problem Report Claim instruction correction application', () => {
  it('derives the Claim instruction update and bounded private source from the approved decision chain', async () => {
    const backend = createBackend();
    const receipt = await applyProblemClaimInstructionCorrectionApplication(
      context,
      backend,
      applicationId,
      sourceId,
      request(),
      appliedAt,
    );

    expect(receipt).toMatchObject({
      state: 'committed',
      applicationId,
      submissionId,
      claimId,
      correctionEventId: requestId,
      applicationStatus: 'committed',
      publicationStatus: 'pending',
      transitionEventId: requestId,
      appliedAt: appliedAt.toISOString(),
    });
    expect(backend.commits).toHaveLength(1);
    expect(backend.commits[0]).toMatchObject({
      claimId,
      expectedClaimUpdatedAt: new Date(claimUpdatedAt),
      beforeHowToPay: 'Scan the QR code shown at checkout.',
      afterHowToPay: correction.howToPay,
      publicSummary: 'Payment instructions were corrected.',
    });
    expect(backend.commits[0]?.sourceRecord.rawPayload).toEqual({
      schemaVersion: 'problem-claim-instruction-correction-source-v1',
      submissionReference: 'CPM-S-2026-000654',
      sourceDecisionEventId,
      targetClaimId: claimId,
      reportType: 'wrong_instructions',
      observedAt: '2026-07-12',
      howToPay: correction.howToPay,
    });
    expect(JSON.stringify(backend.commits[0]?.sourceRecord.rawPayload)).not.toContain(
      'Reviewer note',
    );
    expect(JSON.stringify(backend.commits[0]?.sourceRecord.rawPayload)).not.toContain(
      'privateEvidenceUrlPresent',
    );
  });

  it('recognizes the exact canonical and common receipt on retry without a second canonical commit', async () => {
    const backend = createBackend();
    await applyProblemClaimInstructionCorrectionApplication(
      context,
      backend,
      applicationId,
      sourceId,
      request(),
      appliedAt,
    );
    await expect(
      applyProblemClaimInstructionCorrectionApplication(
        context,
        backend,
        applicationId,
        sourceId,
        request(),
        new Date('2026-07-18T13:00:00.000Z'),
      ),
    ).resolves.toMatchObject({ state: 'already_applied', appliedAt: appliedAt.toISOString() });
    expect(backend.commits).toHaveLength(1);
  });

  it('rejects a different correction class instead of widening the Claim mutation', async () => {
    const invalid = state();
    const assetCorrection = { kind: 'asset' as const, assetSlug: 'btc' };
    if (invalid.sourceDecisionEvent !== null) {
      invalid.sourceDecisionEvent.internalNote = serializeProblemReportDecisionEvent({
        schemaVersion: 'problem-report-decision-event-v1',
        requestFingerprint: 'b'.repeat(64),
        operation: 'approve_correction_handoff',
        reportType: 'wrong_asset',
        claimId: null,
        evidenceId: null,
        verificationEventId: null,
        claimAction: null,
        proposedCorrection: assetCorrection,
        duplicateTarget: null,
        publicSummary: null,
        internalNote: 'Asset changes use a separate owner.',
      });
    }
    (
      invalid.submission.normalizedPayload as { reportType: string; proposedCorrection: unknown }
    ).reportType = 'wrong_asset';
    (invalid.submission.normalizedPayload as { proposedCorrection: unknown }).proposedCorrection =
      assetCorrection;
    const backend = createBackend(invalid);

    await expect(
      applyProblemClaimInstructionCorrectionApplication(
        context,
        backend,
        applicationId,
        sourceId,
        request(),
        appliedAt,
      ),
    ).rejects.toMatchObject({ code: 'ineligible' });
    expect(backend.commits).toHaveLength(0);
  });

  it('fails closed when the reviewed Claim version is stale', async () => {
    const backend = createBackend();
    await expect(
      applyProblemClaimInstructionCorrectionApplication(
        context,
        backend,
        applicationId,
        sourceId,
        request({ expectedClaimUpdatedAt: '2026-07-18T09:00:00.000Z' }),
        appliedAt,
      ),
    ).rejects.toMatchObject({ code: 'ineligible' });
    expect(backend.commits).toHaveLength(0);
  });
});
