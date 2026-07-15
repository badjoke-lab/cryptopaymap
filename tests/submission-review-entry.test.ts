import { describe, expect, it } from 'vitest';
import type { SubmissionWorkflowStatus } from '../src/submissions/contract';
import { SubmissionPersistenceError } from '../src/submissions/persistence';
import {
  ReviewEntryError,
  applySubmissionReviewEntry,
} from '../src/admin/submissions/review-entry';
import type {
  SuggestReviewTransitionBackend,
  SuggestReviewTransitionCommitCommand,
  SuggestReviewTransitionEventRecord,
  SuggestReviewTransitionState,
} from '../src/admin/submissions/transitions';

const submissionId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const actorId = 'reviewer:subject';
const initialUpdatedAt = '2026-07-15T00:00:00.000Z';
const changedAt = new Date('2026-07-15T00:01:00.000Z');

function context() {
  return {
    actorId,
    actorType: 'human' as const,
    capabilities: ['submission:review-entry'] as ['submission:review-entry'],
  };
}

class InMemoryBackend implements SuggestReviewTransitionBackend {
  state: SuggestReviewTransitionState | null;
  events = new Map<string, SuggestReviewTransitionEventRecord>();
  failCommit = false;

  constructor(submissionType: string, workflowStatus: SubmissionWorkflowStatus = 'received') {
    this.state = {
      submissionId,
      submissionType,
      workflowStatus,
      updatedAt: initialUpdatedAt,
    };
  }

  async readState(receivedSubmissionId: string) {
    return this.state?.submissionId === receivedSubmissionId ? structuredClone(this.state) : null;
  }

  async readEvent(eventId: string) {
    return this.events.get(eventId) ?? null;
  }

  async commitTransition(command: SuggestReviewTransitionCommitCommand) {
    if (this.failCommit) {
      throw new SubmissionPersistenceError('conflict', 'simulated conflict');
    }
    if (
      this.state === null ||
      this.state.submissionId !== command.submissionId ||
      this.state.workflowStatus !== command.expectedStatus ||
      this.state.updatedAt !== command.expectedUpdatedAt.toISOString()
    ) {
      throw new SubmissionPersistenceError('conflict', 'state conflict');
    }
    this.state = {
      ...this.state,
      workflowStatus: command.toStatus,
      updatedAt: command.changedAt.toISOString(),
    };
    this.events.set(command.eventId, {
      eventId: command.eventId,
      submissionId: command.submissionId,
      fromStatus: command.expectedStatus,
      toStatus: command.toStatus,
      action: command.eventAction,
      actorId: command.actorId,
      createdAt: command.changedAt.toISOString(),
    });
  }
}

function request(
  submissionType: 'payment_report' | 'problem_report' | 'photos',
  action: 'begin_triage' | 'begin_review' = 'begin_triage',
) {
  return {
    schemaVersion: 'submission-review-entry-v1' as const,
    requestId,
    submissionType,
    action,
    expectedStatus: action === 'begin_triage' ? ('received' as const) : ('triage' as const),
    expectedUpdatedAt: initialUpdatedAt,
  };
}

describe('P5-06B1 common Submission review entry', () => {
  it.each([
    'payment_report',
    'problem_report',
    'photos',
  ] as const)('moves a %s Submission from received to triage', async (submissionType) => {
    const backend = new InMemoryBackend(submissionType);

    const receipt = await applySubmissionReviewEntry(
      context(),
      backend,
      submissionId,
      request(submissionType),
      changedAt,
    );

    expect(receipt).toEqual({
      state: 'committed',
      submissionId,
      submissionType,
      fromStatus: 'received',
      toStatus: 'triage',
      action: 'begin_triage',
      changedAt: changedAt.toISOString(),
    });
    expect(backend.state?.workflowStatus).toBe('triage');
  });

  it('moves a report from triage to in_review', async () => {
    const backend = new InMemoryBackend('payment_report', 'triage');

    const receipt = await applySubmissionReviewEntry(
      context(),
      backend,
      submissionId,
      request('payment_report', 'begin_review'),
      changedAt,
    );

    expect(receipt.toStatus).toBe('in_review');
    expect(backend.state?.workflowStatus).toBe('in_review');
  });

  it('replays the exact request and rejects changed request reuse', async () => {
    const backend = new InMemoryBackend('problem_report');
    const exactRequest = request('problem_report');

    await applySubmissionReviewEntry(context(), backend, submissionId, exactRequest, changedAt);
    const replay = await applySubmissionReviewEntry(
      context(),
      backend,
      submissionId,
      exactRequest,
      new Date('2026-07-15T00:02:00.000Z'),
    );

    expect(replay.state).toBe('replayed');
    await expect(
      applySubmissionReviewEntry(
        context(),
        backend,
        submissionId,
        { ...request('photos'), requestId },
        changedAt,
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('rejects stale expected state and unauthorized actors', async () => {
    const backend = new InMemoryBackend('photos');

    await expect(
      applySubmissionReviewEntry(
        context(),
        backend,
        submissionId,
        { ...request('photos'), expectedUpdatedAt: '2026-07-15T00:00:01.000Z' },
        changedAt,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });

    await expect(
      applySubmissionReviewEntry(
        { actorId, actorType: 'human', capabilities: [] as never },
        backend,
        submissionId,
        request('photos'),
        changedAt,
      ),
    ).rejects.toBeInstanceOf(ReviewEntryError);
  });

  it('recovers an exact concurrent commit as replay', async () => {
    const backend = new InMemoryBackend('payment_report');
    backend.failCommit = true;
    backend.events.set(requestId, {
      eventId: requestId,
      submissionId,
      fromStatus: 'received',
      toStatus: 'triage',
      action: 'submission_triage_started',
      actorId,
      createdAt: changedAt.toISOString(),
    });

    const receipt = await applySubmissionReviewEntry(
      context(),
      backend,
      submissionId,
      request('payment_report'),
      changedAt,
    );

    expect(receipt.state).toBe('replayed');
  });
});
