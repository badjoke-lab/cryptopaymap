import { describe, expect, it, vi } from 'vitest';
import type { SubmissionTransitionContext } from '../src/admin/submissions/authorization';
import {
  SuggestReviewTransitionError,
  applySuggestReviewTransition,
  type SuggestReviewTransitionBackend,
  type SuggestReviewTransitionCommitCommand,
  type SuggestReviewTransitionEventRecord,
  type SuggestReviewTransitionState,
} from '../src/admin/submissions/transitions';
import { SubmissionPersistenceError } from '../src/submissions/persistence';

const submissionId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const expectedUpdatedAt = '2026-07-10T02:00:00.000Z';
const changedAt = new Date('2026-07-10T02:05:00.000Z');
const context: SubmissionTransitionContext = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human',
  capabilities: ['submission:transition'],
};

function request(action: 'begin_triage' | 'begin_review' = 'begin_triage') {
  return {
    schemaVersion: 'suggest-review-transition-v1',
    requestId,
    action,
    expectedStatus: action === 'begin_triage' ? 'received' : 'triage',
    expectedUpdatedAt,
  };
}

function state(
  workflowStatus: SuggestReviewTransitionState['workflowStatus'] = 'received',
): SuggestReviewTransitionState {
  return {
    submissionId,
    submissionType: 'suggest',
    workflowStatus,
    updatedAt: expectedUpdatedAt,
  };
}

function event(
  overrides: Partial<SuggestReviewTransitionEventRecord> = {},
): SuggestReviewTransitionEventRecord {
  return {
    eventId: requestId,
    submissionId,
    fromStatus: 'received',
    toStatus: 'triage',
    action: 'submission_triage_started',
    actorId: context.actorId,
    createdAt: changedAt.toISOString(),
    ...overrides,
  };
}

function backend(options: {
  currentState?: SuggestReviewTransitionState | null;
  existingEvent?: SuggestReviewTransitionEventRecord | null;
  commit?: (command: SuggestReviewTransitionCommitCommand) => Promise<void>;
} = {}) {
  const commitTransition = vi.fn(
    options.commit ??
      (async () => {
        return;
      }),
  );
  const value: SuggestReviewTransitionBackend = {
    async readState() {
      return options.currentState === undefined ? state() : options.currentState;
    },
    async readEvent() {
      return options.existingEvent ?? null;
    },
    commitTransition,
  };
  return { value, commitTransition };
}

describe('P5-02E guarded Suggest review transitions', () => {
  it('commits received to triage with an exact-state guarded event command', async () => {
    const testBackend = backend();
    const receipt = await applySuggestReviewTransition(
      context,
      testBackend.value,
      submissionId,
      request(),
      changedAt,
    );

    expect(receipt).toEqual({
      state: 'committed',
      submissionId,
      fromStatus: 'received',
      toStatus: 'triage',
      action: 'begin_triage',
      changedAt: changedAt.toISOString(),
    });
    expect(testBackend.commitTransition).toHaveBeenCalledWith({
      eventId: requestId,
      submissionId,
      expectedStatus: 'received',
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      toStatus: 'triage',
      eventAction: 'submission_triage_started',
      actorId: context.actorId,
      changedAt,
    });
  });

  it('commits triage to in_review as the only second action in this slice', async () => {
    const testBackend = backend({ currentState: state('triage') });
    const receipt = await applySuggestReviewTransition(
      context,
      testBackend.value,
      submissionId,
      request('begin_review'),
      changedAt,
    );

    expect(receipt).toMatchObject({
      state: 'committed',
      fromStatus: 'triage',
      toStatus: 'in_review',
      action: 'begin_review',
    });
  });

  it('replays an identical request UUID from the durable event record without a second commit', async () => {
    const testBackend = backend({ existingEvent: event() });
    const receipt = await applySuggestReviewTransition(
      context,
      testBackend.value,
      submissionId,
      request(),
      changedAt,
    );

    expect(receipt.state).toBe('replayed');
    expect(receipt.changedAt).toBe(changedAt.toISOString());
    expect(testBackend.commitTransition).not.toHaveBeenCalled();
  });

  it('rejects a request UUID that was already used for a different transition', async () => {
    const testBackend = backend({
      existingEvent: event({ action: 'submission_review_started', fromStatus: 'triage', toStatus: 'in_review' }),
    });

    await expect(
      applySuggestReviewTransition(context, testBackend.value, submissionId, request(), changedAt),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
  });

  it('rejects stale expected status or updatedAt before commit', async () => {
    const testBackend = backend({
      currentState: { ...state(), workflowStatus: 'triage', updatedAt: '2026-07-10T02:01:00.000Z' },
    });

    await expect(
      applySuggestReviewTransition(context, testBackend.value, submissionId, request(), changedAt),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(testBackend.commitTransition).not.toHaveBeenCalled();
  });

  it('does not transition a non-Suggest Submission', async () => {
    const testBackend = backend({ currentState: { ...state(), submissionType: 'report' } });

    await expect(
      applySuggestReviewTransition(context, testBackend.value, submissionId, request(), changedAt),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('recovers a concurrent identical commit as replay after persistence conflict', async () => {
    let eventVisible = false;
    const testBackend: SuggestReviewTransitionBackend = {
      async readState() {
        return state();
      },
      async readEvent() {
        return eventVisible ? event() : null;
      },
      async commitTransition() {
        eventVisible = true;
        throw new SubmissionPersistenceError('conflict', 'simulated concurrent commit');
      },
    };

    const receipt = await applySuggestReviewTransition(
      context,
      testBackend,
      submissionId,
      request(),
      changedAt,
    );
    expect(receipt.state).toBe('replayed');
  });

  it('fails closed when persistence conflicts without a matching replay event', async () => {
    const testBackend = backend({
      commit: async () => {
        throw new SubmissionPersistenceError('conflict', 'simulated stale guard');
      },
    });

    await expect(
      applySuggestReviewTransition(context, testBackend.value, submissionId, request(), changedAt),
    ).rejects.toBeInstanceOf(SuggestReviewTransitionError);
    await expect(
      applySuggestReviewTransition(context, testBackend.value, submissionId, request(), changedAt),
    ).rejects.toMatchObject({ code: 'conflict' });
  });
});
