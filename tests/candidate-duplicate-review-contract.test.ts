import { describe, expect, it, vi } from 'vitest';
import {
  loadCandidateDuplicateReview,
  type CandidateDuplicateReviewBackend,
  type CandidateDuplicateReviewData,
} from '../src/admin/candidates/duplicate-review';

const groupId = '10000000-0000-4000-8000-000000000001';
const leftId = '20000000-0000-4000-8000-000000000001';
const rightId = '20000000-0000-4000-8000-000000000002';
const now = new Date('2026-06-29T03:00:00.000Z');
const context = {
  actorId: 'cloudflare-access:reviewer',
  actorType: 'human' as const,
  capabilities: ['candidate:read' as const],
};

function member(id: string, name: string) {
  return {
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
  };
}

function validGroup(): CandidateDuplicateReviewData {
  return {
    group: {
      id: groupId,
      status: 'open',
      updatedAt: '2026-06-28T01:00:00.000Z',
      resolvedAt: null,
    },
    members: [member(leftId, 'Left Cafe'), member(rightId, 'Right Cafe')],
    signals: [
      {
        id: '30000000-0000-4000-8000-000000000001',
        leftCandidateId: leftId,
        rightCandidateId: rightId,
        reason: 'shared_osm_identity',
        strength: 'strong',
        createdAt: '2026-06-28T01:00:00.000Z',
      },
    ],
    signalsTruncated: false,
  };
}

describe('Candidate duplicate review contract', () => {
  it('rejects unauthorized contexts before backend access', async () => {
    const backend: CandidateDuplicateReviewBackend = {
      loadGroup: vi.fn(async () => validGroup()),
    };
    await expect(
      loadCandidateDuplicateReview({ ...context, capabilities: [] }, backend, groupId, now),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(backend.loadGroup).not.toHaveBeenCalled();
  });

  it('rejects invalid group identifiers before backend access', async () => {
    const backend: CandidateDuplicateReviewBackend = {
      loadGroup: vi.fn(async () => validGroup()),
    };
    await expect(
      loadCandidateDuplicateReview(context, backend, 'invalid', now),
    ).rejects.toMatchObject({ code: 'invalid_group_id' });
    expect(backend.loadGroup).not.toHaveBeenCalled();
  });

  it('returns one validated bounded group', async () => {
    const backend: CandidateDuplicateReviewBackend = {
      loadGroup: vi.fn(async () => validGroup()),
    };
    await expect(loadCandidateDuplicateReview(context, backend, groupId, now)).resolves.toEqual({
      ...validGroup(),
      generatedAt: now.toISOString(),
    });
  });

  it('rejects a mixed-type or external signal reference', async () => {
    const invalid = validGroup();
    invalid.members[1]!.candidateType = 'online_service';
    invalid.signals[0]!.rightCandidateId = '20000000-0000-4000-8000-000000000099';
    const backend: CandidateDuplicateReviewBackend = {
      loadGroup: vi.fn(async () => invalid),
    };
    await expect(
      loadCandidateDuplicateReview(context, backend, groupId, now),
    ).rejects.toMatchObject({ code: 'invalid_group' });
  });

  it('returns not found only after authorized lookup', async () => {
    const backend: CandidateDuplicateReviewBackend = { loadGroup: vi.fn(async () => null) };
    await expect(
      loadCandidateDuplicateReview(context, backend, groupId, now),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(backend.loadGroup).toHaveBeenCalledOnce();
  });
});
