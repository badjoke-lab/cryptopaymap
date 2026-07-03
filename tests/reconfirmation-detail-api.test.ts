import { describe, expect, it, vi } from 'vitest';
import {
  createReconfirmationDetailGetHandler,
  createReconfirmationDetailPostHandler,
} from '../src/admin/reconfirmation/http-detail';

const claimId = '20000000-0000-4000-8000-000000000001';
const requestId = '10000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-03T00:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:reviewer',
  actorType: 'human' as const,
  subject: 'reviewer',
  email: 'reviewer@example.test',
};

function context(request: Request) {
  return {
    request,
    env: { CPM_ADMIN_RECONFIRMATION_SUBJECTS: JSON.stringify(['reviewer']) },
    params: { claimId },
    data: { adminIdentity: identity },
    waitUntil: vi.fn(),
  };
}

describe('protected Claim review API', () => {
  it('loads one Claim with a read capability', async () => {
    const loadDetail = vi.fn(
      async () =>
        ({
          generatedAt: now.toISOString(),
          queueItem: null,
          claim: { id: claimId },
        }) as never,
    );
    const response = await createReconfirmationDetailGetHandler({
      loadDetail,
      now: () => now,
    })(context(new Request(`https://example.test/admin/api/rechecks/${claimId}`)));
    expect(response.status).toBe(200);
    expect(loadDetail).toHaveBeenCalledWith(
      expect.objectContaining({ capabilities: ['claim:recheck'] }),
      claimId,
      expect.any(Object),
      now,
    );
  });

  it('adds server-owned transition fields before writing', async () => {
    const writeTransition = vi.fn(async () => ({
      requestId,
      claimId,
      fromStatus: 'confirmed' as const,
      toStatus: 'stale' as const,
      visibility: 'public' as const,
      nextReviewAt: '2026-07-01T00:00:00.000Z',
      eventType: 'marked_stale' as const,
      effectiveAt: now.toISOString(),
      state: 'committed' as const,
    }));
    const request = new Request(`https://example.test/admin/api/rechecks/${claimId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId },
      body: JSON.stringify({
        expectedClaimUpdatedAt: '2026-06-01T00:00:00.000Z',
        expectedClaimStatus: 'confirmed',
        expectedClaimVisibility: 'public',
        expectedNextReviewAt: '2026-07-01T00:00:00.000Z',
        publicSummary: 'Review window expired.',
        internalNote: null,
      }),
    });
    const response = await createReconfirmationDetailPostHandler({
      writeTransition: writeTransition as never,
      now: () => now,
    })(context(request));
    expect(response.status).toBe(200);
    expect(writeTransition).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'system', capabilities: ['claim:expire'] }),
      claimId,
      expect.objectContaining({
        effectiveAt: now.toISOString(),
        reasonCode: 'review_window_expired',
      }),
      expect.any(Object),
    );
  });
});
