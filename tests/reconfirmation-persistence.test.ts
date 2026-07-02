import { describe, expect, it, vi } from 'vitest';
import { createDrizzleReconfirmationExpirationBackend } from '../src/admin/reconfirmation/drizzle-backend';
import { createDrizzleReconfirmationQueueBackend } from '../src/admin/reconfirmation/drizzle-queue-backend';
import { replayReconfirmationExpiration } from '../src/admin/reconfirmation/drizzle-state';
import {
  reconfirmationExpirations,
  verificationEventTypeValues,
} from '../src/db/schema';
import {
  loadReconfirmationQueue,
  type ReconfirmationQueueBackend,
} from '../src/admin/reconfirmation/workspace';

const claimId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const asOf = new Date('2026-07-03T00:00:00.000Z');

describe('reconfirmation persistence foundation', () => {
  it('exposes durable request, Claim guard, event, and replay columns', () => {
    expect(reconfirmationExpirations.requestId.name).toBe('request_id');
    expect(reconfirmationExpirations.claimId.name).toBe('claim_id');
    expect(reconfirmationExpirations.expectedClaimUpdatedAt.name).toBe(
      'expected_claim_updated_at',
    );
    expect(reconfirmationExpirations.expectedNextReviewAt.name).toBe(
      'expected_next_review_at',
    );
    expect(reconfirmationExpirations.verificationEventId.name).toBe(
      'verification_event_id',
    );
    expect(reconfirmationExpirations.requestFingerprint.name).toBe(
      'request_fingerprint',
    );
  });

  it('exports the production expiration and queue backends', () => {
    expect(createDrizzleReconfirmationExpirationBackend).toBeTypeOf('function');
    expect(createDrizzleReconfirmationQueueBackend).toBeTypeOf('function');
    expect(verificationEventTypeValues).toContain('marked_stale');
  });

  it('replays a durable marked-stale receipt', () => {
    expect(
      replayReconfirmationExpiration({
        requestId,
        claimId,
        fromClaimStatus: 'confirmed',
        toClaimStatus: 'stale',
        claimVisibility: 'hidden',
        expectedNextReviewAt: new Date('2026-07-01T00:00:00.000Z'),
        effectiveAt: asOf,
        requestFingerprint: 'fingerprint',
        eventType: 'marked_stale',
      } as never),
    ).toEqual({
      requestId,
      claimId,
      fromStatus: 'confirmed',
      toStatus: 'stale',
      visibility: 'hidden',
      nextReviewAt: '2026-07-01T00:00:00.000Z',
      eventType: 'marked_stale',
      effectiveAt: asOf.toISOString(),
      state: 'replayed',
    });
  });

  it('validates a bounded queue response from the persistence boundary', async () => {
    const backend: ReconfirmationQueueBackend = {
      loadQueue: vi.fn(async () => ({
        items: [
          {
            id: claimId,
            claimStatus: 'confirmed',
            visibility: 'public',
            lastConfirmedAt: '2026-01-01T00:00:00.000Z',
            nextReviewAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
            queueReason: 'overdue',
            recommendedAction: 'mark_stale',
            dueAt: '2026-07-01T00:00:00.000Z',
            daysUntilReview: -2,
            priority: 0,
          },
        ],
        hasMore: false,
      })),
    };

    await expect(
      loadReconfirmationQueue(backend, { dueSoonDays: 30, limit: 50 }, asOf),
    ).resolves.toMatchObject({
      generatedAt: asOf.toISOString(),
      query: { dueSoonDays: 30, limit: 50 },
      items: [{ id: claimId, queueReason: 'overdue' }],
      hasMore: false,
    });
  });
});
