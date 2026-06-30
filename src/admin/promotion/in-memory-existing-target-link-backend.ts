import { CandidatePromotionError, type CandidatePromotionReceipt } from './candidate-promotion';
import type {
  CandidateExistingTargetLinkBackend,
  CandidateExistingTargetLinkCommand,
} from './existing-target-link';

export interface ExistingTargetCandidateSeed {
  id: string;
  candidateType: 'physical_place' | 'online_service';
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

export interface ExistingTargetEntitySeed {
  id: string;
  entityType: 'merchant' | 'online_service' | 'payment_processor' | 'payment_program' | 'platform';
  slug: string | null;
  entityStatus: 'active' | 'inactive' | 'ended' | 'unknown';
  visibility: 'public' | 'hidden' | 'temporarily_hidden';
  updatedAt: string;
  deletedAt: string | null;
}

export interface ExistingTargetLocationSeed {
  id: string;
  entityId: string;
  slug: string;
  locationStatus: 'active' | 'temporarily_closed' | 'closed' | 'unknown';
  visibility: 'public' | 'hidden' | 'temporarily_hidden';
  updatedAt: string;
  deletedAt: string | null;
}

export interface ExistingTargetClaimSeed {
  id: string;
  entityId: string;
  locationId: string | null;
  deletedAt: string | null;
}

export interface ExistingTargetLegacyMappingSeed {
  id: string;
  sourceSystem: 'cryptopaymap_v2' | 'crypto_acceptance_registry';
  sourceRecordId: string;
  migrationStatus: 'pending' | 'mapped' | 'unresolved' | 'retired';
  canonicalPath: string | null;
  entityId: string | null;
  locationId: string | null;
  resolvedAt: string | null;
}

interface StoredLink {
  fingerprint: string;
  receipt: CandidatePromotionReceipt;
}

interface ExistingTargetLinkState {
  candidates: Map<string, ExistingTargetCandidateSeed>;
  entities: Map<string, ExistingTargetEntitySeed>;
  locations: Map<string, ExistingTargetLocationSeed>;
  existingClaims: Map<string, ExistingTargetClaimSeed>;
  createdClaims: Map<string, CandidateExistingTargetLinkCommand['claim']>;
  claimAssets: Map<string, CandidateExistingTargetLinkCommand['claimAssets'][number]>;
  legacyMappings: Map<string, ExistingTargetLegacyMappingSeed>;
  provenance: Array<{
    subjectType: 'entity' | 'location' | 'acceptance_claim' | 'claim_asset';
    subjectId: string;
    sourceRecordId: string;
    provenanceRole: 'origin' | 'attribution';
  }>;
  linksByRequest: Map<string, StoredLink>;
}

export interface InMemoryExistingTargetLinkBackendOptions {
  candidates?: ExistingTargetCandidateSeed[];
  entities?: ExistingTargetEntitySeed[];
  locations?: ExistingTargetLocationSeed[];
  claims?: ExistingTargetClaimSeed[];
  legacyMappings?: ExistingTargetLegacyMappingSeed[];
  assetIds?: string[];
  networkIds?: string[];
  paymentMethodIds?: string[];
  processorEntityIds?: string[];
  failBeforeCommit?: (command: CandidateExistingTargetLinkCommand) => boolean;
}

function cloneState(state: ExistingTargetLinkState): ExistingTargetLinkState {
  return {
    candidates: new Map([...state.candidates].map(([id, row]) => [id, structuredClone(row)])),
    entities: new Map([...state.entities].map(([id, row]) => [id, structuredClone(row)])),
    locations: new Map([...state.locations].map(([id, row]) => [id, structuredClone(row)])),
    existingClaims: new Map(
      [...state.existingClaims].map(([id, row]) => [id, structuredClone(row)]),
    ),
    createdClaims: new Map([...state.createdClaims].map(([id, row]) => [id, structuredClone(row)])),
    claimAssets: new Map([...state.claimAssets].map(([id, row]) => [id, structuredClone(row)])),
    legacyMappings: new Map(
      [...state.legacyMappings].map(([id, row]) => [id, structuredClone(row)]),
    ),
    provenance: state.provenance.map((row) => structuredClone(row)),
    linksByRequest: new Map(
      [...state.linksByRequest].map(([id, row]) => [id, structuredClone(row)]),
    ),
  };
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function conflict(message: string): never {
  throw new CandidatePromotionError('conflict', message);
}

export class InMemoryExistingTargetLinkBackend implements CandidateExistingTargetLinkBackend {
  private state: ExistingTargetLinkState;
  private readonly assetIds: Set<string>;
  private readonly networkIds: Set<string>;
  private readonly paymentMethodIds: Set<string>;
  private readonly processorEntityIds: Set<string>;
  private readonly options: InMemoryExistingTargetLinkBackendOptions;

  constructor(options: InMemoryExistingTargetLinkBackendOptions = {}) {
    this.options = options;
    this.assetIds = new Set(options.assetIds ?? []);
    this.networkIds = new Set(options.networkIds ?? []);
    this.paymentMethodIds = new Set(options.paymentMethodIds ?? []);
    this.processorEntityIds = new Set(options.processorEntityIds ?? []);
    this.state = {
      candidates: new Map((options.candidates ?? []).map((row) => [row.id, structuredClone(row)])),
      entities: new Map((options.entities ?? []).map((row) => [row.id, structuredClone(row)])),
      locations: new Map((options.locations ?? []).map((row) => [row.id, structuredClone(row)])),
      existingClaims: new Map((options.claims ?? []).map((row) => [row.id, structuredClone(row)])),
      createdClaims: new Map(),
      claimAssets: new Map(),
      legacyMappings: new Map(
        (options.legacyMappings ?? []).map((row) => [row.id, structuredClone(row)]),
      ),
      provenance: [],
      linksByRequest: new Map(),
    };
  }

  async commitExistingTargetLink(
    command: CandidateExistingTargetLinkCommand,
  ): Promise<CandidatePromotionReceipt> {
    const existing = this.state.linksByRequest.get(command.requestId);
    if (existing !== undefined) {
      if (existing.fingerprint !== command.requestFingerprint) {
        conflict('The existing-target request ID was reused with different content.');
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
      conflict('The source Candidate changed before existing-target linking.');
    }
    if (!['new', 'triaged'].includes(candidate.candidateStatus)) {
      conflict('Only new or triaged Candidates can be linked to canonical targets.');
    }
    if (candidate.canonicalEntityId !== null || candidate.canonicalLocationId !== null) {
      conflict('The source Candidate already references a canonical target.');
    }
    if (
      JSON.stringify(sorted(candidate.sourceRecordIds)) !== JSON.stringify(command.sourceRecordIds)
    ) {
      conflict('The Candidate source provenance changed before existing-target linking.');
    }

    const entity = next.entities.get(command.target.entityId);
    if (entity === undefined) {
      throw new CandidatePromotionError('not_found', 'The canonical Entity target was not found.');
    }
    if (
      entity.updatedAt !== command.target.expectedEntityUpdatedAt.toISOString() ||
      entity.deletedAt !== null ||
      !['active', 'unknown'].includes(entity.entityStatus)
    ) {
      conflict('The canonical Entity target changed or is no longer linkable.');
    }

    let location: ExistingTargetLocationSeed | null = null;
    if (command.expectedCandidateType === 'physical_place') {
      if (entity.entityType !== 'merchant') {
        conflict('Physical Candidates require an existing merchant Entity target.');
      }
      if (command.target.locationId === null || command.target.expectedLocationUpdatedAt === null) {
        conflict('Physical Candidates require an existing Location target.');
      }
      location = next.locations.get(command.target.locationId) ?? null;
      if (location === null) {
        throw new CandidatePromotionError(
          'not_found',
          'The canonical Location target was not found.',
        );
      }
      if (
        location.entityId !== entity.id ||
        location.updatedAt !== command.target.expectedLocationUpdatedAt.toISOString() ||
        location.deletedAt !== null ||
        !['active', 'temporarily_closed', 'unknown'].includes(location.locationStatus)
      ) {
        conflict('The canonical Location target changed or is no longer linkable.');
      }
      if (command.target.expectedCanonicalPath !== `/place/${location.slug}`) {
        conflict('The canonical Location path changed before linking.');
      }
    } else {
      if (entity.entityType !== 'online_service' || entity.slug === null) {
        conflict('Online Candidates require an existing online-service Entity target.');
      }
      if (command.target.locationId !== null || command.target.expectedLocationUpdatedAt !== null) {
        conflict('Online Candidates cannot link to a physical Location.');
      }
      if (command.target.expectedCanonicalPath !== `/service/${entity.slug}`) {
        conflict('The canonical service path changed before linking.');
      }
    }

    const currentClaimIds = sorted(
      [...next.existingClaims.values()]
        .filter(
          (claim) =>
            claim.deletedAt === null &&
            claim.entityId === entity.id &&
            claim.locationId === (location?.id ?? null),
        )
        .map((claim) => claim.id),
    );
    if (JSON.stringify(currentClaimIds) !== JSON.stringify(command.target.expectedClaimIds)) {
      conflict('The canonical target Claim set changed before linking.');
    }

    if (next.existingClaims.has(command.claim.id) || next.createdClaims.has(command.claim.id)) {
      conflict('The new Acceptance Claim ID already exists.');
    }
    if (command.claimAssets.some((row) => next.claimAssets.has(row.id))) {
      conflict('A new Claim Asset ID already exists.');
    }
    if (
      command.claim.value.processorId !== null &&
      !this.processorEntityIds.has(command.claim.value.processorId)
    ) {
      conflict('The selected processor Entity does not exist.');
    }
    for (const row of command.claimAssets) {
      if (!this.assetIds.has(row.value.assetId)) conflict('A selected Asset does not exist.');
      if (!this.networkIds.has(row.value.networkId)) conflict('A selected Network does not exist.');
      if (!this.paymentMethodIds.has(row.value.paymentMethodId)) {
        conflict('A selected Payment Method does not exist.');
      }
    }

    next.createdClaims.set(command.claim.id, structuredClone(command.claim));
    for (const row of command.claimAssets) {
      next.claimAssets.set(row.id, structuredClone(row));
    }

    const attributedSubjects: Array<{
      subjectType: 'entity' | 'location';
      subjectId: string;
    }> = [{ subjectType: 'entity', subjectId: entity.id }];
    if (location !== null) {
      attributedSubjects.push({ subjectType: 'location', subjectId: location.id });
    }
    const originSubjects: Array<{
      subjectType: 'acceptance_claim' | 'claim_asset';
      subjectId: string;
    }> = [
      { subjectType: 'acceptance_claim', subjectId: command.claim.id },
      ...command.claimAssets.map((row) => ({
        subjectType: 'claim_asset' as const,
        subjectId: row.id,
      })),
    ];
    for (const sourceRecordId of command.sourceRecordIds) {
      for (const subject of attributedSubjects) {
        next.provenance.push({
          ...subject,
          sourceRecordId,
          provenanceRole: 'attribution',
        });
      }
      for (const subject of originSubjects) {
        next.provenance.push({ ...subject, sourceRecordId, provenanceRole: 'origin' });
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
      mapping.canonicalPath = command.target.expectedCanonicalPath;
      mapping.entityId = mapping.sourceSystem === 'crypto_acceptance_registry' ? entity.id : null;
      mapping.locationId =
        mapping.sourceSystem === 'cryptopaymap_v2' ? (location?.id ?? null) : null;
      mapping.resolvedAt = command.linkedAt.toISOString();
      next.legacyMappings.set(mapping.id, mapping);
    }

    candidate.candidateStatus = 'promoted';
    candidate.canonicalEntityId = entity.id;
    candidate.canonicalLocationId = location?.id ?? null;
    candidate.updatedAt = command.linkedAt.toISOString();
    next.candidates.set(candidate.id, candidate);

    const receipt: CandidatePromotionReceipt = {
      requestId: command.requestId,
      candidateId: command.candidateId,
      entityId: entity.id,
      locationId: location?.id ?? null,
      claimId: command.claim.id,
      claimAssetIds: command.claimAssets.map((row) => row.id),
      canonicalPath: command.target.expectedCanonicalPath,
      claimStatus: 'candidate',
      visibility: 'hidden',
      promotedAt: command.linkedAt.toISOString(),
      state: 'committed',
    };
    next.linksByRequest.set(command.requestId, {
      fingerprint: command.requestFingerprint,
      receipt,
    });

    if (this.options.failBeforeCommit?.(command) === true) {
      throw new Error('Injected existing-target link failure before atomic commit.');
    }

    this.state = next;
    return structuredClone(receipt);
  }

  snapshot() {
    return {
      candidates: [...this.state.candidates.values()].map((row) => structuredClone(row)),
      entities: [...this.state.entities.values()].map((row) => structuredClone(row)),
      locations: [...this.state.locations.values()].map((row) => structuredClone(row)),
      existingClaims: [...this.state.existingClaims.values()].map((row) => structuredClone(row)),
      createdClaims: [...this.state.createdClaims.values()].map((row) => structuredClone(row)),
      claimAssets: [...this.state.claimAssets.values()].map((row) => structuredClone(row)),
      legacyMappings: [...this.state.legacyMappings.values()].map((row) => structuredClone(row)),
      provenance: this.state.provenance.map((row) => structuredClone(row)),
      links: this.state.linksByRequest.size,
    };
  }
}
