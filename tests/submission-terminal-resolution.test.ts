import { describe, expect, it } from 'vitest';
import type {
  SubmissionResolution,
  SubmissionType,
  SubmissionWorkflowStatus,
} from '../src/submissions/contract';
import { SubmissionPersistenceError } from '../src/submissions/persistence';
import {
  SubmissionTerminalResolutionError,
  applySubmissionTerminalResolution,
  type SubmissionTerminalResolutionBackend,
  type SubmissionTerminalResolutionCommitCommand,
  type SubmissionTerminalResolutionDuplicateTarget,
  type SubmissionTerminalResolutionEventRecord,
  type SubmissionTerminalResolutionState,
} from '../src/admin/submissions/terminal-resolution';

const submissionId = '10000000-0000-4000-8000-000000000001';
const duplicateSubmissionId = '20000000-0000-4000-8000-000000000001';
const requestId = '30000000-0000-4000-8000-000000000001';
const actorId = 'cloudflare-access:terminal-reviewer';
const initialUpdatedAt = '2026-07-16T03:30:00.000Z';
const changedAt = new Date('2026-07-16T03:31:00.000Z');

function context() {
  return {
    actorId,
    actorType: 'human' as const,
    capabilities: ['submission:terminal-resolution'] as ['submission:terminal-resolution'],
  };
}

class InMemoryBackend implements SubmissionTerminalResolutionBackend {
  state: SubmissionTerminalResolutionState | null;
  duplicateTarget: SubmissionTerminalResolutionDuplicateTarget | null = null;
  events = new Map<string, SubmissionTerminalResolutionEventRecord>();
  failCommit = false;

  constructor(
    submissionType: SubmissionType,
    workflowStatus: SubmissionWorkflowStatus = 'in_review',
    resolution: SubmissionResolution | null = null,
  ) {
    this.state = {
      submissionId,
      submissionType,
      workflowStatus,
      resolution,
      updatedAt: initialUpdatedAt,
    };
  }

  async readState(receivedSubmissionId: string) {
    return this.state?.submissionId === receivedSubmissionId ? structuredClone(this.state) : null;
  }

  async readEvent(eventId: string) {
    return this.events.get(eventId) ?? null;
  }

  async readDuplicateTarget(receivedSubmissionId: string) {
    return this.duplicateTarget?.submissionId === receivedSubmissionId
      ? structuredClone(this.duplicateTarget)
      : null;
  }

  async commitResolution(command: SubmissionTerminalResolutionCommitCommand) {
    if (this.failCommit) {
      throw new SubmissionPersistenceError('conflict', 'simulated conflict');
    }
    if (
      this.state === null ||
      this.state.submissionId !== command.submissionId ||
      this.state.workflowStatus !== command.expectedStatus ||
      this.state.resolution !== null ||
      this.state.updatedAt !== command.expectedUpdatedAt.toISOString()
    ) {
      throw new SubmissionPersistenceError('conflict', 'state conflict');
    }
    if (
      command.duplicateSubmissionId !== null &&
      (this.duplicateTarget === null ||
        this.duplicateTarget.submissionId !== command.duplicateSubmissionId ||
        this.duplicateTarget.submissionType !== command.submissionType)
    ) {
      throw new SubmissionPersistenceError('conflict', 'duplicate target conflict');
    }
    this.state = {
      ...this.state,
      workflowStatus: command.toStatus,
      resolution: command.resolution,
      updatedAt: command.changedAt.toISOString(),
    };
    this.events.set(command.eventId, {
      eventId: command.eventId,
      submissionId: command.submissionId,
      fromStatus: command.expectedStatus,
      toStatus: command.toStatus,
      action: command.eventAction,
      reasonCode: command.reasonCode,
      actorId: command.actorId,
      internalNote: command.internalNote,
      createdAt: command.changedAt.toISOString(),
    });
  }
}

function baseRequest(submissionType: SubmissionType) {
  return {
    schemaVersion: 'submission-terminal-resolution-v1' as const,
    requestId,
    submissionType,
    expectedUpdatedAt: initialUpdatedAt,
    publicMessage: 'Review is complete and this Submission has been closed.',
    internalNote: 'Bounded reviewer-only note.',
  };
}

describe('P5-06D1 common Submission terminal resolution', () => {
  it('resolves a paused Suggest as not approved and replays the exact request', async () => {
    const backend = new InMemoryBackend('suggest', 'on_hold');
    const request = {
      ...baseRequest('suggest'),
      action: 'not_approved' as const,
      expectedStatus: 'on_hold' as const,
      reasonCode: 'hold_expired' as const,
      duplicateSubmissionId: null,
    };

    const committed = await applySubmissionTerminalResolution(
      context(),
      backend,
      submissionId,
      request,
      changedAt,
    );
    const replayed = await applySubmissionTerminalResolution(
      context(),
      backend,
      submissionId,
      request,
      new Date('2026-07-16T03:32:00.000Z'),
    );

    expect(committed).toMatchObject({
      state: 'committed',
      fromStatus: 'on_hold',
      toStatus: 'resolved',
      resolution: 'not_approved',
      reasonCode: 'hold_expired',
    });
    expect(replayed.state).toBe('replayed');
    expect(backend.state).toMatchObject({
      workflowStatus: 'resolved',
      resolution: 'not_approved',
    });
  });

  it('requires an exact same-type nonterminal duplicate Submission', async () => {
    const backend = new InMemoryBackend('suggest', 'triage');
    backend.duplicateTarget = {
      submissionId: duplicateSubmissionId,
      publicId: 'CPM-S-2026-000002',
      submissionType: 'suggest',
      workflowStatus: 'in_review',
    };
    const receipt = await applySubmissionTerminalResolution(
      context(),
      backend,
      submissionId,
      {
        ...baseRequest('suggest'),
        action: 'duplicate',
        expectedStatus: 'triage',
        reasonCode: 'duplicate_submission',
        duplicateSubmissionId,
      },
      changedAt,
    );

    expect(receipt).toMatchObject({
      toStatus: 'duplicate',
      resolution: 'duplicate',
      duplicateSubmissionId,
      duplicateSubmissionPublicId: 'CPM-S-2026-000002',
    });
  });

  it('allows Photos no-change and Claim withdrawal without deleting retained material', async () => {
    const photos = new InMemoryBackend('photos');
    const noChange = await applySubmissionTerminalResolution(
      context(),
      photos,
      submissionId,
      {
        ...baseRequest('photos'),
        action: 'no_change',
        expectedStatus: 'in_review',
        reasonCode: 'no_material_difference',
        duplicateSubmissionId: null,
      },
      changedAt,
    );
    expect(noChange.resolution).toBe('no_change');

    const claim = new InMemoryBackend('claim', 'received');
    const withdrawn = await applySubmissionTerminalResolution(
      context(),
      claim,
      submissionId,
      {
        ...baseRequest('claim'),
        action: 'withdrawn',
        expectedStatus: 'received',
        reasonCode: 'submitter_requested',
        duplicateSubmissionId: null,
      },
      changedAt,
    );
    expect(withdrawn).toMatchObject({ toStatus: 'withdrawn', resolution: 'withdrawn' });
  });

  it('preserves type-specific report, Claim, and Photos decision ownership', async () => {
    const cases = [
      {
        type: 'problem_report' as const,
        request: {
          ...baseRequest('problem_report'),
          action: 'duplicate' as const,
          expectedStatus: 'in_review' as const,
          reasonCode: 'duplicate_submission' as const,
          duplicateSubmissionId,
        },
      },
      {
        type: 'claim' as const,
        request: {
          ...baseRequest('claim'),
          action: 'not_approved' as const,
          expectedStatus: 'in_review' as const,
          reasonCode: 'unverifiable' as const,
          duplicateSubmissionId: null,
        },
      },
      {
        type: 'photos' as const,
        request: {
          ...baseRequest('photos'),
          action: 'not_approved' as const,
          expectedStatus: 'in_review' as const,
          reasonCode: 'insufficient_evidence' as const,
          duplicateSubmissionId: null,
        },
      },
    ];

    for (const testCase of cases) {
      await expect(
        applySubmissionTerminalResolution(
          context(),
          new InMemoryBackend(testCase.type),
          submissionId,
          testCase.request,
          changedAt,
        ),
      ).rejects.toMatchObject({ code: 'ineligible' });
    }
  });

  it('rejects stale state, changed request replay, and unauthorized actors', async () => {
    const backend = new InMemoryBackend('suggest');
    const request = {
      ...baseRequest('suggest'),
      action: 'no_change' as const,
      expectedStatus: 'in_review' as const,
      reasonCode: 'already_current' as const,
      duplicateSubmissionId: null,
    };

    await expect(
      applySubmissionTerminalResolution(
        context(),
        backend,
        submissionId,
        { ...request, expectedUpdatedAt: '2026-07-16T03:29:00.000Z' },
        changedAt,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });

    await applySubmissionTerminalResolution(context(), backend, submissionId, request, changedAt);
    await expect(
      applySubmissionTerminalResolution(
        context(),
        backend,
        submissionId,
        { ...request, publicMessage: 'Changed replay content.' },
        changedAt,
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });

    await expect(
      applySubmissionTerminalResolution(
        { actorId, actorType: 'human', capabilities: [] as never },
        new InMemoryBackend('suggest'),
        submissionId,
        request,
        changedAt,
      ),
    ).rejects.toBeInstanceOf(SubmissionTerminalResolutionError);
  });
});
