import type {
  CandidateDuplicateDecisionBackend,
  CandidateDuplicateDecisionCommand,
  CandidateDuplicateDecisionReceipt,
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
    _command: CandidateDuplicateDecisionCommand,
  ): Promise<CandidateDuplicateDecisionReceipt> {
    throw new Error('Not implemented.');
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
