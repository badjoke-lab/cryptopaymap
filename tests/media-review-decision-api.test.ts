import { describe, expect, it, vi } from 'vitest';
import { createMediaDecisionPostHandler } from '../functions/admin/api/media-decision';
import {
  MediaReviewDecisionError,
  type MediaReviewDecisionReceipt,
} from '../src/admin/media-review/decision';
import { MediaStorageError } from '../src/admin/media-review/storage-contract';

const identity = {
  actorId: 'cloudflare-access:media-reviewer',
  actorType: 'human' as const,
  subject: 'media-reviewer',
  email: 'reviewer@example.test',
};
const requestId = '10000000-0000-4000-8000-000000000001';
const mediaAssetId = '20000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-03T02:00:00.000Z');

function receipt(): MediaReviewDecisionReceipt {
  return {
    requestId,
    mediaAssetId,
    action: 'approve_private',
    reviewStatus: 'accepted',
    purpose: 'evidence',
    rightsStatus: 'unknown',
    visibility: 'private',
    decidedAt: now.toISOString(),
    publicFileIds: [],
    state: 'committed',
  };
}

function context(
  overrides: {
    identity?: unknown;
    actorIds?: string;
    requestId?: string | null;
    mediaAssetId?: string | null;
    body?: unknown;
  } = {},
) {
  const id = overrides.mediaAssetId === undefined ? mediaAssetId : overrides.mediaAssetId;
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const idempotencyKey = overrides.requestId === undefined ? requestId : overrides.requestId;
  if (idempotencyKey !== null) headers.set('Idempotency-Key', idempotencyKey);
  const query = id === null ? '' : `?mediaAssetId=${id}`;
  return {
    request: new Request(`https://example.test/admin/api/media-decision${query}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(overrides.body ?? { action: 'approve_private' }),
    }),
    env: {
      CPM_ADMIN_MEDIA_REVIEW_ACTOR_IDS: overrides.actorIds ?? JSON.stringify([identity.actorId]),
    },
    params: {},
    data: {
      adminIdentity: overrides.identity === undefined ? identity : overrides.identity,
    },
    waitUntil: vi.fn(),
  };
}

describe('protected Media decision endpoint', () => {
  it('writes a decision with the authorized actor and request identity', async () => {
    const writeDecision = vi.fn(async () => receipt());
    const response = await createMediaDecisionPostHandler({
      writeDecision,
      now: () => now,
    })(context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(receipt());
    expect(writeDecision).toHaveBeenCalledWith(
      {
        requestId,
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['media:review'],
      },
      mediaAssetId,
      { action: 'approve_private' },
      expect.any(Object),
      now,
    );
  });

  it('requires a valid Idempotency-Key', async () => {
    const writeDecision = vi.fn(async () => receipt());
    const response = await createMediaDecisionPostHandler({ writeDecision })(
      context({ requestId: null }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'media_decision_invalid_request_id',
    });
    expect(writeDecision).not.toHaveBeenCalled();
  });

  it('maps durable conflicts without exposing internal state', async () => {
    const writeDecision = vi.fn(async () => {
      throw new MediaReviewDecisionError('conflict', 'Media changed.', ['updatedAt']);
    });
    const response = await createMediaDecisionPostHandler({ writeDecision })(context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'media_decision_conflict',
      issues: ['updatedAt'],
    });
  });

  it('maps private storage mismatch to a generic conflict', async () => {
    const writeDecision = vi.fn(async () => {
      throw new MediaStorageError('source_mismatch', 'Private object changed.', [
        'private/object/key',
      ]);
    });
    const response = await createMediaDecisionPostHandler({ writeDecision })(context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'media_storage_conflict' });
  });
});
