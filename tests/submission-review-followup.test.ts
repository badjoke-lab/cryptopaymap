import { describe, expect, it } from 'vitest';
import {
  ReviewFollowupError,
  applySubmissionReviewFollowup,
  type ReviewFollowupBackend,
  type ReviewFollowupCommitCommand,
  type ReviewFollowupEventRecord,
  type ReviewFollowupState,
} from '../src/admin/submissions/review-followup';
import type { SubmissionWorkflowStatus } from '../src/submissions/contract';
import { SubmissionPersistenceError } from '../src/submissions/persistence';

const submissionId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const actorId = 'reviewer:subject';
const initialUpdatedAt = '2026-07-16T00:00:00.000Z';
const changedAt = new Date('2026-07-16T00:01:00.000Z');

function context() {
  return {
    actorId,
    actorType: 'human' as const,
    capabilities: ['submission:review-followup'] as ['submission:review-followup'],
  };
}

class InMemoryBackend implements ReviewFollowupBackend {
  state: ReviewFollowupState | null;
  events = new Map<string, ReviewFollowupEventRecord>();
  failCommit = false;

  constructor(submissionType: string, workflowStatus: SubmissionWorkflowStatus = 'in_review') {
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

  async commitTransition(command: ReviewFollowupCommitCommand) {
    if (this.failCommit) throw new SubmissionPersistenceError('conflict', 'simulated conflict');
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
      internalNote: command.internalNote,
      createdAt: command.changedAt.toISOString(),
    });
  }
}

function informationRequest(
  submissionType: 'suggest' | 'payment_report' | 'problem_report' | 'photos',
) {
  return {
    schemaVersion: 'submission-review-followup-v1' as const,
    requestId,
    submissionType,
    action: 'request_information' as const,
    expectedStatus: 'in_review' as const,
    expectedUpdatedAt: initialUpdatedAt,
    requestedAction: 'Provide a recent official payment source.',
    publicMessage: 'Please provide a recent official source confirming this information.',
  };
}

function holdRequest(submissionType: 'suggest' | 'payment_report' | 'problem_report' | 'photos') {
  return {
    schemaVersion: 'submission-review-followup-v1' as const,
    requestId,
    submissionType,
    action: 'place_on_hold' as const,
    expectedStatus: 'in_review' as const,
    expectedUpdatedAt: initialUpdatedAt,
    holdDays: 30 as const,
    holdReason: 'Awaiting official confirmation.',
    requiredAction: 'Provide an official source.',
    publicMessage: 'Review is paused while official confirmation is requested.',
  };
}

describe('P5-06C1 common Submission review follow-up', () => {
  it.each([
    'suggest',
    'payment_report',
    'problem_report',
    'photos',
  ] as const)('requests information for a %s Submission using the existing private-status event shape', async (submissionType) => {
    const backend = new InMemoryBackend(submissionType);
    const receipt = await applySubmissionReviewFollowup(
      context(),
      backend,
      submissionId,
      informationRequest(submissionType),
      changedAt,
    );

    expect(receipt).toMatchObject({
      state: 'committed',
      submissionType,
      action: 'request_information',
      fromStatus: 'in_review',
      toStatus: 'needs_information',
    });
    expect(backend.state?.workflowStatus).toBe('needs_information');
    expect(backend.events.get(requestId)?.action).toBe('submission_information_requested');
    expect(backend.events.get(requestId)?.internalNote).toContain(
      'suggest-information-request-event-v1',
    );
  });

  it('resumes from needs_information without retaining request text on the resume event', async () => {
    const backend = new InMemoryBackend('photos', 'needs_information');
    const receipt = await applySubmissionReviewFollowup(
      context(),
      backend,
      submissionId,
      {
        schemaVersion: 'submission-review-followup-v1',
        requestId,
        submissionType: 'photos',
        action: 'resume_after_information',
        expectedStatus: 'needs_information',
        expectedUpdatedAt: initialUpdatedAt,
      },
      changedAt,
    );

    expect(receipt.toStatus).toBe('in_review');
    expect(receipt.publicMessage).toBeNull();
    expect(backend.events.get(requestId)?.internalNote).toBeNull();
  });

  it('places a report on a 30-day Hold with a server-computed next review time', async () => {
    const backend = new InMemoryBackend('payment_report');
    const receipt = await applySubmissionReviewFollowup(
      context(),
      backend,
      submissionId,
      holdRequest('payment_report'),
      changedAt,
    );

    expect(receipt).toMatchObject({
      action: 'place_on_hold',
      fromStatus: 'in_review',
      toStatus: 'on_hold',
      holdDays: 30,
      nextReviewAt: '2026-08-15T00:01:00.000Z',
    });
    expect(backend.events.get(requestId)?.internalNote).toContain('suggest-hold-event-v1');
  });

  it('resumes from on_hold and does not perform an automatic date transition', async () => {
    const backend = new InMemoryBackend('suggest', 'on_hold');
    const receipt = await applySubmissionReviewFollowup(
      context(),
      backend,
      submissionId,
      {
        schemaVersion: 'submission-review-followup-v1',
        requestId,
        submissionType: 'suggest',
        action: 'resume_from_hold',
        expectedStatus: 'on_hold',
        expectedUpdatedAt: initialUpdatedAt,
      },
      changedAt,
    );

    expect(receipt.toStatus).toBe('in_review');
    expect(backend.events.get(requestId)?.action).toBe('submission_hold_resumed');
  });

  it('replays exact information requests and rejects changed-content UUID reuse', async () => {
    const backend = new InMemoryBackend('problem_report');
    const exactRequest = informationRequest('problem_report');
    await applySubmissionReviewFollowup(context(), backend, submissionId, exactRequest, changedAt);

    const replay = await applySubmissionReviewFollowup(
      context(),
      backend,
      submissionId,
      exactRequest,
      new Date('2026-07-16T00:02:00.000Z'),
    );
    expect(replay.state).toBe('replayed');

    await expect(
      applySubmissionReviewFollowup(
        context(),
        backend,
        submissionId,
        { ...exactRequest, publicMessage: 'Different public content.' },
        changedAt,
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
  });

  it('rejects stale state, mismatched type, undeclared Claim coverage, and unauthorized actors', async () => {
    const backend = new InMemoryBackend('photos');
    await expect(
      applySubmissionReviewFollowup(
        context(),
        backend,
        submissionId,
        { ...informationRequest('photos'), expectedUpdatedAt: '2026-07-16T00:00:01.000Z' },
        changedAt,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });

    await expect(
      applySubmissionReviewFollowup(
        context(),
        backend,
        submissionId,
        informationRequest('suggest'),
        changedAt,
      ),
    ).rejects.toMatchObject({ code: 'not_found' });

    await expect(
      applySubmissionReviewFollowup(
        context(),
        backend,
        submissionId,
        { ...informationRequest('photos'), submissionType: 'business_claim' },
        changedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_request' });

    await expect(
      applySubmissionReviewFollowup(
        { actorId, actorType: 'human', capabilities: [] as never },
        backend,
        submissionId,
        informationRequest('photos'),
        changedAt,
      ),
    ).rejects.toBeInstanceOf(ReviewFollowupError);
  });

  it('recovers an exact concurrent commit as replay', async () => {
    const backend = new InMemoryBackend('photos');
    backend.failCommit = true;
    const exactRequest = holdRequest('photos');
    backend.events.set(requestId, {
      eventId: requestId,
      submissionId,
      fromStatus: 'in_review',
      toStatus: 'on_hold',
      action: 'submission_hold_started',
      actorId,
      internalNote: JSON.stringify({
        schemaVersion: 'suggest-hold-event-v1',
        holdDays: 30,
        nextReviewAt: '2026-08-15T00:01:00.000Z',
        holdReason: exactRequest.holdReason,
        requiredAction: exactRequest.requiredAction,
        publicMessage: exactRequest.publicMessage,
      }),
      createdAt: changedAt.toISOString(),
    });

    const receipt = await applySubmissionReviewFollowup(
      context(),
      backend,
      submissionId,
      exactRequest,
      changedAt,
    );
    expect(receipt.state).toBe('replayed');
  });
});
