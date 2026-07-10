import { describe, expect, it, vi } from 'vitest';
import type { SubmissionTransitionContext } from '../src/admin/submissions/authorization';
import {
  SuggestInformationRequestError,
  requestSuggestSubmissionInformation,
  type SuggestInformationRequestBackend,
  type SuggestInformationRequestCommitCommand,
  type SuggestInformationRequestEventRecord,
  type SuggestInformationRequestState,
} from '../src/admin/submissions/information-request';
import {
  parseSubmissionInformationRequestEventPayload,
  serializeSubmissionInformationRequestEventPayload,
} from '../src/submissions/information-request-contract';
import { SubmissionPersistenceError } from '../src/submissions/persistence';

const submissionId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const expectedUpdatedAt = '2026-07-10T03:00:00.000Z';
const changedAt = new Date('2026-07-10T03:05:00.000Z');
const context: SubmissionTransitionContext = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human',
  capabilities: ['submission:transition'],
};

function request() {
  return {
    schemaVersion: 'suggest-information-request-v1',
    requestId,
    expectedStatus: 'in_review',
    expectedUpdatedAt,
    requestedAction: 'Please confirm which network is used for USDT payment.',
    publicMessage: 'We need the payment network before this place can be fully reviewed.',
  };
}

function state(
  overrides: Partial<SuggestInformationRequestState> = {},
): SuggestInformationRequestState {
  return {
    submissionId,
    submissionType: 'suggest',
    workflowStatus: 'in_review',
    updatedAt: expectedUpdatedAt,
    ...overrides,
  };
}

function event(
  overrides: Partial<SuggestInformationRequestEventRecord> = {},
): SuggestInformationRequestEventRecord {
  return {
    eventId: requestId,
    submissionId,
    fromStatus: 'in_review',
    toStatus: 'needs_information',
    action: 'submission_information_requested',
    actorId: context.actorId,
    internalNote: serializeSubmissionInformationRequestEventPayload({
      schemaVersion: 'suggest-information-request-event-v1',
      requestedAction: request().requestedAction,
      publicMessage: request().publicMessage,
    }),
    createdAt: changedAt.toISOString(),
    ...overrides,
  };
}

function backend(
  options: {
    currentState?: SuggestInformationRequestState | null;
    existingEvent?: SuggestInformationRequestEventRecord | null;
    commit?: (command: SuggestInformationRequestCommitCommand) => Promise<void>;
  } = {},
) {
  const commitRequest = vi.fn(options.commit ?? (async () => undefined));
  const value: SuggestInformationRequestBackend = {
    async readState() {
      return options.currentState === undefined ? state() : options.currentState;
    },
    async readRequestEvent() {
      return options.existingEvent ?? null;
    },
    commitRequest,
  };
  return { value, commitRequest };
}

describe('P5-02F Suggest information request', () => {
  it('commits in_review to needs_information with bounded public request text', async () => {
    const testBackend = backend();
    const receipt = await requestSuggestSubmissionInformation(
      context,
      testBackend.value,
      submissionId,
      request(),
      changedAt,
    );

    expect(receipt).toEqual({
      state: 'committed',
      submissionId,
      fromStatus: 'in_review',
      toStatus: 'needs_information',
      requestedAction: request().requestedAction,
      publicMessage: request().publicMessage,
      changedAt: changedAt.toISOString(),
    });
    expect(testBackend.commitRequest).toHaveBeenCalledOnce();
    const command = testBackend.commitRequest.mock.calls[0]?.[0];
    expect(command).toMatchObject({
      eventId: requestId,
      submissionId,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      actorId: context.actorId,
      changedAt,
    });
    expect(parseSubmissionInformationRequestEventPayload(command?.internalNote ?? null)).toEqual({
      schemaVersion: 'suggest-information-request-event-v1',
      requestedAction: request().requestedAction,
      publicMessage: request().publicMessage,
    });
  });

  it('replays an identical request from the durable event record', async () => {
    const testBackend = backend({ existingEvent: event() });
    const receipt = await requestSuggestSubmissionInformation(
      context,
      testBackend.value,
      submissionId,
      request(),
      changedAt,
    );

    expect(receipt.state).toBe('replayed');
    expect(receipt.changedAt).toBe(changedAt.toISOString());
    expect(testBackend.commitRequest).not.toHaveBeenCalled();
  });

  it('rejects request UUID reuse when safe text differs', async () => {
    const testBackend = backend({ existingEvent: event() });
    const changed = { ...request(), publicMessage: 'Different public message.' };

    await expect(
      requestSuggestSubmissionInformation(
        context,
        testBackend.value,
        submissionId,
        changed,
        changedAt,
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
  });

  it('rejects stale state and non-Suggest submissions before commit', async () => {
    const stale = backend({ currentState: state({ updatedAt: '2026-07-10T03:01:00.000Z' }) });
    await expect(
      requestSuggestSubmissionInformation(context, stale.value, submissionId, request(), changedAt),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(stale.commitRequest).not.toHaveBeenCalled();

    const report = backend({ currentState: state({ submissionType: 'report' }) });
    await expect(
      requestSuggestSubmissionInformation(
        context,
        report.value,
        submissionId,
        request(),
        changedAt,
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('rejects HTML-like request text', async () => {
    const testBackend = backend();
    await expect(
      requestSuggestSubmissionInformation(
        context,
        testBackend.value,
        submissionId,
        { ...request(), publicMessage: '<strong>send network</strong>' },
        changedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(testBackend.commitRequest).not.toHaveBeenCalled();
  });

  it('recovers a concurrent identical commit as replay', async () => {
    let eventVisible = false;
    const testBackend: SuggestInformationRequestBackend = {
      async readState() {
        return state();
      },
      async readRequestEvent() {
        return eventVisible ? event() : null;
      },
      async commitRequest() {
        eventVisible = true;
        throw new SubmissionPersistenceError('conflict', 'simulated concurrent commit');
      },
    };

    const receipt = await requestSuggestSubmissionInformation(
      context,
      testBackend,
      submissionId,
      request(),
      changedAt,
    );
    expect(receipt.state).toBe('replayed');
  });

  it('fails closed when conflict recovery cannot find an identical event', async () => {
    const testBackend = backend({
      commit: async () => {
        throw new SubmissionPersistenceError('conflict', 'simulated stale guard');
      },
    });

    await expect(
      requestSuggestSubmissionInformation(
        context,
        testBackend.value,
        submissionId,
        request(),
        changedAt,
      ),
    ).rejects.toBeInstanceOf(SuggestInformationRequestError);
    await expect(
      requestSuggestSubmissionInformation(
        context,
        testBackend.value,
        submissionId,
        request(),
        changedAt,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
  });
});
