import { evaluateEvidenceThreshold } from '../../schemas/evidence';
import {
  EvidenceReviewDecisionError,
  type EvidenceReviewClaimStatus,
  type EvidenceReviewClaimVisibility,
  type EvidenceReviewDecisionBackend,
  type EvidenceReviewDecisionCommand,
  type EvidenceReviewDecisionReceipt,
  type EvidenceReviewVerificationEventType,
} from './decision';

export interface InMemoryEvidenceReviewClaimSeed {
  id: string;
  claimStatus: EvidenceReviewClaimStatus;
  visibility: EvidenceReviewClaimVisibility;
  updatedAt: string;
  howToPay: string | null;
  customerPaysCrypto: boolean;
  merchantExplicitlyAcceptsCrypto: boolean;
  firstConfirmedAt: string | null;
  lastConfirmedAt: string | null;
  nextReviewAt: string | null;
  endedAt: string | null;
  endedReason: string | null;
  deletedAt: string | null;
}

export interface InMemoryEvidenceReviewEvidenceSeed {
  id: string;
  claimId: string;
  evidenceClass: 'a' | 'b' | 'c';
  originRole:
    | 'merchant_side'
    | 'processor_side'
    | 'usage_side'
    | 'on_ground'
    | 'osm_side'
    | 'directory'
    | 'other';
  polarity: 'supporting' | 'contradicting' | 'neutral';
  reviewStatus: 'pending' | 'accepted' | 'rejected' | 'superseded';
  observedAt: string | null;
  independenceKey: string | null;
  updatedAt: string;
  deletedAt: string | null;
}

interface StoredDecision {
  fingerprint: string;
  receipt: EvidenceReviewDecisionReceipt;
}

interface StoredVerificationEvent {
  claimId: string;
  evidenceId: string;
  eventType: Exclude<EvidenceReviewVerificationEventType, null>;
  fromStatus: EvidenceReviewClaimStatus;
  toStatus: EvidenceReviewClaimStatus;
  reasonCode: string;
  effectiveAt: string;
}

interface EvidenceReviewState {
  claims: Map<string, InMemoryEvidenceReviewClaimSeed>;
  evidence: Map<string, InMemoryEvidenceReviewEvidenceSeed>;
  decisionsByRequest: Map<string, StoredDecision>;
  verificationEvents: StoredVerificationEvent[];
}

export interface InMemoryEvidenceReviewBackendOptions {
  claims?: InMemoryEvidenceReviewClaimSeed[];
  evidence?: InMemoryEvidenceReviewEvidenceSeed[];
  failBeforeCommit?: (command: EvidenceReviewDecisionCommand) => boolean;
}

function cloneState(state: EvidenceReviewState): EvidenceReviewState {
  return {
    claims: new Map([...state.claims].map(([id, claim]) => [id, structuredClone(claim)])),
    evidence: new Map(
      [...state.evidence].map(([id, evidence]) => [id, structuredClone(evidence)]),
    ),
    decisionsByRequest: new Map(
      [...state.decisionsByRequest].map(([id, decision]) => [id, structuredClone(decision)]),
    ),
    verificationEvents: state.verificationEvents.map((event) => structuredClone(event)),
  };
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function conflict(message: string, issues: string[] = []): never {
  throw new EvidenceReviewDecisionError('conflict', message, issues);
}

function invalid(message: string, issues: string[] = []): never {
  throw new EvidenceReviewDecisionError('invalid_decision', message, issues);
}

function acceptedEvidenceIds(state: EvidenceReviewState, claimId: string): string[] {
  return sorted(
    [...state.evidence.values()]
      .filter(
        (row) =>
          row.claimId === claimId && row.reviewStatus === 'accepted' && row.deletedAt === null,
      )
      .map((row) => row.id),
  );
}

function thresholdEligible(state: EvidenceReviewState, claimId: string) {
  return evaluateEvidenceThreshold(
    [...state.evidence.values()]
      .filter(
        (row) =>
          row.claimId === claimId && row.reviewStatus === 'accepted' && row.deletedAt === null,
      )
      .map((row) => ({
        evidenceClass: row.evidenceClass,
        originRole: row.originRole,
        polarity: row.polarity,
        reviewStatus: row.reviewStatus,
        independenceKey: row.independenceKey,
        observedAt: row.observedAt,
      })),
  );
}

function ensureAcceptedEvidenceShape(evidence: InMemoryEvidenceReviewEvidenceSeed) {
  if (evidence.evidenceClass !== 'c' && evidence.observedAt === null) {
    invalid('Accepted Class A and B Evidence requires an observation time.');
  }
  if (evidence.evidenceClass === 'b' && evidence.independenceKey === null) {
    invalid('Accepted Class B Evidence requires an independence key.');
  }
}

function ensureFindingMatchesEvidence(
  command: EvidenceReviewDecisionCommand,
  evidence: InMemoryEvidenceReviewEvidenceSeed,
) {
  if (command.disposition !== 'accepted') return;
  if (command.finding === 'supports_claim' && evidence.polarity !== 'supporting') {
    invalid('A supports-claim finding requires supporting Evidence polarity.');
  }
  if (command.finding === 'contradicts_claim' && evidence.polarity !== 'contradicting') {
    invalid('A contradicts-claim finding requires contradicting Evidence polarity.');
  }
}

function applyClaimAction(
  state: EvidenceReviewState,
  command: EvidenceReviewDecisionCommand,
  claim: InMemoryEvidenceReviewClaimSeed,
): EvidenceReviewVerificationEventType {
  if (command.claimAction === 'no_change') return null;

  const fromStatus = claim.claimStatus;
  let eventType: Exclude<EvidenceReviewVerificationEventType, null>;
  if (command.claimAction === 'confirm') {
    if (!['candidate', 'confirmed', 'stale'].includes(fromStatus)) {
      invalid('Only candidate, confirmed, or stale Claims can be confirmed.');
    }
    if (!thresholdEligible(state, claim.id).eligible) {
      invalid('The accepted Evidence set does not satisfy the confirmation threshold.');
    }
    if (
      claim.howToPay === null ||
      claim.howToPay.trim().length === 0 ||
      !claim.customerPaysCrypto ||
      !claim.merchantExplicitlyAcceptsCrypto
    ) {
      invalid('The Claim does not satisfy the canonical confirmation requirements.');
    }
    eventType =
      fromStatus === 'candidate'
        ? 'confirmed'
        : fromStatus === 'stale'
          ? 'restored'
          : 'reconfirmed';
    claim.claimStatus = 'confirmed';
    claim.firstConfirmedAt ??= command.decidedAt.toISOString();
    claim.lastConfirmedAt = command.decidedAt.toISOString();
    claim.nextReviewAt = command.nextReviewAt?.toISOString() ?? null;
    claim.endedAt = null;
    claim.endedReason = null;
  } else {
    if (command.disposition !== 'accepted' || command.finding !== 'contradicts_claim') {
      invalid('Negative Claim actions require accepted contradicting Evidence.');
    }
    if (command.claimAction === 'mark_stale') {
      if (fromStatus !== 'confirmed') invalid('Only confirmed Claims can be marked stale.');
      eventType = 'marked_stale';
      claim.claimStatus = 'stale';
      claim.nextReviewAt = command.nextReviewAt?.toISOString() ?? null;
    } else if (command.claimAction === 'end') {
      if (!['confirmed', 'stale'].includes(fromStatus)) {
        invalid('Only confirmed or stale Claims can be ended.');
      }
      eventType = 'ended';
      claim.claimStatus = 'ended';
      claim.endedAt = command.decidedAt.toISOString();
      claim.endedReason = command.endedReason;
      claim.nextReviewAt = null;
    } else {
      if (fromStatus !== 'candidate') invalid('Only candidate Claims can be rejected.');
      eventType = 'rejected';
      claim.claimStatus = 'rejected';
      claim.nextReviewAt = null;
    }
  }

  claim.updatedAt = command.decidedAt.toISOString();
  state.claims.set(claim.id, claim);
  state.verificationEvents.push({
    claimId: claim.id,
    evidenceId: command.evidenceId,
    eventType,
    fromStatus,
    toStatus: claim.claimStatus,
    reasonCode: command.reasonCode,
    effectiveAt: command.decidedAt.toISOString(),
  });
  return eventType;
}

export class InMemoryEvidenceReviewBackend implements EvidenceReviewDecisionBackend {
  private state: EvidenceReviewState;
  private readonly options: InMemoryEvidenceReviewBackendOptions;

  constructor(options: InMemoryEvidenceReviewBackendOptions = {}) {
    this.options = options;
    this.state = {
      claims: new Map((options.claims ?? []).map((claim) => [claim.id, structuredClone(claim)])),
      evidence: new Map(
        (options.evidence ?? []).map((evidence) => [evidence.id, structuredClone(evidence)]),
      ),
      decisionsByRequest: new Map(),
      verificationEvents: [],
    };
  }

  async commitDecision(
    command: EvidenceReviewDecisionCommand,
  ): Promise<EvidenceReviewDecisionReceipt> {
    const existing = this.state.decisionsByRequest.get(command.requestId);
    if (existing !== undefined) {
      if (existing.fingerprint !== command.requestFingerprint) {
        conflict('The Evidence review request ID was reused with different content.');
      }
      return { ...structuredClone(existing.receipt), state: 'replayed' };
    }

    const next = cloneState(this.state);
    const evidence = next.evidence.get(command.evidenceId);
    const claim = next.claims.get(command.claimId);
    if (evidence === undefined || evidence.deletedAt !== null) {
      throw new EvidenceReviewDecisionError('not_found', 'The Evidence record was not found.');
    }
    if (claim === undefined || claim.deletedAt !== null) {
      throw new EvidenceReviewDecisionError('not_found', 'The Claim record was not found.');
    }
    if (evidence.claimId !== claim.id) conflict('The Evidence no longer belongs to the reviewed Claim.');
    if (
      evidence.updatedAt !== command.expectedEvidenceUpdatedAt.toISOString() ||
      evidence.reviewStatus !== command.expectedEvidenceReviewStatus
    ) {
      conflict('The Evidence record changed before review.');
    }
    if (
      claim.updatedAt !== command.expectedClaimUpdatedAt.toISOString() ||
      claim.claimStatus !== command.expectedClaimStatus ||
      claim.visibility !== command.expectedClaimVisibility
    ) {
      conflict('The Claim record changed before review.');
    }
    if (
      JSON.stringify(acceptedEvidenceIds(next, claim.id)) !==
      JSON.stringify(sorted(command.expectedAcceptedEvidenceIds))
    ) {
      conflict('The accepted Evidence set changed before review.');
    }

    ensureFindingMatchesEvidence(command, evidence);
    if (command.disposition === 'accepted') {
      ensureAcceptedEvidenceShape(evidence);
      evidence.reviewStatus = 'accepted';
    } else if (command.disposition === 'rejected') {
      evidence.reviewStatus = 'rejected';
    } else {
      evidence.reviewStatus = 'pending';
    }
    evidence.updatedAt = command.decidedAt.toISOString();
    next.evidence.set(evidence.id, evidence);

    const verificationEventType = applyClaimAction(next, command, claim);
    const receipt: EvidenceReviewDecisionReceipt = {
      requestId: command.requestId,
      evidenceId: evidence.id,
      claimId: claim.id,
      disposition: command.disposition,
      finding: command.finding,
      claimAction: command.claimAction,
      evidenceReviewStatus: evidence.reviewStatus,
      claimStatus: next.claims.get(claim.id)?.claimStatus ?? claim.claimStatus,
      claimVisibility: claim.visibility,
      verificationEventType,
      decidedAt: command.decidedAt.toISOString(),
      state: 'committed',
    };
    next.decisionsByRequest.set(command.requestId, {
      fingerprint: command.requestFingerprint,
      receipt,
    });

    if (this.options.failBeforeCommit?.(command) === true) {
      throw new Error('Injected Evidence review failure before atomic commit.');
    }
    this.state = next;
    return structuredClone(receipt);
  }

  snapshot() {
    return {
      claims: [...this.state.claims.values()]
        .map((row) => structuredClone(row))
        .sort((left, right) => left.id.localeCompare(right.id)),
      evidence: [...this.state.evidence.values()]
        .map((row) => structuredClone(row))
        .sort((left, right) => left.id.localeCompare(right.id)),
      decisions: this.state.decisionsByRequest.size,
      verificationEvents: this.state.verificationEvents.map((row) => structuredClone(row)),
    };
  }
}
