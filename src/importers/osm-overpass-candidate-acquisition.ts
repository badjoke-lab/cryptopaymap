import { and, eq, inArray } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../db/client';
import {
  candidateSourceRecords,
  sourceCandidates,
  sourceRecords,
  type NewCandidateSourceRecord,
  type NewImportBatch,
  type NewSourceCandidate,
  type NewSourceRecord,
} from '../db/schema';
import {
  CandidateIngestionPersistenceError,
  createDrizzleCandidateIngestionPersistenceBackend,
  type CandidateIngestionPersistencePlan,
  type CandidateIngestionReceipt,
  type CandidateSourceRefresh,
} from './candidate-ingestion-persistence';
import {
  reconcileCandidateAcquisition,
  type AcquisitionReconciliationPlan,
  type AcquisitionSeedSnapshot,
  type ExistingCandidateSnapshot,
} from './candidate-acquisition-reconciliation';

export interface OsmOverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface OsmOverpassCandidateAcquisitionInput {
  requestId: string;
  importBatchId: string;
  sourceId: string;
  licenseId: string | null;
  fetchedAt: Date;
  importerVersion: string;
  elements: readonly OsmOverpassElement[];
}

export interface OsmOverpassCandidateAcquisitionResult {
  plan: CandidateIngestionPersistencePlan;
  reconciliation: AcquisitionReconciliationPlan;
  rejected: Array<{
    externalId: string;
    reason: 'missing_name' | 'missing_coordinates' | 'invalid_coordinates';
  }>;
}

const MAX_ELEMENTS = 10_000;

function normalizeName(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function elementCoordinates(
  element: OsmOverpassElement,
): { latitude: number; longitude: number } | null {
  if (typeof element.lat === 'number' && typeof element.lon === 'number') {
    return { latitude: element.lat, longitude: element.lon };
  }
  if (element.center) {
    return { latitude: element.center.lat, longitude: element.center.lon };
  }
  return null;
}

function validCoordinates(coordinates: { latitude: number; longitude: number }): boolean {
  return (
    Number.isFinite(coordinates.latitude) &&
    Number.isFinite(coordinates.longitude) &&
    coordinates.latitude >= -90 &&
    coordinates.latitude <= 90 &&
    coordinates.longitude >= -180 &&
    coordinates.longitude <= 180
  );
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

async function sha256(value: unknown): Promise<string> {
  const serialized = JSON.stringify(canonicalize(value));
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(serialized),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function deterministicUuid(label: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(label));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function candidatePriority(tags: Record<string, string>): number {
  let priority = 100;
  if (tags.website || tags['contact:website']) priority += 250;
  if (Object.keys(tags).some((key) => key.startsWith('payment:'))) priority += 250;
  if (tags.phone || tags['contact:phone']) priority += 100;
  if (tags['addr:street'] || tags['addr:city']) priority += 100;
  return Math.min(priority, 1_000);
}

function rejectionSummary(
  rejected: OsmOverpassCandidateAcquisitionResult['rejected'],
): Record<string, number> {
  return rejected.reduce<Record<string, number>>((summary, item) => {
    summary[item.reason] = (summary[item.reason] ?? 0) + 1;
    return summary;
  }, {});
}

function officialDomain(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  try {
    return new URL(value).hostname.toLocaleLowerCase('en-US').replace(/^www\./, '');
  } catch {
    return null;
  }
}

function reviewSeed(rawPayload: unknown): {
  latitude: number | null;
  longitude: number | null;
  officialDomain: string | null;
} {
  if (rawPayload === null || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return { latitude: null, longitude: null, officialDomain: null };
  }
  const seed = (rawPayload as Record<string, unknown>).reviewSeed;
  if (seed === null || typeof seed !== 'object' || Array.isArray(seed)) {
    return { latitude: null, longitude: null, officialDomain: null };
  }
  const values = seed as Record<string, unknown>;
  return {
    latitude: typeof values.latitude === 'number' ? values.latitude : null,
    longitude: typeof values.longitude === 'number' ? values.longitude : null,
    officialDomain: officialDomain(values.websiteUrl),
  };
}

function acquisitionSeedSnapshots(
  plan: CandidateIngestionPersistencePlan,
): AcquisitionSeedSnapshot[] {
  const candidatesById = new Map(plan.candidates.map((candidate) => [candidate.id, candidate]));
  const sourceRecordsById = new Map(plan.sourceRecords.map((record) => [record.id, record]));

  return plan.candidateSourceRecords.map((relation) => {
    const candidate = candidatesById.get(relation.candidateId);
    const sourceRecord = sourceRecordsById.get(relation.sourceRecordId);
    if (
      candidate === undefined ||
      candidate.id == null ||
      sourceRecord === undefined ||
      sourceRecord.externalId == null ||
      sourceRecord.contentHash == null
    ) {
      throw new CandidateIngestionPersistenceError(
        'invalid_plan',
        'OSM acquisition reconciliation requires complete Candidate/source identity.',
      );
    }
    const seed = reviewSeed(sourceRecord.rawPayload);
    return {
      candidateId: candidate.id,
      sourceId: sourceRecord.sourceId,
      externalId: sourceRecord.externalId,
      contentHash: sourceRecord.contentHash,
      normalizedName: candidate.normalizedName,
      latitude: seed.latitude,
      longitude: seed.longitude,
      officialDomain: seed.officialDomain,
    };
  });
}

function changedSourceRefreshes(
  plan: CandidateIngestionPersistencePlan,
  reconciliation: AcquisitionReconciliationPlan,
): CandidateSourceRefresh[] {
  const candidatesById = new Map(plan.candidates.map((candidate) => [candidate.id, candidate]));
  const sourceRecordsById = new Map(plan.sourceRecords.map((record) => [record.id, record]));
  const relationsByCandidateId = new Map(
    plan.candidateSourceRecords.map((relation) => [relation.candidateId, relation]),
  );

  return reconciliation.changedSeeds.map(({ incoming, existing }) => {
    const candidate = candidatesById.get(incoming.candidateId);
    const relation = relationsByCandidateId.get(incoming.candidateId);
    const sourceRecord =
      relation === undefined ? undefined : sourceRecordsById.get(relation.sourceRecordId);
    if (
      candidate === undefined ||
      sourceRecord === undefined ||
      sourceRecord.externalId == null ||
      sourceRecord.contentHash == null
    ) {
      throw new CandidateIngestionPersistenceError(
        'invalid_plan',
        'Changed OSM source refresh requires complete incoming Candidate/source data.',
      );
    }

    return {
      candidateId: existing.candidateId,
      sourceId: sourceRecord.sourceId,
      externalId: sourceRecord.externalId,
      expectedContentHash: existing.contentHash,
      sourceUrl: sourceRecord.sourceUrl ?? null,
      rawPayload: sourceRecord.rawPayload,
      observedAt: sourceRecord.observedAt ?? null,
      publishedAt: sourceRecord.publishedAt ?? null,
      fetchedAt: sourceRecord.fetchedAt,
      contentHash: sourceRecord.contentHash,
      archiveUrl: sourceRecord.archiveUrl ?? null,
      licenseId: sourceRecord.licenseId ?? null,
      lastSeenAt: candidate.lastSeenAt,
    };
  });
}

function retainPersistenceWork(
  plan: CandidateIngestionPersistencePlan,
  reconciliation: AcquisitionReconciliationPlan,
): CandidateIngestionPersistencePlan {
  const newCandidateIds = new Set(reconciliation.newSeeds.map((seed) => seed.candidateId));
  const relations = plan.candidateSourceRecords.filter((relation) =>
    newCandidateIds.has(relation.candidateId),
  );
  const newSourceRecordIds = new Set(relations.map((relation) => relation.sourceRecordId));
  const candidates = plan.candidates.filter(
    (candidate) => candidate.id != null && newCandidateIds.has(candidate.id),
  );
  const sourceRecordsToPersist = plan.sourceRecords.filter(
    (record) => record.id != null && newSourceRecordIds.has(record.id),
  );
  const sourceRefreshes = changedSourceRefreshes(plan, reconciliation);

  return {
    ...plan,
    batch: {
      ...plan.batch,
      acceptedCount: candidates.length + sourceRefreshes.length,
      replayedCount: reconciliation.unchangedSeeds.length,
    },
    candidates,
    sourceRecords: sourceRecordsToPersist,
    candidateSourceRecords: relations,
    sourceRefreshes,
  };
}

export async function createOsmOverpassCandidateAcquisitionPlan(
  input: OsmOverpassCandidateAcquisitionInput,
  existing: readonly ExistingCandidateSnapshot[] = [],
): Promise<OsmOverpassCandidateAcquisitionResult> {
  if (input.elements.length === 0 || input.elements.length > MAX_ELEMENTS) {
    throw new Error(`OSM Overpass acquisition requires 1-${MAX_ELEMENTS} elements per batch.`);
  }

  const sourceRecordsToPlan: NewSourceRecord[] = [];
  const candidates: NewSourceCandidate[] = [];
  const candidateSourceRecordsToPlan: NewCandidateSourceRecord[] = [];
  const rejected: OsmOverpassCandidateAcquisitionResult['rejected'] = [];

  for (const element of input.elements) {
    const externalId = `${element.type}:${element.id}`;
    const name = element.tags?.name?.trim() ?? '';
    if (!name) {
      rejected.push({ externalId, reason: 'missing_name' });
      continue;
    }

    const coordinates = elementCoordinates(element);
    if (coordinates === null) {
      rejected.push({ externalId, reason: 'missing_coordinates' });
      continue;
    }
    if (!validCoordinates(coordinates)) {
      rejected.push({ externalId, reason: 'invalid_coordinates' });
      continue;
    }

    const tags = element.tags ?? {};
    const contentHash = await sha256(element);
    const sourceRecordId = await deterministicUuid(
      `source-record:${input.sourceId}:osm:${externalId}:${contentHash}`,
    );
    const candidateId = await deterministicUuid(`candidate:osm:${externalId}`);
    const sourceUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;

    sourceRecordsToPlan.push({
      id: sourceRecordId,
      sourceId: input.sourceId,
      externalId,
      sourceUrl,
      rawPayload: {
        sourceSystem: 'openstreetmap_overpass',
        importerVersion: input.importerVersion,
        licenseId: input.licenseId,
        element,
        reviewSeed: {
          name,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          websiteUrl: tags.website ?? tags['contact:website'] ?? null,
          phone: tags.phone ?? tags['contact:phone'] ?? null,
          paymentTags: Object.fromEntries(
            Object.entries(tags).filter(([key]) => key.startsWith('payment:')),
          ),
        },
      },
      observedAt: input.fetchedAt,
      publishedAt: null,
      fetchedAt: input.fetchedAt,
      contentHash,
      archiveUrl: null,
      licenseId: input.licenseId,
    });

    candidates.push({
      id: candidateId,
      candidateType: 'physical_place',
      normalizedName: normalizeName(name),
      candidateStatus: 'new',
      priority: candidatePriority(tags),
      duplicateGroupId: null,
      firstSeenAt: input.fetchedAt,
      lastSeenAt: input.fetchedAt,
      importBatchId: input.importBatchId,
      canonicalEntityId: null,
      canonicalLocationId: null,
    });

    candidateSourceRecordsToPlan.push({
      candidateId,
      sourceRecordId,
      relationship: 'origin',
    });
  }

  const inputChecksum = await sha256({
    sourceId: input.sourceId,
    importerVersion: input.importerVersion,
    elements: input.elements,
  });

  const batch: NewImportBatch = {
    id: input.importBatchId,
    requestId: input.requestId,
    actorId: 'osm-overpass-adapter',
    actorType: 'system',
    sourceId: input.sourceId,
    importKind: 'physical_place',
    sourceSchemaVersion: 'osm-overpass-v1',
    importerVersion: input.importerVersion,
    inputChecksum,
    inputCount: input.elements.length,
    acceptedCount: candidates.length,
    rejectedCount: rejected.length,
    replayedCount: 0,
    outOfScopeCount: 0,
    duplicateSignalCount: 0,
    automaticConfirmedCount: 0,
    rejectionSummary: rejectionSummary(rejected),
    startedAt: input.fetchedAt,
    completedAt: input.fetchedAt,
  };

  const unsafePlan: CandidateIngestionPersistencePlan = {
    batch,
    sourceRecords: sourceRecordsToPlan,
    candidates,
    candidateSourceRecords: candidateSourceRecordsToPlan,
    sourceRefreshes: [],
    duplicateGroups: [],
    duplicateSignals: [],
  };
  const reconciliation = reconcileCandidateAcquisition(
    acquisitionSeedSnapshots(unsafePlan),
    existing,
  );

  return {
    plan: retainPersistenceWork(unsafePlan, reconciliation),
    reconciliation,
    rejected,
  };
}

async function loadExistingOsmCandidates(
  database: CryptoPayMapDatabase,
  sourceId: string,
  externalIds: readonly string[],
): Promise<ExistingCandidateSnapshot[]> {
  if (externalIds.length === 0) return [];
  const rows = await database
    .select({
      candidateId: sourceCandidates.id,
      candidateStatus: sourceCandidates.candidateStatus,
      normalizedName: sourceCandidates.normalizedName,
      sourceId: sourceRecords.sourceId,
      externalId: sourceRecords.externalId,
      contentHash: sourceRecords.contentHash,
      rawPayload: sourceRecords.rawPayload,
    })
    .from(sourceRecords)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, sourceRecords.id))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(
      and(
        eq(sourceRecords.sourceId, sourceId),
        inArray(sourceRecords.externalId, [...externalIds]),
      ),
    );

  return rows.flatMap((row) => {
    if (row.externalId === null || row.contentHash === null) return [];
    const seed = reviewSeed(row.rawPayload);
    return [
      {
        candidateId: row.candidateId,
        candidateStatus: row.candidateStatus,
        sourceId: row.sourceId,
        externalId: row.externalId,
        contentHash: row.contentHash,
        normalizedName: row.normalizedName,
        latitude: seed.latitude,
        longitude: seed.longitude,
        officialDomain: seed.officialDomain,
      },
    ];
  });
}

export async function persistOsmOverpassCandidateAcquisition(
  database: CryptoPayMapDatabase,
  input: OsmOverpassCandidateAcquisitionInput,
): Promise<CandidateIngestionReceipt> {
  const externalIds = input.elements.map((element) => `${element.type}:${element.id}`);
  const existing = await loadExistingOsmCandidates(database, input.sourceId, externalIds);
  const result = await createOsmOverpassCandidateAcquisitionPlan(input, existing);
  return createDrizzleCandidateIngestionPersistenceBackend(database).commit(result.plan);
}
