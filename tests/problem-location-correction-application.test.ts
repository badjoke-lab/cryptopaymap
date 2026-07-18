import { describe, expect, it } from 'vitest';
import {
  applyProblemLocationCorrectionApplication,
  type ProblemLocationCorrectionApplicationBackend,
  type ProblemLocationCorrectionApplicationState,
} from '../src/admin/submissions/problem-location-correction-application';
import type {
  SubmissionApplicationLifecycleRecord,
  SubmissionApplicationTransitionCommand,
  SubmissionApplicationTransitionReplayRecord,
} from '../src/admin/submissions/application-lifecycle';
import type {
  LocationCorrectionDecisionInput,
  LocationCorrectionDecisionReceipt,
  LocationCorrectionMutationContext,
} from '../src/admin/location-correction/decision';
import { serializeProblemReportDecisionEvent } from '../src/submissions/problem-report-decision-contract';

const applicationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000001';
const sourceDecisionEventId = '30000000-0000-4000-8000-000000000001';
const locationId = '40000000-0000-4000-8000-000000000001';
const sourceId = '50000000-0000-4000-8000-000000000001';
const registrationEventId = '60000000-0000-4000-8000-000000000001';
const requestId = '70000000-0000-4000-8000-000000000001';
const registeredAt = '2026-07-18T07:00:00.000Z';
const locationUpdatedAt = '2026-07-18T06:00:00.000Z';
const appliedAt = new Date('2026-07-18T08:00:00.000Z');

const context = {
  actorId: 'reviewer:problem-correction',
  actorType: 'human' as const,
  capabilities: ['submission:problem-location-correction:apply'] as [
    'submission:problem-location-correction:apply',
  ],
};

const proposedCorrection = {
  kind: 'location_profile' as const,
  addressLine: '2 New Street',
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
  amenities: ['wifi'],
  socialLinks: null,
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

function state(): ProblemLocationCorrectionApplicationState {
  return {
    application: application(),
    submission: {
      submissionId,
      publicId: 'CPM-S-2026-000321',
      submissionType: 'problem_report',
      targetType: 'location',
      targetId: locationId,
      workflowStatus: 'resolved',
      resolution: 'approved',
      normalizedPayload: {
        reportKind: 'problem_report',
        targetType: 'location',
        targetId: locationId,
        reportType: 'wrong_address',
        observedAt: '2026-07-10',
        explanation: 'The practical address details changed.',
        proposedCorrection,
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
        reportType: 'wrong_address',
        claimId: null,
        evidenceId: null,
        verificationEventId: null,
        claimAction: null,
        proposedCorrection,
        duplicateTarget: null,
        publicSummary: 'Address details were corrected.',
        internalNote: 'Reviewer-only note that must not enter the source payload.',
      }),
      createdAt: '2026-07-18T06:30:00.000Z',
    },
    location: {
      locationId,
      updatedAt: locationUpdatedAt,
      deletedAt: null,
    },
    correctionDecision: null,
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'problem-location-correction-application-v1',
    requestId,
    expectedApplicationUpdatedAt: registeredAt,
    expectedLocationUpdatedAt: locationUpdatedAt,
    ...overrides,
  };
}

function createBackend(initial = state()) {
  let current = structuredClone(initial);
  const transitions = new Map<string, SubmissionApplicationTransitionReplayRecord>();
  const applications: Array<{
    context: LocationCorrectionMutationContext;
    input: LocationCorrectionDecisionInput;
    sourceRecord: Parameters<ProblemLocationCorrectionApplicationBackend['applyLocationCorrection']>[2];
  }> = [];
  let reads = 0;

  const backend: ProblemLocationCorrectionApplicationBackend & {
    applications: typeof applications;
    reads(): number;
  } = {
    applications,
    reads() {
      return reads;
    },
    async readApplicationState(id, correctionRequestId) {
      reads += 1;
      if (id !== applicationId) return null;
      const copy = structuredClone(current);
      if (copy.correctionDecision?.requestId !== correctionRequestId) {
        copy.correctionDecision = null;
      }
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
    async applyLocationCorrection(correctionContext, input, sourceRecord) {
      applications.push({ context: correctionContext, input, sourceRecord });
      if (current.correctionDecision?.requestId === correctionContext.requestId) {
        return {
          requestId: correctionContext.requestId,
          locationId,
          appliedFieldPaths: current.correctionDecision.changedFieldPaths as Array<
            'addressLine' | 'amenities'
          >,
          decidedAt: current.correctionDecision.decidedAt,
          updatedAt: current.correctionDecision.decidedAt,
          state: 'replayed',
        } satisfies LocationCorrectionDecisionReceipt;
      }
      current.correctionDecision = {
        requestId: correctionContext.requestId,
        locationId,
        expectedLocationUpdatedAt: input.expectedLocationUpdatedAt,
        changedFieldPaths: Object.keys(input.changes),
        decidedAt: input.decidedAt,
      };
      if (current.location !== null) current.location.updatedAt = input.decidedAt;
      return {
        requestId: correctionContext.requestId,
        locationId,
        appliedFieldPaths: Object.keys(input.changes) as Array<'addressLine' | 'amenities'>,
        decidedAt: input.decidedAt,
        updatedAt: input.decidedAt,
        state: 'committed',
      };
    },
  };
  return backend;
}

describe('P5-07D1 Problem Report Location correction application', () => {
  it('derives a practical Location correction and private provenance source from the approved handoff', async () => {
    const backend = createBackend();
    const receipt = await applyProblemLocationCorrectionApplication(
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
      locationId,
      correctionDecisionRequestId: requestId,
      applicationStatus: 'committed',
      publicationStatus: 'pending',
      transitionEventId: requestId,
      appliedAt: appliedAt.toISOString(),
      appliedFieldPaths: ['addressLine', 'amenities'],
    });
    expect(backend.applications).toHaveLength(1);
    expect(backend.applications[0]?.input).toMatchObject({
      locationId,
      expectedLocationUpdatedAt: locationUpdatedAt,
      changes: {
        addressLine: { operation: 'set', value: '2 New Street' },
        amenities: { operation: 'replace', values: ['wifi'] },
      },
      sourceRecordIds: [expect.any(String)],
      reasonCode: 'problem_report_correction',
    });
    expect(backend.applications[0]?.sourceRecord.rawPayload).toEqual({
      schemaVersion: 'problem-location-correction-source-v1',
      submissionReference: 'CPM-S-2026-000321',
      sourceDecisionEventId,
      targetLocationId: locationId,
      reportType: 'wrong_address',
      observedAt: '2026-07-10',
      proposedCorrection,
    });
    expect(JSON.stringify(backend.applications[0]?.sourceRecord.rawPayload)).not.toContain(
      'Reviewer-only note',
    );
    expect(JSON.stringify(backend.applications[0]?.sourceRecord.rawPayload)).not.toContain(
      'privateEvidenceUrlPresent',
    );
  });

  it('replays the exact canonical correction and lifecycle transition without creating a second source', async () => {
    const backend = createBackend();
    await applyProblemLocationCorrectionApplication(
      context,
      backend,
      applicationId,
      sourceId,
      request(),
      appliedAt,
    );
    await expect(
      applyProblemLocationCorrectionApplication(
        context,
        backend,
        applicationId,
        sourceId,
        request(),
        new Date('2026-07-18T09:00:00.000Z'),
      ),
    ).resolves.toMatchObject({ state: 'replayed', appliedAt: appliedAt.toISOString() });
    expect(backend.applications).toHaveLength(2);
    expect(backend.applications[0]?.sourceRecord.id).toBe(backend.applications[1]?.sourceRecord.id);
  });

  it('recognizes an exact application receipt that was already committed', async () => {
    const initial = state();
    initial.application.applicationStatus = 'committed';
    initial.application.publicationStatus = 'pending';
    initial.application.applicationReceipt = {
      kind: 'location_profile_correction_decision',
      ids: [requestId],
    };
    initial.correctionDecision = {
      requestId,
      locationId,
      expectedLocationUpdatedAt: locationUpdatedAt,
      changedFieldPaths: ['addressLine', 'amenities'],
      decidedAt: appliedAt.toISOString(),
    };
    if (initial.location !== null) initial.location.updatedAt = appliedAt.toISOString();
    const backend = createBackend(initial);

    await expect(
      applyProblemLocationCorrectionApplication(
        context,
        backend,
        applicationId,
        sourceId,
        request(),
        new Date('2026-07-18T09:00:00.000Z'),
      ),
    ).resolves.toMatchObject({ state: 'already_applied', appliedAt: appliedAt.toISOString() });
    expect(backend.applications).toHaveLength(0);
  });

  it('rejects unsupported country or coordinate changes instead of partially applying them', async () => {
    const unsupported = state();
    const correction = {
      ...proposedCorrection,
      addressLine: null,
      amenities: null,
      countryCode: 'JP',
    };
    if (unsupported.sourceDecisionEvent !== null) {
      unsupported.sourceDecisionEvent.internalNote = serializeProblemReportDecisionEvent({
        schemaVersion: 'problem-report-decision-event-v1',
        requestFingerprint: 'b'.repeat(64),
        operation: 'approve_correction_handoff',
        reportType: 'wrong_address',
        claimId: null,
        evidenceId: null,
        verificationEventId: null,
        claimAction: null,
        proposedCorrection: correction,
        duplicateTarget: null,
        publicSummary: 'Country correction.',
        internalNote: null,
      });
    }
    const projection = unsupported.submission.normalizedPayload as Record<string, unknown>;
    projection.proposedCorrection = correction;
    const backend = createBackend(unsupported);

    await expect(
      applyProblemLocationCorrectionApplication(
        context,
        backend,
        applicationId,
        sourceId,
        request(),
        appliedAt,
      ),
    ).rejects.toMatchObject({ code: 'ineligible' });
    expect(backend.applications).toHaveLength(0);
  });

  it('rejects stale application or Location versions', async () => {
    await expect(
      applyProblemLocationCorrectionApplication(
        context,
        createBackend(),
        applicationId,
        sourceId,
        request({ expectedApplicationUpdatedAt: '2026-07-18T07:01:00.000Z' }),
        appliedAt,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });

    await expect(
      applyProblemLocationCorrectionApplication(
        context,
        createBackend(),
        applicationId,
        sourceId,
        request({ expectedLocationUpdatedAt: '2026-07-18T06:01:00.000Z' }),
        appliedAt,
      ),
    ).rejects.toMatchObject({ code: 'ineligible' });
  });

  it('fails authorization before reading private application state', async () => {
    const backend = createBackend();
    await expect(
      applyProblemLocationCorrectionApplication(
        { actorId: 'reviewer:nope', actorType: 'human', capabilities: [] as never },
        backend,
        applicationId,
        sourceId,
        request(),
        appliedAt,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(backend.reads()).toBe(0);
  });
});
