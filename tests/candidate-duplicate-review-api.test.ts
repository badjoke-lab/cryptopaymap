import { describe, expect, it, vi } from 'vitest';
import { createDuplicateReviewHandlers } from '../functions/admin/api/duplicates/[groupId]';
import {
  CandidateDuplicateDecisionError,
  type CandidateDuplicateDecisionReceipt,
} from '../src/admin/candidates/duplicate-decision';
import type { CandidateDuplicateReviewResponse } from '../src/admin/candidates/duplicate-review';

const groupId = '10000000-0000-4000-8000-000000000001';
const leftId = '20000000-0000-4000-8000-000000000001';
const rightId = '20000000-0000-4000-8000-000000000002';
const requestId = '40000000-0000-4000-8000-000000000001';
const now = new Date('2026-06-29T03:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:reviewer',
  actorType: 'human' as const,
  subject: 'reviewer',
  email: 'reviewer@example.test',
};

function review(): CandidateDuplicateReviewResponse {
  const member = (id: string, name: string) => ({
    id,
    name,
    candidateType: 'physical_place' as const,
    status: 'new' as const,
    priority: 500,
    firstSeenAt: '2026-06-01T00:00:00.000Z',
    lastSeenAt: '2026-06-28T00:00:00.000Z',
    updatedAt: '2026-06-28T01:00:00.000Z',
    sourceTypes: ['legacy_import' as const],
    sourceCount: 1,
    linkedEntity: false,
    linkedLocation: false,
  });
  return {
    generatedAt: now.toISOString(),
    group: { id: groupId, status: 'open', updatedAt: '2026-06-28T01:00:00.000Z', resolvedAt: null },
    members: [member(leftId, 'Left Cafe'), member(rightId, 'Right Cafe')],
    signals: [],
    signalsTruncated: false,
  };
}

function receipt(): CandidateDuplicateDecisionReceipt {
  return {
    decisionId: '50000000-0000-4000-8000-000000000001',
    requestId,
    duplicateGroupId: groupId,
    action: 'confirm_duplicate',
    primaryCandidateId: leftId,
    memberCandidateIds: [leftId, rightId],
    groupStatus: 'resolved',
    decidedAt: now.toISOString(),
    state: 'committed',
  };
}

function context(options: {
  method?: 'GET' | 'POST';
  body?: unknown;
  identity?: unknown;
  candidateSubjects?: string;
  resolveSubjects?: string;
  idempotencyKey?: string;
  group?: string | string[];
} = {}) {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.method === 'POST') headers.set('Content-Type', 'application/json');
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  return {
    request: new Request(`https://example.test/admin/api/duplicates/${groupId}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.method === 'POST' ? JSON.stringify(options.body) : undefined,
    }),
    env: {
      CPM_ADMIN_CANDIDATE_SUBJECTS:
        options.candidateSubjects ?? JSON.stringify(['reviewer']),
      CPM_ADMIN_CANDIDATE_RESOLVE_SUBJECTS:
        options.resolveSubjects ?? JSON.stringify(['reviewer']),
    },
    params: { groupId: options.group ?? groupId },
    data: { adminIdentity: options.identity === undefined ? identity : options.identity },
    waitUntil: vi.fn(),
  };
}

function decisionBody() {
  return {
    action: 'confirm_duplicate',
    primaryCandidateId: leftId,
    memberCandidateIds: [leftId, rightId],
    reasonCode: 'same_osm_identity',
    note: null,
    expectedGroupUpdatedAt: '2026-06-28T01:00:00.000Z',
  };
}

describe('protected duplicate review endpoints', () => {
  it('returns a bounded group for an authorized reader', async () => {
    const loadReview = vi.fn(async () => review());
    const handlers = createDuplicateReviewHandlers({ loadReview, now: () => now });
    const response = await handlers.get(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual(review());
    expect(loadReview).toHaveBeenCalledWith(
      groupId,
      expect.any(Object),
      identity.actorId,
      identity.actorType,
      now,
    );
  });

  it('denies missing read identity before group lookup', async () => {
    const loadReview = vi.fn(async () => review());
    const handlers = createDuplicateReviewHandlers({ loadReview });
    const response = await handlers.get(context({ identity: null }));

    expect(response.status).toBe(403);
    expect(loadReview).not.toHaveBeenCalled();
  });

  it('requires exact resolve authorization and an idempotency UUID', async () => {
    const commitDecision = vi.fn(async () => receipt());
    const handlers = createDuplicateReviewHandlers({ commitDecision });

    const denied = await handlers.post(
      context({
        method: 'POST',
        body: decisionBody(),
        idempotencyKey: requestId,
        resolveSubjects: JSON.stringify(['other-subject']),
      }),
    );
    expect(denied.status).toBe(403);

    const invalidKey = await handlers.post(
      context({ method: 'POST', body: decisionBody(), idempotencyKey: 'invalid' }),
    );
    expect(invalidKey.status).toBe(400);
    expect(commitDecision).not.toHaveBeenCalled();
  });

  it('commits one validated decision with the server time', async () => {
    const commitDecision = vi.fn(async () => receipt());
    const handlers = createDuplicateReviewHandlers({ commitDecision, now: () => now });
    const response = await handlers.post(
      context({ method: 'POST', body: decisionBody(), idempotencyKey: requestId }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(receipt());
    expect(commitDecision).toHaveBeenCalledWith(
      groupId,
      expect.any(Object),
      expect.objectContaining({ requestId, capabilities: ['candidate:resolve'] }),
      decisionBody(),
      now,
    );
  });

  it('returns a generic conflict without leaking private details', async () => {
    const handlers = createDuplicateReviewHandlers({
      commitDecision: vi.fn(async () => {
        throw new CandidateDuplicateDecisionError('conflict', 'private conflict detail');
      }),
    });
    const response = await handlers.post(
      context({ method: 'POST', body: decisionBody(), idempotencyKey: requestId }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'duplicate_decision_conflict' });
  });
});
