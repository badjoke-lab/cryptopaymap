import { describe, expect, it, vi } from 'vitest';
import {
  ReconfirmationExpirationError,
  type ReconfirmationExpirationCommand,
} from '../src/admin/reconfirmation/expiration';
import type { ScheduledReconfirmationBackend } from '../src/admin/reconfirmation/scheduled-contract';
import { scheduledReconfirmationRequestId } from '../src/admin/reconfirmation/scheduled-request-id';
import { createScheduledReconfirmationService } from '../src/admin/reconfirmation/scheduled-run';

const runId = '10000000-0000-4000-8000-000000000001';
const firstClaimId = '20000000-0000-4000-8000-000000000001';
const secondClaimId = '20000000-0000-4000-8000-000000000002';
const effectiveAt = '2026-07-03T00:00:00.000Z';
const deadline = '2026-07-01T00:00:00.000Z';

function claim(id: string) {
  return {
    id,
    claimStatus: 'confirmed' as const,
    visibility: 'public' as const,
    updatedAt: '2026-06-01T00:00:00.000Z',
    nextReviewAt: deadline,
  };
}

function committed(command: ReconfirmationExpirationCommand) {
  return {
    requestId: command.requestId,
    claimId: command.claimId,
    fromStatus: 'confirmed' as const,
    toStatus: 'stale' as const,
    visibility: command.expectedClaimVisibility,
    nextReviewAt: command.expectedNextReviewAt.toISOString(),
    eventType: 'marked_stale' as const,
    effectiveAt: command.effectiveAt.toISOString(),
    state: 'committed' as const,
  };
}

describe('scheduled reconfirmation run', () => {
  it('derives stable request UUIDs per run and Claim', async () => {
    const first = await scheduledReconfirmationRequestId(runId, firstClaimId);
    expect(first).toBe(await scheduledReconfirmationRequestId(runId, firstClaimId));
    expect(first).not.toBe(await scheduledReconfirmationRequestId(runId, secondClaimId));
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('continues after one Claim conflicts and reports bounded outcomes', async () => {
    const commitExpiration = vi.fn(async (command: ReconfirmationExpirationCommand) => {
      if (command.claimId === secondClaimId) {
        throw new ReconfirmationExpirationError('conflict', 'Claim changed.');
      }
      return committed(command);
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
    const receipt = await createScheduledReconfirmationService(
      backend,
      async (_runId, claimId) => requestIds.get(claimId) as string,
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

    expect(receipt).toMatchObject({
      scannedCount: 2,
      committedCount: 1,
      conflictCount: 1,
      failedCount: 0,
      hasMore: true,
    });
    expect(commitExpiration).toHaveBeenCalledTimes(2);
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
          capabilities: [] as never,
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
});
