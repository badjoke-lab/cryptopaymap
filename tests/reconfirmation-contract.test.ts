import { describe, expect, it } from 'vitest';
import {
  createReconfirmationExpirationService,
  type ReconfirmationExpirationContext,
  type ReconfirmationExpirationInput,
} from '../src/admin/reconfirmation/expiration';
import { InMemoryReconfirmationBackend } from '../src/admin/reconfirmation/in-memory-backend';
import {
  buildReconfirmationQueue,
  evaluateReconfirmationClaim,
  type ReconfirmationClaimSnapshot,
} from '../src/admin/reconfirmation/queue';

const ids = {
  overdue: '10000000-0000-4000-8000-000000000001',
  missing: '10000000-0000-4000-8000-000000000002',
  stale: '10000000-0000-4000-8000-000000000003',
  dueSoon: '10000000-0000-4000-8000-000000000004',
  future: '10000000-0000-4000-8000-000000000005',
  request: '20000000-0000-4000-8000-000000000001',
} as const;
const updatedAt = '2026-06-01T00:00:00.000Z';
const asOf = new Date('2026-07-02T00:00:00.000Z');
const overdueAt = '2026-07-01T00:00:00.000Z';

function snapshot(
  id: string,
  overrides: Partial<ReconfirmationClaimSnapshot> = {},
): ReconfirmationClaimSnapshot {
  return {
    id,
    claimStatus: 'confirmed',
    visibility: 'public',
    lastConfirmedAt: '2026-01-01T00:00:00.000Z',
    nextReviewAt: overdueAt,
    updatedAt,
    deletedAt: null,
    ...overrides,
  };
}

const context: ReconfirmationExpirationContext = {
  requestId: ids.request,
  actorId: 'system:reconfirmation-scheduler',
  actorType: 'system',
  capabilities: ['claim:expire'],
};

function expirationInput(
  overrides: Partial<ReconfirmationExpirationInput> = {},
): ReconfirmationExpirationInput {
  return {
    claimId: ids.overdue,
    expectedClaimUpdatedAt: updatedAt,
    expectedClaimStatus: 'confirmed',
    expectedClaimVisibility: 'public',
    expectedNextReviewAt: overdueAt,
    effectiveAt: asOf.toISOString(),
    reasonCode: 'review_window_expired',
    publicSummary: 'The reconfirmation window expired without sufficient current Evidence.',
    internalNote: null,
    ...overrides,
  };
}

function backend(options: { failBeforeCommit?: boolean } = {}) {
  return new InMemoryReconfirmationBackend({
    claims: [
      {
        id: ids.overdue,
        claimStatus: 'confirmed',
        visibility: 'public',
        lastConfirmedAt: '2026-01-01T00:00:00.000Z',
        nextReviewAt: overdueAt,
        updatedAt,
        deletedAt: null,
      },
    ],
    ...(options.failBeforeCommit ? { failBeforeCommit: () => true } : {}),
  });
}

describe('reconfirmation queue policy', () => {
  it('orders overdue, missing-deadline, stale, and due-soon Claims', () => {
    const queue = buildReconfirmationQueue(
      [
        snapshot(ids.future, { nextReviewAt: '2026-09-01T00:00:00.000Z' }),
        snapshot(ids.dueSoon, { nextReviewAt: '2026-07-20T00:00:00.000Z' }),
        snapshot(ids.stale, {
          claimStatus: 'stale',
          nextReviewAt: '2026-06-15T00:00:00.000Z',
        }),
        snapshot(ids.missing, { nextReviewAt: null, visibility: 'hidden' }),
        snapshot(ids.overdue),
      ],
      asOf,
    );

    expect(queue.map((item) => [item.id, item.queueReason, item.recommendedAction])).toEqual([
      [ids.overdue, 'overdue', 'mark_stale'],
      [ids.missing, 'missing_deadline', 'review'],
      [ids.stale, 'stale_review', 'review'],
      [ids.dueSoon, 'due_soon', 'review'],
    ]);
    expect(queue[1]?.visibility).toBe('hidden');
  });

  it('excludes candidate, ended, rejected, deleted, and future Claims', () => {
    const inputs = [
      snapshot(ids.overdue, { claimStatus: 'candidate' }),
      snapshot(ids.overdue, { claimStatus: 'ended' }),
      snapshot(ids.overdue, { claimStatus: 'rejected' }),
      snapshot(ids.overdue, { deletedAt: '2026-07-01T00:00:00.000Z' }),
      snapshot(ids.future, { nextReviewAt: '2026-09-01T00:00:00.000Z' }),
    ];
    expect(inputs.map((claim) => evaluateReconfirmationClaim(claim, asOf))).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('marks the exact deadline as overdue', () => {
    const dueAt = asOf.toISOString();
    expect(
      evaluateReconfirmationClaim(snapshot(ids.overdue, { nextReviewAt: dueAt }), asOf),
    ).toMatchObject({ queueReason: 'overdue', recommendedAction: 'mark_stale' });
  });
});

describe('reconfirmation expiration contract', () => {
  it('marks only an overdue confirmed Claim stale and preserves visibility', async () => {
    const store = backend();
    const receipt = await createReconfirmationExpirationService(store).expire(
      context,
      expirationInput(),
    );

    expect(receipt).toEqual({
      requestId: ids.request,
      claimId: ids.overdue,
      fromStatus: 'confirmed',
      toStatus: 'stale',
      visibility: 'public',
      nextReviewAt: overdueAt,
      eventType: 'marked_stale',
      effectiveAt: asOf.toISOString(),
      state: 'committed',
    });
    expect(store.snapshot()).toMatchObject({
      claims: [
        expect.objectContaining({
          claimStatus: 'stale',
          visibility: 'public',
          nextReviewAt: overdueAt,
          updatedAt: asOf.toISOString(),
        }),
      ],
      expirations: 1,
      events: [
        expect.objectContaining({
          eventType: 'marked_stale',
          fromStatus: 'confirmed',
          toStatus: 'stale',
          visibility: 'public',
        }),
      ],
    });
  });

  it('replays identical content and rejects changed content for one request ID', async () => {
    const store = backend();
    const service = createReconfirmationExpirationService(store);
    await expect(service.expire(context, expirationInput())).resolves.toMatchObject({
      state: 'committed',
    });
    await expect(service.expire(context, expirationInput())).resolves.toMatchObject({
      state: 'replayed',
    });
    await expect(
      service.expire(
        context,
        expirationInput({ publicSummary: 'A different normalized request.' }),
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rejects expiration before the deadline without calling the backend', async () => {
    const store = backend();
    await expect(
      createReconfirmationExpirationService(store).expire(
        context,
        expirationInput({ effectiveAt: '2026-06-30T00:00:00.000Z' }),
      ),
    ).rejects.toMatchObject({ code: 'invalid_expiration' });
    expect(store.snapshot().expirations).toBe(0);
  });

  it('rejects changed Claim version, status, visibility, or deadline', async () => {
    const store = backend();
    await expect(
      createReconfirmationExpirationService(store).expire(
        context,
        expirationInput({ expectedClaimVisibility: 'hidden' }),
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('requires a system actor with the expiration capability', async () => {
    const store = backend();
    await expect(
      createReconfirmationExpirationService(store).expire(
        { ...context, actorType: 'human' } as unknown as ReconfirmationExpirationContext,
        expirationInput(),
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('rolls back Claim, event, and receipt state on injected failure', async () => {
    const store = backend({ failBeforeCommit: true });
    const before = store.snapshot();
    await expect(
      createReconfirmationExpirationService(store).expire(context, expirationInput()),
    ).rejects.toMatchObject({ code: 'backend_failure' });
    expect(store.snapshot()).toEqual(before);
  });
});
