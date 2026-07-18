import { describe, expect, it } from 'vitest';
import { SubmissionPersistenceError } from '../src/submissions/persistence';
import {
  registerSubmissionApplication,
  type SubmissionApplicationRegistrationBackend,
  type SubmissionApplicationRegistrationCommand,
  type SubmissionApplicationRegistrationRecord,
  type SubmissionApplicationRegistrationState,
  type SubmissionApplicationSourceDecisionKind,
} from '../src/admin/submissions/application-registration';

const submissionId = '10000000-0000-4000-8000-000000000001';
const sourceEventId = '20000000-0000-4000-8000-000000000001';
const requestId = '30000000-0000-4000-8000-000000000001';
const candidatePromotionDecisionId = '40000000-0000-4000-8000-000000000001';
const fieldApplicationEventId = '50000000-0000-4000-8000-000000000001';
const updatedAt = '2026-07-17T06:00:00.000Z';
const registeredAt = new Date('2026-07-17T06:05:00.000Z');
const context = {
  actorId: 'reviewer:application',
  actorType: 'human' as const,
  capabilities: ['submission:application:register'] as ['submission:application:register'],
};

interface Scenario {
  sourceDecisionKind: SubmissionApplicationSourceDecisionKind;
  submissionType: SubmissionApplicationRegistrationState['submissionType'];
  resolution: string;
  action: string;
  candidatePromotionDecisionId?: string | null;
  businessClaimFieldApplicationEventId?: string | null;
  applicationKind:
    | 'candidate_resolution'
    | 'report_evidence'
    | 'problem_correction'
    | 'problem_claim_mutation'
    | 'business_claim_update'
    | 'photo_media_set';
  applicationStatus: 'pending' | 'committed';
  publicationStatus: 'blocked' | 'pending';
  receiptKind: 'submission_event' | 'candidate_promotion_decision' | null;
  receiptId: string | null;
}

const scenarios: Scenario[] = [
  {
    sourceDecisionKind: 'suggest_candidate_acceptance',
    submissionType: 'suggest',
    resolution: 'accepted_as_candidate',
    action: 'submission_accepted_as_candidate',
    applicationKind: 'candidate_resolution',
    applicationStatus: 'pending',
    publicationStatus: 'blocked',
    receiptKind: null,
    receiptId: null,
  },
  {
    sourceDecisionKind: 'suggest_candidate_acceptance',
    submissionType: 'suggest',
    resolution: 'accepted_as_candidate',
    action: 'submission_accepted_as_candidate',
    candidatePromotionDecisionId,
    applicationKind: 'candidate_resolution',
    applicationStatus: 'committed',
    publicationStatus: 'pending',
    receiptKind: 'candidate_promotion_decision',
    receiptId: candidatePromotionDecisionId,
  },
  {
    sourceDecisionKind: 'positive_payment_evidence',
    submissionType: 'payment_report',
    resolution: 'approved',
    action: 'positive_payment_evidence_decided',
    applicationKind: 'report_evidence',
    applicationStatus: 'committed',
    publicationStatus: 'pending',
    receiptKind: 'submission_event',
    receiptId: sourceEventId,
  },
  {
    sourceDecisionKind: 'negative_report_evidence',
    submissionType: 'problem_report',
    resolution: 'approved',
    action: 'negative_report_evidence_decided',
    applicationKind: 'report_evidence',
    applicationStatus: 'committed',
    publicationStatus: 'pending',
    receiptKind: 'submission_event',
    receiptId: sourceEventId,
  },
  {
    sourceDecisionKind: 'problem_correction_handoff',
    submissionType: 'problem_report',
    resolution: 'approved',
    action: 'problem_correction_handoff_approved',
    applicationKind: 'problem_correction',
    applicationStatus: 'pending',
    publicationStatus: 'blocked',
    receiptKind: null,
    receiptId: null,
  },
  {
    sourceDecisionKind: 'problem_claim_mutation',
    submissionType: 'problem_report',
    resolution: 'approved',
    action: 'negative_claim_action_decided',
    applicationKind: 'problem_claim_mutation',
    applicationStatus: 'committed',
    publicationStatus: 'pending',
    receiptKind: 'submission_event',
    receiptId: sourceEventId,
  },
  {
    sourceDecisionKind: 'business_claim_relationship',
    submissionType: 'claim',
    resolution: 'approved',
    action: 'business_claim_relationship_approved',
    applicationKind: 'business_claim_update',
    applicationStatus: 'pending',
    publicationStatus: 'blocked',
    receiptKind: null,
    receiptId: null,
  },
  {
    sourceDecisionKind: 'business_claim_relationship',
    submissionType: 'claim',
    resolution: 'approved',
    action: 'business_claim_relationship_approved',
    businessClaimFieldApplicationEventId: fieldApplicationEventId,
    applicationKind: 'business_claim_update',
    applicationStatus: 'committed',
    publicationStatus: 'pending',
    receiptKind: 'submission_event',
    receiptId: fieldApplicationEventId,
  },
  {
    sourceDecisionKind: 'photos_parent_resolution',
    submissionType: 'photos',
    resolution: 'partially_approved',
    action: 'photo_parent_resolution_decided',
    applicationKind: 'photo_media_set',
    applicationStatus: 'committed',
    publicationStatus: 'pending',
    receiptKind: 'submission_event',
    receiptId: sourceEventId,
  },
];

function stateFor(scenario: Scenario): SubmissionApplicationRegistrationState {
  return {
    submissionId,
    submissionType: scenario.submissionType,
    workflowStatus: 'resolved',
    resolution: scenario.resolution,
    updatedAt,
    sourceDecisionEvent: {
      eventId: sourceEventId,
      submissionId,
      toStatus: 'resolved',
      action: scenario.action,
      createdAt: updatedAt,
    },
    candidatePromotionDecisionId: scenario.candidatePromotionDecisionId ?? null,
    businessClaimFieldApplicationEventId: scenario.businessClaimFieldApplicationEventId ?? null,
  };
}

function requestFor(
  sourceDecisionKind: SubmissionApplicationSourceDecisionKind,
  overrides: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 'submission-application-registration-v1',
    requestId,
    sourceDecisionKind,
    sourceDecisionEventId: sourceEventId,
    expectedSubmissionUpdatedAt: updatedAt,
    ...overrides,
  };
}

function recordFromCommand(
  command: SubmissionApplicationRegistrationCommand,
): SubmissionApplicationRegistrationRecord {
  return {
    registrationRequestId: command.registrationRequestId,
    applicationId: command.applicationId,
    submissionId: command.submissionId,
    submissionType: command.submissionType,
    sourceDecisionKind: command.sourceDecisionKind,
    sourceDecisionEventId: command.sourceDecisionEventId,
    applicationKind: command.applicationKind,
    applicationStatus: command.applicationStatus,
    publicationStatus: command.publicationStatus,
    applicationReceipt: command.applicationReceipt,
    publicationReceipt: command.publicationReceipt,
    actorId: command.actorId,
    requestFingerprint: command.requestFingerprint,
    registeredAt: command.registeredAt.toISOString(),
  };
}

function createBackend(initialState: SubmissionApplicationRegistrationState) {
  const registrations = new Map<string, SubmissionApplicationRegistrationRecord>();
  const bySubmission = new Map<string, SubmissionApplicationRegistrationRecord>();
  const commits: SubmissionApplicationRegistrationCommand[] = [];
  let failAfterCommit = false;
  let stateReads = 0;
  const backend: SubmissionApplicationRegistrationBackend & {
    commits: SubmissionApplicationRegistrationCommand[];
    setFailAfterCommit(value: boolean): void;
    stateReads(): number;
  } = {
    commits,
    setFailAfterCommit(value) {
      failAfterCommit = value;
    },
    stateReads() {
      return stateReads;
    },
    async readRegistration(id) {
      return registrations.get(id) ?? null;
    },
    async readApplicationBySubmission(id) {
      return bySubmission.get(id) ?? null;
    },
    async readState(id, eventId) {
      stateReads += 1;
      return id === submissionId && eventId === sourceEventId
        ? structuredClone(initialState)
        : null;
    },
    async commitRegistration(command) {
      commits.push(command);
      const record = recordFromCommand(command);
      registrations.set(command.registrationRequestId, record);
      bySubmission.set(command.submissionId, record);
      if (failAfterCommit) {
        throw new SubmissionPersistenceError('conflict', 'synthetic registration race');
      }
    },
  };
  return backend;
}

describe('P5-07B1 Submission application registration', () => {
  it.each(
    scenarios,
  )('derives $applicationStatus/$publicationStatus for $sourceDecisionKind', async (scenario) => {
    const backend = createBackend(stateFor(scenario));
    const receipt = await registerSubmissionApplication(
      context,
      backend,
      submissionId,
      requestFor(scenario.sourceDecisionKind),
      registeredAt,
    );

    expect(receipt).toMatchObject({
      state: 'committed',
      submissionId,
      submissionType: scenario.submissionType,
      sourceDecisionKind: scenario.sourceDecisionKind,
      sourceDecisionEventId: sourceEventId,
      applicationKind: scenario.applicationKind,
      applicationStatus: scenario.applicationStatus,
      publicationStatus: scenario.publicationStatus,
    });
    expect(receipt.applicationReceipt).toEqual(
      scenario.receiptKind === null
        ? null
        : { kind: scenario.receiptKind, ids: [scenario.receiptId] },
    );
    expect(receipt.publicationReceipt).toBeNull();
    expect(backend.commits).toHaveLength(1);
    expect(backend.commits[0]).toMatchObject({
      submissionId,
      expectedSubmissionUpdatedAt: new Date(updatedAt),
      applicationStatus: scenario.applicationStatus,
      publicationStatus: scenario.publicationStatus,
    });
  });

  it('rejects a mismatched type, action, resolution, or stale Submission version', async () => {
    const scenario = scenarios[2];
    if (scenario === undefined) throw new Error('Scenario is missing.');

    for (const state of [
      { ...stateFor(scenario), submissionType: 'photos' as const },
      {
        ...stateFor(scenario),
        sourceDecisionEvent: {
          ...stateFor(scenario).sourceDecisionEvent!,
          action: 'negative_report_evidence_decided',
        },
      },
      { ...stateFor(scenario), resolution: 'not_approved' },
    ]) {
      await expect(
        registerSubmissionApplication(
          context,
          createBackend(state),
          submissionId,
          requestFor(scenario.sourceDecisionKind),
          registeredAt,
        ),
      ).rejects.toMatchObject({ code: 'ineligible' });
    }

    await expect(
      registerSubmissionApplication(
        context,
        createBackend(stateFor(scenario)),
        submissionId,
        requestFor(scenario.sourceDecisionKind, {
          expectedSubmissionUpdatedAt: '2026-07-17T05:59:00.000Z',
        }),
        registeredAt,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('replays identical content and rejects changed content under the same UUID', async () => {
    const scenario = scenarios[4];
    if (scenario === undefined) throw new Error('Scenario is missing.');
    const backend = createBackend(stateFor(scenario));
    const request = requestFor(scenario.sourceDecisionKind);

    await expect(
      registerSubmissionApplication(context, backend, submissionId, request, registeredAt),
    ).resolves.toMatchObject({ state: 'committed' });
    await expect(
      registerSubmissionApplication(
        context,
        backend,
        submissionId,
        request,
        new Date('2026-07-17T07:00:00.000Z'),
      ),
    ).resolves.toMatchObject({ state: 'replayed' });
    await expect(
      registerSubmissionApplication(
        context,
        backend,
        submissionId,
        requestFor(scenario.sourceDecisionKind, {
          expectedSubmissionUpdatedAt: '2026-07-17T05:59:00.000Z',
        }),
        registeredAt,
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
    expect(backend.commits).toHaveLength(1);
  });

  it('recovers an identical registration after a concurrent unique conflict', async () => {
    const scenario = scenarios[8];
    if (scenario === undefined) throw new Error('Scenario is missing.');
    const backend = createBackend(stateFor(scenario));
    backend.setFailAfterCommit(true);

    await expect(
      registerSubmissionApplication(
        context,
        backend,
        submissionId,
        requestFor(scenario.sourceDecisionKind),
        registeredAt,
      ),
    ).resolves.toMatchObject({ state: 'replayed', applicationStatus: 'committed' });
  });

  it('rejects a second registration for the same Submission', async () => {
    const scenario = scenarios[0];
    if (scenario === undefined) throw new Error('Scenario is missing.');
    const backend = createBackend(stateFor(scenario));
    await registerSubmissionApplication(
      context,
      backend,
      submissionId,
      requestFor(scenario.sourceDecisionKind),
      registeredAt,
    );

    await expect(
      registerSubmissionApplication(
        context,
        backend,
        submissionId,
        {
          ...requestFor(scenario.sourceDecisionKind),
          requestId: '30000000-0000-4000-8000-000000000002',
        },
        registeredAt,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('fails authorization before reading protected state', async () => {
    const scenario = scenarios[0];
    if (scenario === undefined) throw new Error('Scenario is missing.');
    const backend = createBackend(stateFor(scenario));

    await expect(
      registerSubmissionApplication(
        { actorId: 'reviewer:nope', actorType: 'human', capabilities: [] as never },
        backend,
        submissionId,
        requestFor(scenario.sourceDecisionKind),
        registeredAt,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(backend.stateReads()).toBe(0);
    expect(backend.commits).toHaveLength(0);
  });
});
