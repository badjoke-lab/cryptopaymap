import { describe, expect, it } from 'vitest';
import type { SubmissionTransitionContext } from '../src/admin/submissions/authorization';
import {
  applyBusinessClaimReviewTransition,
  businessClaimReviewTransitionRequestSchema,
  type BusinessClaimReviewTransitionBackend,
  type BusinessClaimReviewTransitionCommitCommand,
  type BusinessClaimReviewTransitionEventRecord,
  type BusinessClaimReviewTransitionState,
} from '../src/admin/submissions/business-claim-review-transitions';

const context: SubmissionTransitionContext = {
  actorId: 'cloudflare-access:claim-reviewer',
  actorType: 'human',
  capabilities: ['submission:transition'],
};
const submissionId = '10000000-0000-4000-8000-000000000001';
const changedAt = new Date('2026-07-14T06:30:00.000Z');

function backend(initialState: BusinessClaimReviewTransitionState) {
  const events = new Map<string, BusinessClaimReviewTransitionEventRecord>();
  const commits: BusinessClaimReviewTransitionCommitCommand[] = [];
  const service: BusinessClaimReviewTransitionBackend = {
    async readState() {
      return initialState;
    },
    async readEvent(eventId) {
      return events.get(eventId) ?? null;
    },
    async commitTransition(command) {
      commits.push(command);
      events.set(command.eventId, {
        eventId: command.eventId,
        submissionId: command.submissionId,
        fromStatus: command.expectedStatus,
        toStatus: command.toStatus,
        action: command.eventAction,
        reasonCode: command.reasonCode,
        actorId: command.actorId,
        createdAt: command.changedAt.toISOString(),
      });
    },
  };
  return { service, events, commits };
}

const scenarios = [
  ['begin_triage', 'received', 'triage', 'initial_review'],
  ['begin_review', 'triage', 'in_review', 'verification_prerequisites'],
  ['request_information', 'in_review', 'needs_information', 'missing_information'],
  ['place_on_hold', 'in_review', 'on_hold', 'authority_review'],
  ['resume_information_review', 'needs_information', 'in_review', 'information_received'],
  ['resume_hold_review', 'on_hold', 'in_review', 'hold_released'],
] as const;

describe('P5-04E Business Claim review transitions', () => {
  for (const [action, fromStatus, toStatus, reasonCode] of scenarios) {
    it(`applies exact-state ${fromStatus} -> ${toStatus}`, async () => {
      const updatedAt = '2026-07-14T06:00:00.000Z';
      const fixture = backend({
        submissionId,
        submissionType: 'claim',
        workflowStatus: fromStatus,
        updatedAt,
      });
      const request = businessClaimReviewTransitionRequestSchema.parse({
        schemaVersion: 'business-claim-review-transition-v1',
        requestId: crypto.randomUUID(),
        action,
        expectedStatus: fromStatus,
        expectedUpdatedAt: updatedAt,
        reasonCode,
      });

      const receipt = await applyBusinessClaimReviewTransition(
        context,
        fixture.service,
        submissionId,
        request,
        changedAt,
      );

      expect(receipt).toMatchObject({
        state: 'committed',
        submissionId,
        fromStatus,
        toStatus,
        action,
        reasonCode,
      });
      expect(fixture.commits).toHaveLength(1);
      expect(fixture.commits[0]).toMatchObject({
        expectedStatus: fromStatus,
        toStatus,
        reasonCode,
        actorId: context.actorId,
      });
    });
  }

  it('replays an identical transition without committing again', async () => {
    const updatedAt = '2026-07-14T06:00:00.000Z';
    const fixture = backend({
      submissionId,
      submissionType: 'claim',
      workflowStatus: 'received',
      updatedAt,
    });
    const request = businessClaimReviewTransitionRequestSchema.parse({
      schemaVersion: 'business-claim-review-transition-v1',
      requestId: '20000000-0000-4000-8000-000000000002',
      action: 'begin_triage',
      expectedStatus: 'received',
      expectedUpdatedAt: updatedAt,
      reasonCode: 'initial_review',
    });

    await applyBusinessClaimReviewTransition(
      context,
      fixture.service,
      submissionId,
      request,
      changedAt,
    );
    const replay = await applyBusinessClaimReviewTransition(
      context,
      fixture.service,
      submissionId,
      request,
      changedAt,
    );

    expect(replay.state).toBe('replayed');
    expect(fixture.commits).toHaveLength(1);
  });

  it('rejects stale state and non-Claim records', async () => {
    const request = {
      schemaVersion: 'business-claim-review-transition-v1',
      requestId: '30000000-0000-4000-8000-000000000003',
      action: 'begin_triage',
      expectedStatus: 'received',
      expectedUpdatedAt: '2026-07-14T06:00:00.000Z',
      reasonCode: 'initial_review',
    };
    const stale = backend({
      submissionId,
      submissionType: 'claim',
      workflowStatus: 'triage',
      updatedAt: '2026-07-14T06:05:00.000Z',
    });
    await expect(
      applyBusinessClaimReviewTransition(context, stale.service, submissionId, request, changedAt),
    ).rejects.toMatchObject({ code: 'conflict' });

    const wrongType = backend({
      submissionId,
      submissionType: 'suggest',
      workflowStatus: 'received',
      updatedAt: '2026-07-14T06:00:00.000Z',
    });
    await expect(
      applyBusinessClaimReviewTransition(
        context,
        wrongType.service,
        submissionId,
        request,
        changedAt,
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('rejects authorization, invalid action/status pairs, and changed replay content', async () => {
    const updatedAt = '2026-07-14T06:00:00.000Z';
    const fixture = backend({
      submissionId,
      submissionType: 'claim',
      workflowStatus: 'received',
      updatedAt,
    });
    const request = {
      schemaVersion: 'business-claim-review-transition-v1',
      requestId: '40000000-0000-4000-8000-000000000004',
      action: 'begin_triage',
      expectedStatus: 'received',
      expectedUpdatedAt: updatedAt,
      reasonCode: 'initial_review',
    };
    const unauthorized = {
      actorId: 'actor',
      actorType: 'human',
      capabilities: [],
    } as unknown as SubmissionTransitionContext;
    await expect(
      applyBusinessClaimReviewTransition(
        unauthorized,
        fixture.service,
        submissionId,
        request,
        changedAt,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });

    expect(
      businessClaimReviewTransitionRequestSchema.safeParse({
        ...request,
        action: 'begin_review',
      }).success,
    ).toBe(false);

    await applyBusinessClaimReviewTransition(
      context,
      fixture.service,
      submissionId,
      request,
      changedAt,
    );
    await expect(
      applyBusinessClaimReviewTransition(
        context,
        fixture.service,
        submissionId,
        { ...request, reasonCode: 'verification_prerequisites' },
        changedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });
});
