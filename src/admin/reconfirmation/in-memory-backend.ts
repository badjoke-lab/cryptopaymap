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

function conflict(message: string): never {
  throw new ReconfirmationExpirationError('conflict', message);
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
    command: ReconfirmationExpirationCommand,
  ): Promise<ReconfirmationExpirationReceipt> {
    const existing = this.state.expirations.get(command.requestId);
    if (existing !== undefined) {
      if (existing.fingerprint !== command.requestFingerprint) {
        conflict('The expiration request ID was reused with different content.');
      }
      return { ...structuredClone(existing.receipt), state: 'replayed' };
    }

    const next = cloneState(this.state);
    const claim = next.claims.get(command.claimId);
    if (claim === undefined || claim.deletedAt !== null) {
      throw new ReconfirmationExpirationError('not_found', 'The Claim record was not found.');
    }
    if (
      claim.claimStatus !== command.expectedClaimStatus ||
      claim.visibility !== command.expectedClaimVisibility ||
      claim.updatedAt !== command.expectedClaimUpdatedAt.toISOString() ||
      claim.nextReviewAt !== command.expectedNextReviewAt.toISOString()
    ) {
      conflict('The Claim or review deadline changed before expiration.');
    }
    if (command.effectiveAt.getTime() < command.expectedNextReviewAt.getTime()) {
      throw new ReconfirmationExpirationError(
        'invalid_expiration',
        'The Claim review deadline has not expired.',
      );
    }

    claim.claimStatus = 'stale';
    claim.updatedAt = command.effectiveAt.toISOString();
    next.claims.set(claim.id, claim);
    next.events.push({
      claimId: claim.id,
      eventType: 'marked_stale',
      fromStatus: 'confirmed',
      toStatus: 'stale',
      visibility: claim.visibility,
      reasonCode: command.reasonCode,
      effectiveAt: command.effectiveAt.toISOString(),
    });
    const receipt: ReconfirmationExpirationReceipt = {
      requestId: command.requestId,
      claimId: claim.id,
      fromStatus: 'confirmed',
      toStatus: 'stale',
      visibility: claim.visibility,
      nextReviewAt: command.expectedNextReviewAt.toISOString(),
      eventType: 'marked_stale',
      effectiveAt: command.effectiveAt.toISOString(),
      state: 'committed',
    };
    next.expirations.set(command.requestId, {
      fingerprint: command.requestFingerprint,
      receipt,
    });

    if (this.options.failBeforeCommit?.(command) === true) {
      throw new Error('Injected Claim expiration failure before atomic commit.');
    }
    this.state = next;
    return structuredClone(receipt);
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
