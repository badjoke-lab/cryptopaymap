import type {
  NewCandidateSourceRecord,
  NewImportBatch,
  NewSourceCandidate,
  NewSourceRecord,
} from '../db/schema';
import type { CryptoPayMapDatabase } from '../db/client';
import {
  createDrizzleCandidateIngestionPersistenceBackend,
  type CandidateIngestionPersistencePlan,
  type CandidateIngestionReceipt,
} from './candidate-ingestion-persistence';

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

export async function createOsmOverpassCandidateAcquisitionPlan(
  input: OsmOverpassCandidateAcquisitionInput,
): Promise<OsmOverpassCandidateAcquisitionResult> {
  if (input.elements.length === 0 || input.elements.length > MAX_ELEMENTS) {
    throw new Error(`OSM Overpass acquisition requires 1-${MAX_ELEMENTS} elements per batch.`);
  }

  const sourceRecords: NewSourceRecord[] = [];
  const candidates: NewSourceCandidate[] = [];
  const candidateSourceRecords: NewCandidateSourceRecord[] = [];
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

    sourceRecords.push({
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

    candidateSourceRecords.push({
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

  return {
    plan: {
      batch,
      sourceRecords,
      candidates,
      candidateSourceRecords,
      duplicateGroups: [],
      duplicateSignals: [],
    },
    rejected,
  };
}

export async function persistOsmOverpassCandidateAcquisition(
  database: CryptoPayMapDatabase,
  input: OsmOverpassCandidateAcquisitionInput,
): Promise<CandidateIngestionReceipt> {
  const { plan } = await createOsmOverpassCandidateAcquisitionPlan(input);
  return createDrizzleCandidateIngestionPersistenceBackend(database).commit(plan);
}
