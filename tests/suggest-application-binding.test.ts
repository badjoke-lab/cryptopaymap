import { describe, expect, it } from 'vitest';
import {
  bindSuggestApplicationReceipt,
  type SuggestApplicationBindingBackend,
  type SuggestApplicationBindingState,
} from '../src/admin/submissions/suggest-application-binding';
import type {
  SubmissionApplicationLifecycleRecord,
  SubmissionApplicationTransitionCommand,
  SubmissionApplicationTransitionReplayRecord,
} from '../src/admin/submissions/application-lifecycle';
import { SubmissionPersistenceError } from '../src/submissions/persistence';
import { serializeSuggestAcceptedCandidateEventPayload } from '../src/submissions/accepted-candidate-contract';

const applicationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000001';
const sourceDecisionEventId = '30000000-0000-4000-8000-000000000001';
const candidateId = '40000000-0000-4000-8000-000000000001';
const sourceRecordId = '50000000-0000-4000-8000-000000000001';
const sourceId = '60000000-0000-4000-8000-000000000001';
const promotionDecisionId = '70000000-0000-4000-8000-000000000001';
const entityId = '80000000-0000-4000-8000-000000000001';
const locationId = '90000000-0000-4000-8000-000000000001';
const claimId = 'a0000000-0000-4000-8000-000000000001';
const registrationEventId = 'b0000000-0000-4000-8000-000000000001';
const bindingRequestId = 'c0000000-0000-4000-8000-000000000001';
const decidedAt = '2026-07-18T06:00:00.000Z';
const registeredAt = '2026-07-18T06:05:00.000Z';
const boundAt = new Date('2026-07-18T06:10:00.000Z');

const context = {
  actorId: 'reviewer:suggest-application',
  actorType: 'human' as const,
  capabilities: ['submission:suggest-application:bind'] as ['submission:suggest-application:bind'],
};

function application(): SubmissionApplicationLifecycleRecord {
  return {
    applicationId,
    submissionId,
    submissionType: 'suggest',
    sourceDecisionKind: 'suggest_candidate_acceptance',
    sourceDecisionEventId,
    applicationKind: 'candidate_resolution',
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

function bindingState(): SuggestApplicationBindingState {
  return {
    application: application(),
    submission: {
      submissionId,
      submissionType: 'suggest',
      workflowStatus: 'resolved',
      resolution: 'accepted_as_candidate',
    },
    sourceDecisionEvent: {
      eventId: sourceDecisionEventId,
      submissionId,
      toStatus: 'resolved',
      action: 'submission_accepted_as_candidate',
      internalNote: serializeSuggestAcceptedCandidateEventPayload({
        schemaVersion: 'suggest-accepted-candidate-event-v1',
        candidateId,
        sourceRecordId,
        sourceId,
        candidateType: 'physical_place',
        normalizedName: 'Example Place',
        reasonCode: 'useful_but_incomplete',
        note: null,
      }),
      createdAt: decidedAt,
    },
    promotionDecision: {
      promotionDecisionId,
      candidateId,
      entityId,
      locationId,
      claimId,
      promotedAt: '2026-07-18T06:08:00.000Z',
    },
    candidate: {
      candidateId,
      candidateStatus: 'promoted',
      canonicalEntityId: entityId,
      canonicalLocationId: locationId,
    },
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'suggest-application-binding-v1',
    requestId: bindingRequestId,
    promotionDecisionId,
    expectedApplicationUpdatedAt: registeredAt,
    ...overrides,
  };
}

function createBackend(initial = bindingState()) {
  let state = structuredClone(initial);
  const transitions = new Map<string, SubmissionApplicationTransitionReplayRecord>();
  const commits: SubmissionApplicationTransitionCommand[] = [];
  let bindingReads = 0;
  let failAfterCommit = false;

  const backend: SuggestApplicationBindingBackend & {
    commits: SubmissionApplicationTransitionCommand[];
    bindingReads(): number;
    setFailAfterCommit(value: boolean): void;
  } = {
    commits,
    bindingReads() {
      return bindingReads;
    },
    setFailAfterCommit(value) {
      failAfterCommit = value;
    },
    async readBindingState(id, decisionId) {
      bindingReads += 1;
      if (id !== applicationId) return null;
      const copy = structuredClone(state);
      if (decisionId !== promotionDecisionId) copy.promotionDecision = null;
      return copy;
    },
    async readApplication(id) {
      return id === applicationId ? structuredClone(state.application) : null;
    },
    async readTransition(id) {
      return structuredClone(transitions.get(id) ?? null);
    },
    async commitTransition(command) {
      commits.push(command);
      if (
        state.application.applicationStatus !== command.fromApplicationStatus ||
        state.application.publicationStatus !== command.fromPublicationStatus ||
        state.application.updatedAt !== command.expectedUpdatedAt.toISOString()
      ) {
        throw new SubmissionPersistenceError('conflict', 'synthetic stale application');
      }
      state.application = {
        ...state.application,
        applicationStatus: command.toApplicationStatus,
        publicationStatus: command.toPublicationStatus,
        applicationReceipt: command.nextApplicationReceipt,
        publicationReceipt: command.nextPublicationReceipt,
        updatedAt: command.changedAt.toISOString(),
        events: [
          ...state.application.events,
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
      if (failAfterCommit) {
        throw new SubmissionPersistenceError('conflict', 'synthetic concurrent replay');
      }
    },
  };
  return backend;
}

describe('P5-07C Suggest application receipt binding', () => {
  it('binds an exact Candidate promotion receipt to a pending Suggest application', async () => {
    const backend = createBackend();
    const receipt = await bindSuggestApplicationReceipt(
      context,
      backend,
      applicationId,
      request(),
      boundAt,
    );

    expect(receipt).toEqual({
      state: 'committed',
      applicationId,
      submissionId,
      candidateId,
      promotionDecisionId,
      applicationStatus: 'committed',
      publicationStatus: 'pending',
      transitionEventId: bindingRequestId,
      boundAt: boundAt.toISOString(),
    });
    expect(backend.commits).toHaveLength(1);
    expect(backend.commits[0]).toMatchObject({
      action: 'application_committed',
      nextApplicationReceipt: {
        kind: 'candidate_promotion_decision',
        ids: [promotionDecisionId],
      },
    });
  });

  it('replays an identical binding and rejects changed receipt content', async () => {
    const backend = createBackend();
    await bindSuggestApplicationReceipt(context, backend, applicationId, request(), boundAt);
    await expect(
      bindSuggestApplicationReceipt(
        context,
        backend,
        applicationId,
        request(),
        new Date('2026-07-18T07:00:00.000Z'),
      ),
    ).resolves.toMatchObject({ state: 'replayed', boundAt: boundAt.toISOString() });

    await expect(
      bindSuggestApplicationReceipt(
        context,
        backend,
        applicationId,
        request({
          promotionDecisionId: '70000000-0000-4000-8000-000000000002',
        }),
        boundAt,
      ),
    ).rejects.toMatchObject({ code: 'ineligible' });
    expect(backend.commits).toHaveLength(1);
  });

  it('recognizes a B1 registration that already carries the exact promotion receipt', async () => {
    const state = bindingState();
    state.application.applicationStatus = 'committed';
    state.application.publicationStatus = 'pending';
    state.application.applicationReceipt = {
      kind: 'candidate_promotion_decision',
      ids: [promotionDecisionId],
    };
    const backend = createBackend(state);

    await expect(
      bindSuggestApplicationReceipt(context, backend, applicationId, request(), boundAt),
    ).resolves.toEqual({
      state: 'already_bound',
      applicationId,
      submissionId,
      candidateId,
      promotionDecisionId,
      applicationStatus: 'committed',
      publicationStatus: 'pending',
      transitionEventId: null,
      boundAt: registeredAt,
    });
    expect(backend.commits).toHaveLength(0);
  });

  it('rejects mismatched Candidate, canonical linkage, source event, and stale application state', async () => {
    const mismatches = [
      (() => {
        const state = bindingState();
        if (state.promotionDecision !== null) {
          state.promotionDecision.candidateId = '40000000-0000-4000-8000-000000000002';
        }
        return state;
      })(),
      (() => {
        const state = bindingState();
        if (state.candidate !== null) state.candidate.canonicalEntityId = null;
        return state;
      })(),
      (() => {
        const state = bindingState();
        if (state.sourceDecisionEvent !== null) state.sourceDecisionEvent.action = 'other';
        return state;
      })(),
    ];
    for (const state of mismatches) {
      await expect(
        bindSuggestApplicationReceipt(
          context,
          createBackend(state),
          applicationId,
          request(),
          boundAt,
        ),
      ).rejects.toMatchObject({ code: 'ineligible' });
    }

    await expect(
      bindSuggestApplicationReceipt(
        context,
        createBackend(),
        applicationId,
        request({ expectedApplicationUpdatedAt: '2026-07-18T06:04:00.000Z' }),
        boundAt,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('recovers an identical durable binding after a concurrent conflict', async () => {
    const backend = createBackend();
    backend.setFailAfterCommit(true);
    await expect(
      bindSuggestApplicationReceipt(context, backend, applicationId, request(), boundAt),
    ).resolves.toMatchObject({ state: 'replayed' });
  });

  it('fails authorization before reading binding state', async () => {
    const backend = createBackend();
    await expect(
      bindSuggestApplicationReceipt(
        { actorId: 'reviewer:nope', actorType: 'human', capabilities: [] as never },
        backend,
        applicationId,
        request(),
        boundAt,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(backend.bindingReads()).toBe(0);
  });
});
