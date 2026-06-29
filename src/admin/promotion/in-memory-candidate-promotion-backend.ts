import {
  CandidatePromotionError,
  type CandidatePromotionBackend,
  type CandidatePromotionCommand,
  type CandidatePromotionReceipt,
} from './candidate-promotion';

export interface InMemoryPromotionCandidateSeed {
  id: string;
  candidateType:
    | 'physical_place'
    | 'online_service'
    | 'payment_processor'
    | 'payment_program'
    | 'platform';
  candidateStatus:
    | 'new'
    | 'triaged'
    | 'linked'
    | 'promoted'
    | 'duplicate'
    | 'rejected'
    | 'archived';
  updatedAt: string;
  canonicalEntityId: string | null;
  canonicalLocationId: string | null;
  sourceRecordIds: string[];
}

export interface InMemoryPromotionLegacyMappingSeed {
  id: string;
  sourceSystem: 'cryptopaymap_v2' | 'crypto_acceptance_registry';
  sourceRecordId: string;
  migrationStatus: 'pending' | 'mapped' | 'unresolved' | 'retired';
  canonicalPath: string | null;
  entityId: string | null;
  locationId: string | null;
  resolvedAt: string | null;
}

interface StoredPromotion {
  fingerprint: string;
  receipt: CandidatePromotionReceipt;
}

interface PromotionState {
  candidates: Map<string, InMemoryPromotionCandidateSeed>;
  legacyMappings: Map<string, InMemoryPromotionLegacyMappingSeed>;
  entities: Map<string, CandidatePromotionCommand['entity']>;
  locations: Map<string, NonNullable<CandidatePromotionCommand['location']>>;
  claims: Map<string, CandidatePromotionCommand['claim']>;
  claimAssets: Map<string, CandidatePromotionCommand['claimAssets'][number]>;
  provenance: Array<{
    subjectType: 'entity' | 'location' | 'acceptance_claim' | 'claim_asset';
    subjectId: string;
    sourceRecordId: string;
  }>;
  promotionsByRequest: Map<string, StoredPromotion>;
}

export interface InMemoryCandidatePromotionBackendOptions {
  candidates?: InMemoryPromotionCandidateSeed[];
  legacyMappings?: InMemoryPromotionLegacyMappingSeed[];
  assetIds?: string[];
  networkIds?: string[];
  paymentMethodIds?: string[];
  processorEntityIds?: string[];
  failBeforeCommit?: (command: CandidatePromotionCommand) => boolean;
}

function cloneState(state: PromotionState): PromotionState {
  return {
    candidates: new Map(
      [...state.candidates].map(([id, candidate]) => [id, structuredClone(candidate)]),
    ),
    legacyMappings: new Map(
      [...state.legacyMappings].map(([id, mapping]) => [id, structuredClone(mapping)]),
    ),
    entities: new Map([...state.entities].map(([id, entity]) => [id, structuredClone(entity)])),
    locations: new Map(
      [...state.locations].map(([id, location]) => [id, structuredClone(location)]),
    ),
    claims: new Map([...state.claims].map(([id, claim]) => [id, structuredClone(claim)])),
    claimAssets: new Map(
      [...state.claimAssets].map(([id, claimAsset]) => [id, structuredClone(claimAsset)]),
    ),
    provenance: state.provenance.map((link) => structuredClone(link)),
    promotionsByRequest: new Map(
      [...state.promotionsByRequest].map(([id, promotion]) => [id, structuredClone(promotion)]),
    ),
  };
}

function conflict(message: string, issues: string[] = []): never {
  throw new CandidatePromotionError('conflict', message, issues);
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

export class InMemoryCandidatePromotionBackend implements CandidatePromotionBackend {
  private state: PromotionState;
  private readonly assetIds: Set<string>;
  private readonly networkIds: Set<string>;
  private readonly paymentMethodIds: Set<string>;
  private readonly processorEntityIds: Set<string>;
  private readonly options: InMemoryCandidatePromotionBackendOptions;

  constructor(options: InMemoryCandidatePromotionBackendOptions = {}) {
    this.options = options;
    this.assetIds = new Set(options.assetIds ?? []);
    this.networkIds = new Set(options.networkIds ?? []);
    this.paymentMethodIds = new Set(options.paymentMethodIds ?? []);
    this.processorEntityIds = new Set(options.processorEntityIds ?? []);
    this.state = {
      candidates: new Map(
        (options.candidates ?? []).map((candidate) => [candidate.id, structuredClone(candidate)]),
      ),
      legacyMappings: new Map(
        (options.legacyMappings ?? []).map((mapping) => [mapping.id, structuredClone(mapping)]),
      ),
      entities: new Map(),
      locations: new Map(),
      claims: new Map(),
      claimAssets: new Map(),
      provenance: [],
      promotionsByRequest: new Map(),
    };
  }

  async commitPromotion(command: CandidatePromotionCommand): Promise<CandidatePromotionReceipt> {
    const existing = this.state.promotionsByRequest.get(command.requestId);
    if (existing !== undefined) {
      if (existing.fingerprint !== command.requestFingerprint) {
        conflict('The promotion request ID was reused with different content.');
      }
      return { ...structuredClone(existing.receipt), state: 'replayed' };
    }

    const next = cloneState(this.state);
    const candidate = next.candidates.get(command.candidateId);
    if (candidate === undefined) {
      throw new CandidatePromotionError('not_found', 'The source Candidate was not found.');
    }
    if (
      candidate.candidateType !== command.expectedCandidateType ||
      candidate.updatedAt !== command.expectedCandidateUpdatedAt.toISOString()
    ) {
      conflict('The source Candidate changed before promotion.');
    }
    if (!['new', 'triaged'].includes(candidate.candidateStatus)) {
      conflict('Only new or triaged Candidates can be promoted.');
    }
    if (candidate.canonicalEntityId !== null || candidate.canonicalLocationId !== null) {
      conflict('The source Candidate already references a canonical target.');
    }
    if (
      JSON.stringify(sorted(candidate.sourceRecordIds)) !==
      JSON.stringify(sorted(command.sourceRecordIds))
    ) {
      conflict('The Candidate source provenance changed before promotion.');
    }

    if (next.entities.has(command.entity.id)) conflict('The canonical entity ID already exists.');
    if (command.location !== null && next.locations.has(command.location.id)) {
      conflict('The canonical location ID already exists.');
    }
    if (next.claims.has(command.claim.id)) conflict('The acceptance claim ID already exists.');
    if (command.claimAssets.some((row) => next.claimAssets.has(row.id))) {
      conflict('A claim asset ID already exists.');
    }

    const entitySlug = command.entity.value.slug;
    if (
      entitySlug !== null &&
      [...next.entities.values()].some((row) => row.value.slug === entitySlug)
    ) {
      conflict('The canonical entity slug already exists.');
    }
    if (
      command.location !== null &&
      [...next.locations.values()].some((row) => row.value.slug === command.location?.value.slug)
    ) {
      conflict('The canonical location slug already exists.');
    }

    if (
      command.claim.value.processorId !== null &&
      !this.processorEntityIds.has(command.claim.value.processorId)
    ) {
      conflict('The selected processor entity does not exist.');
    }
    for (const row of command.claimAssets) {
      if (!this.assetIds.has(row.value.assetId)) conflict('A selected asset does not exist.');
      if (!this.networkIds.has(row.value.networkId)) conflict('A selected network does not exist.');
      if (!this.paymentMethodIds.has(row.value.paymentMethodId)) {
        conflict('A selected payment method does not exist.');
      }
    }

    next.entities.set(command.entity.id, structuredClone(command.entity));
    if (command.location !== null) {
      next.locations.set(command.location.id, structuredClone(command.location));
    }
    next.claims.set(command.claim.id, structuredClone(command.claim));
    for (const row of command.claimAssets) {
      next.claimAssets.set(row.id, structuredClone(row));
    }

    const subjects: Array<{
      subjectType: 'entity' | 'location' | 'acceptance_claim' | 'claim_asset';
      subjectId: string;
    }> = [
      { subjectType: 'entity', subjectId: command.entity.id },
      { subjectType: 'acceptance_claim', subjectId: command.claim.id },
      ...command.claimAssets.map((row) => ({
        subjectType: 'claim_asset' as const,
        subjectId: row.id,
      })),
    ];
    if (command.location !== null) {
      subjects.push({ subjectType: 'location', subjectId: command.location.id });
    }
    for (const subject of subjects) {
      for (const sourceRecordId of command.sourceRecordIds) {
        next.provenance.push({ ...subject, sourceRecordId });
      }
    }

    for (const mapping of next.legacyMappings.values()) {
      if (
        mapping.migrationStatus !== 'pending' ||
        !command.sourceRecordIds.includes(mapping.sourceRecordId)
      ) {
        continue;
      }
      mapping.migrationStatus = 'mapped';
      mapping.canonicalPath = command.canonicalPath;
      mapping.entityId =
        mapping.sourceSystem === 'crypto_acceptance_registry' ? command.entity.id : null;
      mapping.locationId =
        mapping.sourceSystem === 'cryptopaymap_v2' ? (command.location?.id ?? null) : null;
      mapping.resolvedAt = command.promotedAt.toISOString();
      next.legacyMappings.set(mapping.id, mapping);
    }

    candidate.candidateStatus = 'promoted';
    candidate.canonicalEntityId = command.entity.id;
    candidate.canonicalLocationId = command.location?.id ?? null;
    candidate.updatedAt = command.promotedAt.toISOString();
    next.candidates.set(candidate.id, candidate);

    const receipt: CandidatePromotionReceipt = {
      requestId: command.requestId,
      candidateId: command.candidateId,
      entityId: command.entity.id,
      locationId: command.location?.id ?? null,
      claimId: command.claim.id,
      claimAssetIds: command.claimAssets.map((row) => row.id),
      canonicalPath: command.canonicalPath,
      claimStatus: 'candidate',
      visibility: 'hidden',
      promotedAt: command.promotedAt.toISOString(),
      state: 'committed',
    };
    next.promotionsByRequest.set(command.requestId, {
      fingerprint: command.requestFingerprint,
      receipt,
    });

    if (this.options.failBeforeCommit?.(command) === true) {
      throw new Error('Injected Candidate promotion failure before atomic commit.');
    }

    this.state = next;
    return structuredClone(receipt);
  }

  snapshot() {
    return {
      candidates: [...this.state.candidates.values()]
        .map((candidate) => structuredClone(candidate))
        .sort((left, right) => left.id.localeCompare(right.id)),
      legacyMappings: [...this.state.legacyMappings.values()]
        .map((mapping) => structuredClone(mapping))
        .sort((left, right) => left.id.localeCompare(right.id)),
      entities: [...this.state.entities.values()].map((row) => structuredClone(row)),
      locations: [...this.state.locations.values()].map((row) => structuredClone(row)),
      claims: [...this.state.claims.values()].map((row) => structuredClone(row)),
      claimAssets: [...this.state.claimAssets.values()].map((row) => structuredClone(row)),
      provenance: this.state.provenance.map((row) => structuredClone(row)),
      promotions: this.state.promotionsByRequest.size,
    };
  }
}
