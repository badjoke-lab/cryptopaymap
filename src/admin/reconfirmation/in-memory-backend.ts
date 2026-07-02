import {
  ReconfirmationExpirationError,
  type ReconfirmationExpirationBackend,
  type ReconfirmationExpirationCommand,
  type ReconfirmationExpirationReceipt,
} from './expiration';

export interface InMemoryReconfirmationClaimSeed {
  id: string;
  claimStatus: 'candidate' | 'confirmed' | 'stale' | 'ended' | 'rejected';
  visibility: 'public' | 'hidden' | 'temporarily_hidden';
  lastConfirmedAt: string | null;
  nextReviewAt: string | null;
  updatedAt: string;
  deletedAt: string | null;
}

interface StoredExpiration {
  fingerprint: string;
  receipt: ReconfirmationExpirationReceipt;
}

interface StoredEvent {
  claimId: string;
  eventType: 'marked_stale';
  fromStatus: 'confirmed';
  toStatus: 'stale';
  visibility: 'public' | 'hidden' | 'temporarily_hidden';
  reasonCode: 'review_window_expired';
  effectiveAt: string;
}

interface State {
  claims: Map<string, InMemoryReconfirmationClaimSeed>;
  expirations: Map<string, StoredExpiration>;
  events: StoredEvent[];
}

export interface InMemoryReconfirmationBackendOptions {
  claims?: InMemoryReconfirmationClaimSeed[];
  failBeforeCommit?: (command: ReconfirmationExpirationCommand) => boolean;
}

function cloneState(state: State): State {
  return {
    claims: new Map([...state.claims].map(([id, claim]) => [id, structuredClone(claim)])),
    expirations: new Map(
      [...state.expirations].map(([id, expiration]) => [id, structuredClone(expiration)]),
    ),
    events: state.events.map((event) => structuredClone(event)),
  };
}

export class InMemoryReconfirmationBackend implements ReconfirmationExpirationBackend {
  private state: State;
  private readonly options: InMemoryReconfirmationBackendOptions;

  constructor(options: InMemoryReconfirmationBackendOptions = {}) {
    this.options = options;
    this.state = {
      claims: new Map((options.claims ?? []).map((claim) => [claim.id, structuredClone(claim)])),
      expirations: new Map(),
      events: [],
    };
  }

  async commitExpiration(
    _command: ReconfirmationExpirationCommand,
  ): Promise<ReconfirmationExpirationReceipt> {
    throw new ReconfirmationExpirationError(
      'backend_failure',
      'The Claim expiration backend is incomplete.',
    );
  }

  snapshot() {
    return {
      claims: [...this.state.claims.values()]
        .map((claim) => structuredClone(claim))
        .sort((left, right) => left.id.localeCompare(right.id)),
      expirations: this.state.expirations.size,
      events: this.state.events.map((event) => structuredClone(event)),
    };
  }
}

export function cloneReconfirmationStateForTest(state: unknown) {
  return structuredClone(state);
}
