import { describe, expect, it, vi } from 'vitest';
import { createScheduledReconfirmationBoundary } from '../src/admin/reconfirmation/scheduled-boundary';
import {
  ReconfirmationExpirationError,
  type ReconfirmationExpirationCommand,
} from '../src/admin/reconfirmation/expiration';
import type { ScheduledReconfirmationBackend } from '../src/admin/reconfirmation/scheduled-contract';
import {
  scheduledReconfirmationRequestId,
  scheduledReconfirmationRunId,
} from '../src/admin/reconfirmation/scheduled-request-id';
import { createScheduledReconfirmationService } from '../src/admin/reconfirmation/scheduled-run';

const runId = '10000000-0000-4000-8000-000000000001';
const firstClaimId = '20000000-0000-4000-8000-000000000001';
const secondClaimId = '20000000-0000-4000-8000-000000000002';
const effectiveAt = '2026-07-03T00:00:00.000Z';
const deadline = '2026-07-01T00:00:00.000Z';

function claim(id: string, nextReviewAt = deadline) {
  return {
    id,
    claimStatus: 'confirmed' as const,
    visibility: 'public' as const,
    updatedAt: '2026-06-01T00:00:00.000Z',
    nextReviewAt,
  };
}

function receipt(
  command: ReconfirmationExpirationCommand,
  state: 'committed' | 'replayed' = 'committed',
) {
  return {
    requestId: command.requestId,
    claimId: command.claimId,
    fromStatus: 'confirmed' as const,
    toStatus: 'stale' as const,
    visibility: command.expectedClaimVisibility,
    nextReviewAt: command.expectedNextReviewAt.toISOString(),
    eventType: 'marked_stale' as const,
    effectiveAt: command.effectiveAt.toISOString(),
    state,
  };
}

describe('scheduled reconfirmation run', () => {
  it('derives stable run and request UUIDs', async () => {
    const scheduledRunId = await scheduledReconfirmationRunId(effectiveAt);
    expect(scheduledRunId).toBe(await scheduledReconfirmationRunId(effectiveAt));
    expect(scheduledRunId).not.toBe(
      await scheduledReconfirmationRunId('2026-07-03T01:00:00.000Z'),
    );

    const first = await scheduledReconfirmationRequestId(scheduledRunId, firstClaimId);
    expect(first).toBe(
      await scheduledReconfirmationRequestId(scheduledRunId, firstClaimId),
    );
    expect(first).not.toBe(
      await scheduledReconfirmationRequestId(scheduledRunId, secondClaimId),
    );
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('continues after one Claim conflicts and reports bounded outcomes', async () => {
    const commitExpiration = vi.fn(async (command: ReconfirmationExpirationCommand) => {
      if (command.claimId === secondClaimId) {
        throw new ReconfirmationExpirationError('conflict', 'Claim changed.');
      }
      return receipt(command);
    });
    const backend: ScheduledReconfirmationBackend = {
      loadExpiredClaims: vi.fn(async () => ({
        claims: [claim(firstClaimId), claim(secondClaimId)],
        hasMore: true,
      })),
      commitExpiration,
    };
    const requestIds = new Map([
      [firstClaimId, '30000000-0000-4000-8000-000000000001'],
      [secondClaimId, '30000000-0000-4000-8000-000000000002'],
    ]);
    const result = await createScheduledReconfirmationService(
      backend,
      async (_scheduledRunId, claimId) => requestIds.get(claimId) as string,
    ).run(
      {
        runId,
        actorId: 'reconfirmation-scheduler',
        actorType: 'system',
        capabilities: ['claim:expire'],
      },
      {
        effectiveAt,
        limit: 50,
        publicSummary: 'The review window expired before reconfirmation.',
        internalNote: 'Scheduled P3-09D run.',
      },
    );

    expect(result).toMatchObject({
      scannedCount: 2,
      committedCount: 1,
      conflictCount: 1,
      failedCount: 0,
      hasMore: true,
    });
    expect(commitExpiration).toHaveBeenCalledTimes(2);
  });

  it('replays the same scheduled occurrence with the same request IDs', async () => {
    const committedRequestIds = new Set<string>();
    const backend: ScheduledReconfirmationBackend = {
      loadExpiredClaims: vi.fn(async () => ({
        claims: [claim(firstClaimId)],
        hasMore: false,
      })),
      commitExpiration: vi.fn(async (command) => {
        const state = committedRequestIds.has(command.requestId) ? 'replayed' : 'committed';
        committedRequestIds.add(command.requestId);
        return receipt(command, state);
      }),
    };
    const boundary = createScheduledReconfirmationBoundary({
      createBackend: () => backend,
    });
    const invocation = { scheduledTime: Date.parse(effectiveAt) };
    const environment = {
      DATABASE_URL: 'postgres://user:password@example.com/cryptopaymap',
    };

    const first = await boundary(invocation, environment);
    const second = await boundary(invocation, environment);

    expect(first.runId).toBe(second.runId);
    expect(first.outcomes[0]?.requestId).toBe(second.outcomes[0]?.requestId);
    expect(first.committedCount).toBe(1);
    expect(second.replayedCount).toBe(1);
  });

  it('rejects a run without the expiration capability', async () => {
    const backend: ScheduledReconfirmationBackend = {
      loadExpiredClaims: vi.fn(),
      commitExpiration: vi.fn(),
    };
    await expect(
      createScheduledReconfirmationService(backend).run(
        {
          runId,
          actorId: 'reconfirmation-scheduler',
          actorType: 'system',
          capabilities: [],
        },
        {
          effectiveAt,
          limit: 50,
          publicSummary: null,
          internalNote: 'Unauthorized run.',
        },
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('rejects a backend batch containing a Claim before its deadline', async () => {
    const backend: ScheduledReconfirmationBackend = {
      loadExpiredClaims: vi.fn(async () => ({
        claims: [claim(firstClaimId, '2026-07-04T00:00:00.000Z')],
        hasMore: false,
      })),
      commitExpiration: vi.fn(),
    };

    await expect(
      createScheduledReconfirmationService(backend).run(
        {
          runId,
          actorId: 'reconfirmation-scheduler',
          actorType: 'system',
          capabilities: ['claim:expire'],
        },
        {
          effectiveAt,
          limit: 50,
          publicSummary: null,
          internalNote: 'Invalid batch.',
        },
      ),
    ).rejects.toMatchObject({ code: 'backend_failure' });
    expect(backend.commitExpiration).not.toHaveBeenCalled();
  });
});
