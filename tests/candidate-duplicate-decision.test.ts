import { describe, expect, it, vi } from 'vitest';
import {
  CandidateDuplicateDecisionError,
  createCandidateDuplicateDecisionService,
  type CandidateDuplicateDecisionInput,
  type CandidateDuplicateMutationContext,
} from '../src/admin/candidates/duplicate-decision';
import { InMemoryDuplicateDecisionBackend } from '../src/admin/candidates/in-memory-duplicate-decision-backend';

const groupId = '10000000-0000-4000-8000-000000000001';
const primaryId = '20000000-0000-4000-8000-000000000001';
const duplicateId = '20000000-0000-4000-8000-000000000002';
const groupUpdatedAt = '2026-06-29T01:00:00.000Z';
const decidedAt = '2026-06-29T02:00:00.000Z';

function context(): CandidateDuplicateMutationContext {
  return {
    requestId: '30000000-0000-4000-8000-000000000001',
    actorId: 'admin:duplicate-reviewer',
    actorType: 'human',
    capabilities: ['candidate:resolve'],
  };
}

function input(
  overrides: Partial<CandidateDuplicateDecisionInput> = {},
): CandidateDuplicateDecisionInput {
  return {
    duplicateGroupId: groupId,
    action: 'confirm_duplicate',
    primaryCandidateId: primaryId,
    memberCandidateIds: [duplicateId, primaryId],
    reasonCode: 'same_osm_identity',
    note: 'Reviewed matching OSM identity.',
    expectedGroupUpdatedAt: groupUpdatedAt,
    decidedAt,
    ...overrides,
  };
}

function backend(options: { failBeforeCommit?: boolean } = {}) {
  return new InMemoryDuplicateDecisionBackend({
    groups: [{ id: groupId, status: 'open', updatedAt: groupUpdatedAt }],
    candidates: [
      {
        id: primaryId,
        duplicateGroupId: groupId,
        candidateType: 'physical_place',
        candidateStatus: 'triaged',
        updatedAt: groupUpdatedAt,
      },
      {
        id: duplicateId,
        duplicateGroupId: groupId,
        candidateType: 'physical_place',
        candidateStatus: 'new',
        updatedAt: groupUpdatedAt,
      },
    ],
    failBeforeCommit: options.failBeforeCommit ? () => true : undefined,
  });
}

describe('Candidate duplicate decision service', () => {
  it('rejects actors without candidate-resolve before backend access', async () => {
    const commitDecision = vi.fn();
    const service = createCandidateDuplicateDecisionService({ commitDecision });
    const unauthorized = context();
    unauthorized.capabilities = [];

    await expect(service.decide(unauthorized, input())).rejects.toMatchObject({
      code: 'unauthorized',
    });
    expect(commitDecision).not.toHaveBeenCalled();
  });

  it('rejects invalid action shape before backend access', async () => {
    const commitDecision = vi.fn();
    const service = createCandidateDuplicateDecisionService({ commitDecision });

    await expect(
      service.decide(context(), input({ primaryCandidateId: null })),
    ).rejects.toMatchObject({ code: 'invalid_decision' });
    expect(commitDecision).not.toHaveBeenCalled();
  });

  it('confirms duplicates without changing the primary Candidate', async () => {
    const store = backend();
    const service = createCandidateDuplicateDecisionService(store);

    const receipt = await service.decide(context(), input());
    const snapshot = store.snapshot();

    expect(receipt).toMatchObject({
      requestId: context().requestId,
      duplicateGroupId: groupId,
      action: 'confirm_duplicate',
      primaryCandidateId: primaryId,
      memberCandidateIds: [primaryId, duplicateId].sort(),
      groupStatus: 'resolved',
      state: 'committed',
    });
    expect(snapshot.groups[0]).toMatchObject({
      id: groupId,
      status: 'resolved',
      resolvedAt: decidedAt,
      resolutionNote: 'Reviewed matching OSM identity.',
    });
    expect(snapshot.candidates.find((candidate) => candidate.id === primaryId)).toMatchObject({
      candidateStatus: 'triaged',
      updatedAt: groupUpdatedAt,
    });
    expect(snapshot.candidates.find((candidate) => candidate.id === duplicateId)).toMatchObject({
      candidateStatus: 'duplicate',
      updatedAt: decidedAt,
    });
    expect(snapshot.decisions).toBe(1);
  });

  it('replays an identical request without a second mutation', async () => {
    const store = backend();
    const service = createCandidateDuplicateDecisionService(store);
    const decisionContext = context();
    const decisionInput = input();

    const first = await service.decide(decisionContext, decisionInput);
    const second = await service.decide(structuredClone(decisionContext), structuredClone(decisionInput));

    expect(first.state).toBe('committed');
    expect(second).toEqual({ ...first, state: 'replayed' });
    expect(store.snapshot().decisions).toBe(1);
  });

  it('rejects request ID reuse with different decision content', async () => {
    const store = backend();
    const service = createCandidateDuplicateDecisionService(store);
    const decisionContext = context();
    await service.decide(decisionContext, input());

    await expect(
      service.decide(decisionContext, input({ reasonCode: 'manual_match' })),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(store.snapshot().decisions).toBe(1);
  });

  it('dismisses a false-positive signal without changing Candidate statuses', async () => {
    const store = backend();
    const service = createCandidateDuplicateDecisionService(store);

    const receipt = await service.decide(
      context(),
      input({
        action: 'dismiss_signal',
        primaryCandidateId: null,
        reasonCode: 'different_business',
      }),
    );

    expect(receipt.groupStatus).toBe('dismissed');
    expect(store.snapshot().candidates.map((candidate) => candidate.candidateStatus)).toEqual([
      'triaged',
      'new',
    ]);
  });

  it('rejects a stale group version and changed membership', async () => {
    const staleStore = backend();
    const staleService = createCandidateDuplicateDecisionService(staleStore);
    await expect(
      staleService.decide(
        context(),
        input({ expectedGroupUpdatedAt: '2026-06-29T01:30:00.000Z' }),
      ),
    ).rejects.toMatchObject({ code: 'conflict' });

    const changedStore = backend();
    const changedService = createCandidateDuplicateDecisionService(changedStore);
    await expect(
      changedService.decide(
        context(),
        input({ memberCandidateIds: [primaryId, '20000000-0000-4000-8000-000000000003'] }),
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rolls back every state change on backend failure', async () => {
    const store = backend({ failBeforeCommit: true });
    const before = store.snapshot();
    const service = createCandidateDuplicateDecisionService(store);

    await expect(service.decide(context(), input())).rejects.toMatchObject({
      code: 'backend_failure',
    });
    expect(store.snapshot()).toEqual(before);
  });

  it('does not allow linked, promoted, or already-resolved Candidates to be changed', async () => {
    const store = new InMemoryDuplicateDecisionBackend({
      groups: [{ id: groupId, status: 'open', updatedAt: groupUpdatedAt }],
      candidates: [
        {
          id: primaryId,
          duplicateGroupId: groupId,
          candidateType: 'physical_place',
          candidateStatus: 'linked',
          updatedAt: groupUpdatedAt,
        },
        {
          id: duplicateId,
          duplicateGroupId: groupId,
          candidateType: 'physical_place',
          candidateStatus: 'new',
          updatedAt: groupUpdatedAt,
        },
      ],
    });
    const service = createCandidateDuplicateDecisionService(store);

    await expect(service.decide(context(), input())).rejects.toBeInstanceOf(
      CandidateDuplicateDecisionError,
    );
    expect(store.snapshot().decisions).toBe(0);
  });
});
