import {
  CandidateDuplicateDecisionError,
  type CandidateDuplicateDecisionBackend,
  type CandidateDuplicateDecisionCommand,
  type CandidateDuplicateDecisionReceipt,
} from './duplicate-decision';

export interface InMemoryDuplicateGroupSeed {
  id: string;
  status: 'open' | 'resolved' | 'dismissed';
  updatedAt: string;
  resolutionNote?: string | null;
  resolvedAt?: string | null;
}

export interface InMemoryDuplicateCandidateSeed {
  id: string;
  duplicateGroupId: string;
  candidateType:
    | 'physical_place'
    | 'online_service'
    | 'payment_processor'
    | 'payment_program'
    | 'platform';
  candidateStatus: 'new' | 'triaged' | 'linked' | 'promoted' | 'duplicate' | 'rejected' | 'archived';
  updatedAt: string;
}

interface StoredDecision {
  fingerprint: string;
  receipt: CandidateDuplicateDecisionReceipt;
}

interface InMemoryDuplicateDecisionState {
  groups: Map<string, InMemoryDuplicateGroupSeed>;
  candidates: Map<string, InMemoryDuplicateCandidateSeed>;
  decisionsByRequest: Map<string, StoredDecision>;
  decisionGroups: Map<string, string>;
}

export interface InMemoryDuplicateDecisionBackendOptions {
  groups?: InMemoryDuplicateGroupSeed[];
  candidates?: InMemoryDuplicateCandidateSeed[];
  failBeforeCommit?: (command: CandidateDuplicateDecisionCommand) => boolean;
}

function cloneState(state: InMemoryDuplicateDecisionState): InMemoryDuplicateDecisionState {
  return {
    groups: new Map(
      [...state.groups].map(([id, group]) => [id, structuredClone(group)]),
    ),
    candidates: new Map(
      [...state.candidates].map(([id, candidate]) => [id, structuredClone(candidate)]),
    ),
    decisionsByRequest: new Map(
      [...state.decisionsByRequest].map(([id, decision]) => [id, structuredClone(decision)]),
    ),
    decisionGroups: new Map(state.decisionGroups),
  };
}

function conflict(message: string, issues: string[] = []): never {
  throw new CandidateDuplicateDecisionError('conflict', message, issues);
}

export class InMemoryDuplicateDecisionBackend implements CandidateDuplicateDecisionBackend {
  private state: InMemoryDuplicateDecisionState;
  private readonly options: InMemoryDuplicateDecisionBackendOptions;

  constructor(options: InMemoryDuplicateDecisionBackendOptions = {}) {
    this.options = options;
    this.state = {
      groups: new Map((options.groups ?? []).map((group) => [group.id, structuredClone(group)])),
      candidates: new Map(
        (options.candidates ?? []).map((candidate) => [candidate.id, structuredClone(candidate)]),
      ),
      decisionsByRequest: new Map(),
      decisionGroups: new Map(),
    };
  }

  async commitDecision(
    command: CandidateDuplicateDecisionCommand,
  ): Promise<CandidateDuplicateDecisionReceipt> {
    const existing = this.state.decisionsByRequest.get(command.requestId);
    if (existing !== undefined) {
      if (existing.fingerprint !== command.decisionFingerprint) {
        conflict('The duplicate decision request ID was reused with different content.');
      }
      return { ...structuredClone(existing.receipt), state: 'replayed' };
    }

    const next = cloneState(this.state);
    const group = next.groups.get(command.duplicateGroupId);
    if (group === undefined) {
      throw new CandidateDuplicateDecisionError(
        'not_found',
        'The Candidate duplicate group was not found.',
      );
    }
    if (
      group.status !== 'open' ||
      group.updatedAt !== command.expectedGroupUpdatedAt.toISOString()
    ) {
      conflict('The Candidate duplicate group changed before the decision was committed.');
    }
    if (next.decisionGroups.has(command.duplicateGroupId)) {
      conflict('The Candidate duplicate group already has a committed decision.');
    }

    const currentMembers = [...next.candidates.values()]
      .filter((candidate) => candidate.duplicateGroupId === command.duplicateGroupId)
      .sort((left, right) => left.id.localeCompare(right.id));
    const currentMemberIds = currentMembers.map((candidate) => candidate.id);
    if (JSON.stringify(currentMemberIds) !== JSON.stringify(command.memberCandidateIds)) {
      conflict('The Candidate duplicate group membership changed before commit.', [
        `expected members: ${command.memberCandidateIds.join(',')}`,
        `current members: ${currentMemberIds.join(',')}`,
      ]);
    }
    if (new Set(currentMembers.map((candidate) => candidate.candidateType)).size !== 1) {
      conflict('A duplicate group cannot contain different Candidate types.');
    }
    if (
      currentMembers.some(
        (candidate) => !['new', 'triaged'].includes(candidate.candidateStatus),
      )
    ) {
      conflict('Only new or triaged Candidates can be resolved as duplicates.');
    }

    if (command.action === 'confirm_duplicate') {
      for (const candidate of currentMembers) {
        if (candidate.id === command.primaryCandidateId) continue;
        candidate.candidateStatus = 'duplicate';
        candidate.updatedAt = command.decidedAt.toISOString();
        next.candidates.set(candidate.id, candidate);
      }
      group.status = 'resolved';
    } else {
      group.status = 'dismissed';
    }
    group.resolutionNote = command.note;
    group.resolvedAt = command.decidedAt.toISOString();
    group.updatedAt = command.decidedAt.toISOString();
    next.groups.set(group.id, group);

    const receipt: CandidateDuplicateDecisionReceipt = {
      decisionId: command.decisionId,
      requestId: command.requestId,
      duplicateGroupId: command.duplicateGroupId,
      action: command.action,
      primaryCandidateId: command.primaryCandidateId,
      memberCandidateIds: [...command.memberCandidateIds],
      groupStatus: command.action === 'confirm_duplicate' ? 'resolved' : 'dismissed',
      decidedAt: command.decidedAt.toISOString(),
      state: 'committed',
    };
    next.decisionsByRequest.set(command.requestId, {
      fingerprint: command.decisionFingerprint,
      receipt,
    });
    next.decisionGroups.set(command.duplicateGroupId, command.decisionId);

    if (this.options.failBeforeCommit?.(command) === true) {
      throw new Error('Injected duplicate decision failure before atomic commit.');
    }

    this.state = next;
    return structuredClone(receipt);
  }

  snapshot() {
    return {
      groups: [...this.state.groups.values()]
        .map((group) => structuredClone(group))
        .sort((left, right) => left.id.localeCompare(right.id)),
      candidates: [...this.state.candidates.values()]
        .map((candidate) => structuredClone(candidate))
        .sort((left, right) => left.id.localeCompare(right.id)),
      decisions: this.state.decisionsByRequest.size,
    };
  }
}
