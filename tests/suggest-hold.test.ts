import { describe, expect, it, vi } from 'vitest';
import type { SubmissionTransitionContext } from '../src/admin/submissions/authorization';
import {
  SuggestHoldError,
  placeSuggestSubmissionOnHold,
  type SuggestHoldBackend,
  type SuggestHoldCommitCommand,
  type SuggestHoldEventRecord,
  type SuggestHoldState,
} from '../src/admin/submissions/hold';
import {
  parseSubmissionHoldEventPayload,
  serializeSubmissionHoldEventPayload,
} from '../src/submissions/hold-contract';
import { SubmissionPersistenceError } from '../src/submissions/persistence';

const submissionId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const expectedUpdatedAt = '2026-07-10T05:00:00.000Z';
const changedAt = new Date('2026-07-10T05:05:00.000Z');
const nextReviewAt = '2026-08-09T05:05:00.000Z';
const context: SubmissionTransitionContext = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human',
  capabilities: ['submission:transition'],
};

function request() {
  return {
    schemaVersion: 'suggest-hold-v1',
    requestId,
    expectedStatus: 'in_review',
    expectedUpdatedAt,
    holdDays: 30 as const,
    holdReason: 'Awaiting a scheduled merchant payment-policy update.',
    requiredAction: 'No submitter action is required before the next review.',
    publicMessage: 'Review is paused until the next scheduled verification date.',
  };
}

function state(overrides: Partial<SuggestHoldState> = {}): SuggestHoldState {
  return {
    submissionId,
    submissionType: 'suggest',
    workflowStatus: 'in_review',
    updatedAt: expectedUpdatedAt,
    ...overrides,
  };
}

function event(overrides: Partial<SuggestHoldEventRecord> = {}): SuggestHoldEventRecord {
  return {
    eventId: requestId,
    submissionId,
    fromStatus: 'in_review',
    toStatus: 'on_hold',
    action: 'submission_hold_started',
    actorId: context.actorId,
    internalNote: serializeSubmissionHoldEventPayload({
      schemaVersion: 'suggest-hold-event-v1',
      holdDays: 30,
      nextReviewAt,
      holdReason: request().holdReason,
      requiredAction: request().requiredAction,
      publicMessage: request().publicMessage,
    }),
    createdAt: changedAt.toISOString(),
    ...overrides,
  };
}

function backend(
  options: {
    currentState?: SuggestHoldState | null;
    existingEvent?: SuggestHoldEventRecord | null;
    commit?: (command: SuggestHoldCommitCommand) => Promise<void>;
  } = {},
) {
  const commitHold = vi.fn(options.commit ?? (async () => undefined));
  const value: SuggestHoldBackend = {
    async readState() {
      return options.currentState === undefined ? state() : options.currentState;
    },
    async readHoldEvent() {
      return options.existingEvent ?? null;
    },
    commitHold,
  };
  return { value, commitHold };
}

describe('P5-02G time-bounded Suggest Hold', () => {
  it('commits in_review to on_hold and computes next review time on the server', async () => {
    const testBackend = backend();
    const receipt = await placeSuggestSubmissionOnHold(
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
      toStatus: 'on_hold',
      holdDays: 30,
      nextReviewAt,
      requiredAction: request().requiredAction,
      publicMessage: request().publicMessage,
      changedAt: changedAt.toISOString(),
    });
    expect(testBackend.commitHold).toHaveBeenCalledOnce();
    const command = testBackend.commitHold.mock.calls[0]?.[0];
    expect(command).toMatchObject({
      eventId: requestId,
      submissionId,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      actorId: context.actorId,
      changedAt,
    });
    expect(parseSubmissionHoldEventPayload(command?.internalNote ?? null)).toEqual({
      schemaVersion: 'suggest-hold-event-v1',
      holdDays: 30,
      nextReviewAt,
      holdReason: request().holdReason,
      requiredAction: request().requiredAction,
      publicMessage: request().publicMessage,
    });
  });

  it('accepts only 30, 60, or 90 day Hold periods', async () => {
    for (const holdDays of [30, 60, 90] as const) {
      const testBackend = backend();
      await expect(
        placeSuggestSubmissionOnHold(
          context,
          testBackend.value,
          submissionId,
          { ...request(), requestId: crypto.randomUUID(), holdDays },
          changedAt,
        ),
      ).resolves.toMatchObject({ state: 'committed', holdDays });
    }

    const invalidBackend = backend();
    await expect(
      placeSuggestSubmissionOnHold(
        context,
        invalidBackend.value,
        submissionId,
        { ...request(), holdDays: 45 },
        changedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(invalidBackend.commitHold).not.toHaveBeenCalled();
  });

  it('replays an identical Hold request from the durable event record', async () => {
    const testBackend = backend({ existingEvent: event() });
    const receipt = await placeSuggestSubmissionOnHold(
      context,
      testBackend.value,
      submissionId,
      request(),
      changedAt,
    );

    expect(receipt.state).toBe('replayed');
    expect(receipt.nextReviewAt).toBe(nextReviewAt);
    expect(testBackend.commitHold).not.toHaveBeenCalled();
  });

  it('rejects request UUID reuse when Hold semantics differ', async () => {
    const testBackend = backend({ existingEvent: event() });
    await expect(
      placeSuggestSubmissionOnHold(
        context,
        testBackend.value,
        submissionId,
        { ...request(), publicMessage: 'Different message.' },
        changedAt,
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
  });

  it('rejects stale state and non-Suggest submissions before commit', async () => {
    const stale = backend({ currentState: state({ updatedAt: '2026-07-10T05:01:00.000Z' }) });
    await expect(
      placeSuggestSubmissionOnHold(context, stale.value, submissionId, request(), changedAt),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(stale.commitHold).not.toHaveBeenCalled();

    const report = backend({ currentState: state({ submissionType: 'problem_report' }) });
    await expect(
      placeSuggestSubmissionOnHold(context, report.value, submissionId, request(), changedAt),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('recovers a concurrent identical Hold commit as replay', async () => {
    let eventVisible = false;
    const testBackend: SuggestHoldBackend = {
      async readState() {
        return state();
      },
      async readHoldEvent() {
        return eventVisible ? event() : null;
      },
      async commitHold() {
        eventVisible = true;
        throw new SubmissionPersistenceError('conflict', 'simulated concurrent commit');
      },
    };

    const receipt = await placeSuggestSubmissionOnHold(
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
      placeSuggestSubmissionOnHold(context, testBackend.value, submissionId, request(), changedAt),
    ).rejects.toBeInstanceOf(SuggestHoldError);
    await expect(
      placeSuggestSubmissionOnHold(context, testBackend.value, submissionId, request(), changedAt),
    ).rejects.toMatchObject({ code: 'conflict' });
  });
});
