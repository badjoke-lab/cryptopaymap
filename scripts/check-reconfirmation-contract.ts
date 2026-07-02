import { createReconfirmationExpirationService } from '../src/admin/reconfirmation/expiration';
import { InMemoryReconfirmationBackend } from '../src/admin/reconfirmation/in-memory-backend';
import { buildReconfirmationQueue } from '../src/admin/reconfirmation/queue';

const claimId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const updatedAt = '2026-06-01T00:00:00.000Z';
const dueAt = '2026-07-01T00:00:00.000Z';
const asOf = new Date('2026-07-02T00:00:00.000Z');

const queue = buildReconfirmationQueue(
  [
    {
      id: claimId,
      claimStatus: 'confirmed',
      visibility: 'public',
      lastConfirmedAt: '2026-01-01T00:00:00.000Z',
      nextReviewAt: dueAt,
      updatedAt,
      deletedAt: null,
    },
  ],
  asOf,
);
if (
  queue.length !== 1 ||
  queue[0]?.queueReason !== 'overdue' ||
  queue[0].recommendedAction !== 'mark_stale'
) {
  throw new Error('The reconfirmation queue did not identify the overdue Claim.');
}

const backend = new InMemoryReconfirmationBackend({
  claims: [
    {
      id: claimId,
      claimStatus: 'confirmed',
      visibility: 'public',
      lastConfirmedAt: '2026-01-01T00:00:00.000Z',
      nextReviewAt: dueAt,
      updatedAt,
      deletedAt: null,
    },
  ],
});
const receipt = await createReconfirmationExpirationService(backend).expire(
  {
    requestId,
    actorId: 'system:reconfirmation-check',
    actorType: 'system',
    capabilities: ['claim:expire'],
  },
  {
    claimId,
    expectedClaimUpdatedAt: updatedAt,
    expectedClaimStatus: 'confirmed',
    expectedClaimVisibility: 'public',
    expectedNextReviewAt: dueAt,
    effectiveAt: asOf.toISOString(),
    reasonCode: 'review_window_expired',
    publicSummary: 'The review window expired without sufficient reconfirmation.',
    internalNote: null,
  },
);

if (
  receipt.toStatus !== 'stale' ||
  receipt.visibility !== 'public' ||
  receipt.eventType !== 'marked_stale' ||
  backend.snapshot().expirations !== 1
) {
  throw new Error('The reconfirmation expiration contract produced an invalid result.');
}

console.log('Reconfirmation contract checks passed.');
