import type { NewCandidateDuplicateGroup, NewCandidateDuplicateSignal } from '../../db/schema';
import type { CandidateImportPlan } from './candidate-plan';

export interface CandidateDuplicateSignalPersistencePlan {
  groups: NewCandidateDuplicateGroup[];
  candidateGroupIds: Map<string, string>;
  signals: NewCandidateDuplicateSignal[];
}

async function deterministicUuid(label: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(label));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function orderedPair(leftCandidateId: string, rightCandidateId: string): [string, string] {
  return leftCandidateId.localeCompare(rightCandidateId) <= 0
    ? [leftCandidateId, rightCandidateId]
    : [rightCandidateId, leftCandidateId];
}

function connectedComponents(
  candidateIds: readonly string[],
  edges: ReadonlyArray<readonly [string, string]>,
): string[][] {
  const parents = new Map(candidateIds.map((candidateId) => [candidateId, candidateId]));

  const find = (candidateId: string): string => {
    const parent = parents.get(candidateId);
    if (parent === undefined) throw new Error(`Unknown duplicate Candidate: ${candidateId}`);
    if (parent === candidateId) return candidateId;
    const root = find(parent);
    parents.set(candidateId, root);
    return root;
  };

  const union = (leftCandidateId: string, rightCandidateId: string) => {
    const leftRoot = find(leftCandidateId);
    const rightRoot = find(rightCandidateId);
    if (leftRoot === rightRoot) return;
    const [first, second] = [leftRoot, rightRoot].sort();
    parents.set(second ?? rightRoot, first ?? leftRoot);
  };

  for (const [leftCandidateId, rightCandidateId] of edges) {
    union(leftCandidateId, rightCandidateId);
  }

  const components = new Map<string, string[]>();
  for (const candidateId of candidateIds) {
    const root = find(candidateId);
    const members = components.get(root) ?? [];
    members.push(candidateId);
    components.set(root, members);
  }

  return [...components.values()]
    .filter((members) => members.length >= 2)
    .map((members) => members.sort())
    .sort((left, right) => (left[0] ?? '').localeCompare(right[0] ?? ''));
}

export async function buildCandidateDuplicateSignalPersistencePlan(
  plan: CandidateImportPlan,
): Promise<CandidateDuplicateSignalPersistencePlan> {
  if (plan.duplicateSignals.length === 0) {
    return { groups: [], candidateGroupIds: new Map(), signals: [] };
  }

  const draftIds = new Set(plan.drafts.map((draft) => draft.candidateId));
  const candidateTypes = new Map(
    plan.drafts.map((draft) => [draft.candidateId, draft.candidate.candidateType]),
  );
  const orderedSignals = plan.duplicateSignals
    .map((signal) => {
      const [leftCandidateId, rightCandidateId] = orderedPair(
        signal.leftCandidateId,
        signal.rightCandidateId,
      );
      if (!draftIds.has(leftCandidateId) || !draftIds.has(rightCandidateId)) {
        throw new Error('Duplicate signals must reference Candidates from the same import plan.');
      }
      if (leftCandidateId === rightCandidateId) {
        throw new Error('Duplicate signals must reference two distinct Candidates.');
      }
      if (candidateTypes.get(leftCandidateId) !== candidateTypes.get(rightCandidateId)) {
        throw new Error('Duplicate signals cannot connect different Candidate types.');
      }
      return { ...signal, leftCandidateId, rightCandidateId };
    })
    .sort((left, right) =>
      [left.leftCandidateId, left.rightCandidateId, left.reason]
        .join(':')
        .localeCompare([right.leftCandidateId, right.rightCandidateId, right.reason].join(':')),
    );

  const signalKeys = orderedSignals.map((signal) =>
    [signal.leftCandidateId, signal.rightCandidateId, signal.reason].join(':'),
  );
  if (new Set(signalKeys).size !== signalKeys.length) {
    throw new Error('Duplicate signal identities must be unique within one import plan.');
  }

  const components = connectedComponents(
    [...draftIds].sort(),
    orderedSignals.map((signal) => [signal.leftCandidateId, signal.rightCandidateId] as const),
  );
  const candidateGroupIds = new Map<string, string>();
  const groups: NewCandidateDuplicateGroup[] = [];

  for (const members of components) {
    const groupId = await deterministicUuid(`candidate-duplicate-group:${members.join(':')}`);
    groups.push({
      id: groupId,
      status: 'open',
      resolutionNote: null,
      resolvedAt: null,
    });
    for (const candidateId of members) candidateGroupIds.set(candidateId, groupId);
  }

  const signals: NewCandidateDuplicateSignal[] = [];
  for (const signal of orderedSignals) {
    const duplicateGroupId = candidateGroupIds.get(signal.leftCandidateId);
    if (duplicateGroupId === undefined) {
      throw new Error('Duplicate signal component did not receive a group identity.');
    }
    const signalId = await deterministicUuid(
      `candidate-duplicate-signal:${duplicateGroupId}:${signal.leftCandidateId}:${signal.rightCandidateId}:${signal.reason}`,
    );
    signals.push({
      id: signalId,
      duplicateGroupId,
      leftCandidateId: signal.leftCandidateId,
      rightCandidateId: signal.rightCandidateId,
      reason: signal.reason,
      strength: signal.strength,
      importBatchId: plan.importBatchId,
    });
  }

  return { groups, candidateGroupIds, signals };
}
