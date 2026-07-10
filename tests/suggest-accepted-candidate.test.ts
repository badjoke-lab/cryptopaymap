import { describe, expect, it, vi } from 'vitest';
import {
  SuggestAcceptedCandidateError,
  acceptSuggestSubmissionAsCandidate,
  type SuggestAcceptedCandidateBackend,
  type SuggestAcceptedCandidateCommitCommand,
  type SuggestAcceptedCandidateEventRecord,
  type SuggestAcceptedCandidateState,
} from '../src/admin/submissions/accepted-candidate';
import type { SubmissionCandidateCreateContext } from '../src/admin/submissions/authorization';
import { serializeSuggestAcceptedCandidateEventPayload } from '../src/submissions/accepted-candidate-contract';
import { SubmissionPersistenceError } from '../src/submissions/persistence';

const submissionId = '10000000-0000-4000-8000-000000000001';
const sourceId = '30000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const expectedUpdatedAt = '2026-07-10T06:00:00.000Z';
const payloadUpdatedAt = '2026-07-10T05:55:00.000Z';
const decidedAt = new Date('2026-07-10T06:05:00.000Z');
const context: SubmissionCandidateCreateContext = {
  actorId: 'cloudflare-access:candidate-reviewer',
  actorType: 'human',
  capabilities: ['submission:candidate:create'],
};

function request() {
  return {
    schemaVersion: 'suggest-accepted-candidate-v1',
    requestId,
    expectedStatus: 'in_review',
    expectedUpdatedAt,
    reasonCode: 'useful_but_incomplete' as const,
    note: 'Useful payment lead that needs independent verification.',
  };
}

function projection() {
  return {
    suggestionKind: 'online_service' as const,
    entityType: 'online_service' as const,
    entity: {
      name: 'Example Hosting',
      legalName: null,
      websiteUrl: 'https://hosting.example/',
      countryCode: 'US',
    },
    place: null,
    categories: [],
    paymentProposals: [
      {
        assetSlug: 'usdc',
        networkSlug: null,
        routeType: 'processor_checkout' as const,
        paymentMethod: 'processor_checkout' as const,
        processor: { name: 'Example Processor', websiteUrl: null },
        contractAddress: null,
        howToPay: 'Choose crypto during hosted checkout.',
        restrictions: null,
        isPrimary: true,
      },
    ],
    observedAt: '2026-07-01',
    relationship: 'customer' as const,
    evidenceLinks: [
      {
        url: 'https://hosting.example/help/payments',
        observedAt: '2026-07-01',
        summary: 'Official payment information.',
      },
    ],
  };
}

function state(
  overrides: Partial<SuggestAcceptedCandidateState> = {},
): SuggestAcceptedCandidateState {
  return {
    submissionId,
    publicId: 'CPM-S-2026-000001',
    submissionType: 'suggest',
    workflowStatus: 'in_review',
    updatedAt: expectedUpdatedAt,
    priority: 25,
    normalizedPayload: projection(),
    payloadUpdatedAt,
    ...overrides,
  };
}

function event(
  overrides: Partial<SuggestAcceptedCandidateEventRecord> = {},
): SuggestAcceptedCandidateEventRecord {
  return {
    eventId: requestId,
    submissionId,
    fromStatus: 'in_review',
    toStatus: 'resolved',
    action: 'submission_accepted_as_candidate',
    reasonCode: request().reasonCode,
    actorId: context.actorId,
    internalNote: serializeSuggestAcceptedCandidateEventPayload({
      schemaVersion: 'suggest-accepted-candidate-event-v1',
      candidateId: '40000000-0000-4000-8000-000000000001',
      sourceRecordId: '50000000-0000-4000-8000-000000000001',
      sourceId,
      candidateType: 'online_service',
      normalizedName: 'example hosting',
      reasonCode: request().reasonCode,
      note: request().note,
    }),
    createdAt: decidedAt.toISOString(),
    ...overrides,
  };
}

function backend(
  options: {
    currentState?: SuggestAcceptedCandidateState | null;
    existingEvent?: SuggestAcceptedCandidateEventRecord | null;
    commit?: (command: SuggestAcceptedCandidateCommitCommand) => Promise<void>;
  } = {},
) {
  const commitAcceptedCandidate = vi.fn(options.commit ?? (async () => undefined));
  const value: SuggestAcceptedCandidateBackend = {
    async readState() {
      return options.currentState === undefined ? state() : options.currentState;
    },
    async readDecisionEvent() {
      return options.existingEvent ?? null;
    },
    commitAcceptedCandidate,
  };
  return { value, commitAcceptedCandidate };
}

describe('P5-02H accepted-as-Candidate outcome', () => {
  it('builds one private Candidate transaction from the normalized Suggest projection', async () => {
    const testBackend = backend();
    const receipt = await acceptSuggestSubmissionAsCandidate(
      context,
      testBackend.value,
      submissionId,
      sourceId,
      request(),
      decidedAt,
    );

    expect(receipt).toMatchObject({
      state: 'committed',
      submissionId,
      fromStatus: 'in_review',
      toStatus: 'resolved',
      resolution: 'accepted_as_candidate',
      reasonCode: 'useful_but_incomplete',
      decidedAt: decidedAt.toISOString(),
    });
    expect(testBackend.commitAcceptedCandidate).toHaveBeenCalledOnce();
    const command = testBackend.commitAcceptedCandidate.mock.calls[0]?.[0];
    expect(command).toMatchObject({
      eventId: requestId,
      submissionId,
      publicId: 'CPM-S-2026-000001',
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      expectedPayloadUpdatedAt: new Date(payloadUpdatedAt),
      actorId: context.actorId,
      actorType: 'human',
      sourceId,
      candidateType: 'online_service',
      normalizedName: 'example hosting',
      priority: 25,
      observedAt: new Date('2026-07-01T00:00:00.000Z'),
      normalizedPayload: projection(),
      reasonCode: 'useful_but_incomplete',
      decidedAt,
    });
    expect(command?.candidateId).toBe(receipt.candidateId);
    expect(command?.sourceRecordId).toBe(receipt.sourceRecordId);
    expect(command?.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(command?.normalizedPayload)).not.toContain('encryptedEmail');
    expect(JSON.stringify(command?.normalizedPayload)).not.toContain('originalPayload');
  });

  it('replays the exact durable accepted-as-Candidate decision', async () => {
    const testBackend = backend({ existingEvent: event() });
    const receipt = await acceptSuggestSubmissionAsCandidate(
      context,
      testBackend.value,
      submissionId,
      sourceId,
      request(),
      decidedAt,
    );

    expect(receipt).toEqual({
      state: 'replayed',
      submissionId,
      candidateId: '40000000-0000-4000-8000-000000000001',
      sourceRecordId: '50000000-0000-4000-8000-000000000001',
      fromStatus: 'in_review',
      toStatus: 'resolved',
      resolution: 'accepted_as_candidate',
      reasonCode: 'useful_but_incomplete',
      decidedAt: decidedAt.toISOString(),
    });
    expect(testBackend.commitAcceptedCandidate).not.toHaveBeenCalled();
  });

  it('rejects request UUID reuse across a different user-submission source channel', async () => {
    const testBackend = backend({ existingEvent: event() });
    await expect(
      acceptSuggestSubmissionAsCandidate(
        context,
        testBackend.value,
        submissionId,
        '30000000-0000-4000-8000-000000000099',
        request(),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
  });

  it('rejects stale Submission state and invalid normalized projection before commit', async () => {
    const stale = backend({ currentState: state({ updatedAt: '2026-07-10T06:01:00.000Z' }) });
    await expect(
      acceptSuggestSubmissionAsCandidate(
        context,
        stale.value,
        submissionId,
        sourceId,
        request(),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(stale.commitAcceptedCandidate).not.toHaveBeenCalled();

    const invalid = backend({ currentState: state({ normalizedPayload: { private: true } }) });
    await expect(
      acceptSuggestSubmissionAsCandidate(
        context,
        invalid.value,
        submissionId,
        sourceId,
        request(),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_projection' });
    expect(invalid.commitAcceptedCandidate).not.toHaveBeenCalled();
  });

  it('recovers a concurrent identical Candidate transaction as replay', async () => {
    let eventVisible = false;
    const testBackend: SuggestAcceptedCandidateBackend = {
      async readState() {
        return state();
      },
      async readDecisionEvent() {
        return eventVisible ? event() : null;
      },
      async commitAcceptedCandidate() {
        eventVisible = true;
        throw new SubmissionPersistenceError('conflict', 'simulated concurrent commit');
      },
    };

    const receipt = await acceptSuggestSubmissionAsCandidate(
      context,
      testBackend,
      submissionId,
      sourceId,
      request(),
      decidedAt,
    );
    expect(receipt.state).toBe('replayed');
  });

  it('fails closed when conflict recovery cannot find a matching event', async () => {
    const testBackend = backend({
      commit: async () => {
        throw new SubmissionPersistenceError('conflict', 'simulated stale guard');
      },
    });

    await expect(
      acceptSuggestSubmissionAsCandidate(
        context,
        testBackend.value,
        submissionId,
        sourceId,
        request(),
        decidedAt,
      ),
    ).rejects.toBeInstanceOf(SuggestAcceptedCandidateError);
    await expect(
      acceptSuggestSubmissionAsCandidate(
        context,
        testBackend.value,
        submissionId,
        sourceId,
        request(),
        decidedAt,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
  });
});
