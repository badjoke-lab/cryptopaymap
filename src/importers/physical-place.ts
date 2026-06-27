import {
  candidateSourceRecordInputSchema,
  normalizeCandidateName,
  sourceCandidateInputSchema,
  sourceRecordInputSchema,
  type SourceCandidateInput,
  type SourceRecordInput,
} from '../schemas/source-provenance';
import { legacyPlaceIdInputSchema, type LegacyPlaceIdInput } from '../schemas/media-legacy';
import {
  legacyPhysicalPlaceRecordSchema,
  physicalPlaceImportEnvelopeSchema,
  type LegacyPhysicalPlaceRecord,
  type PhysicalPlaceImportEnvelope,
} from '../schemas/physical-place-import';

export interface PhysicalPlaceReviewData {
  name: string;
  addressLine: string | null;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string;
  latitude: number;
  longitude: number;
  category: string | null;
  websiteUrl: string | null;
  osmType: 'node' | 'way' | 'relation' | null;
  osmId: string | null;
  paymentTags: Record<string, string>;
  affirmativePaymentSignals: string[];
  legacyVerificationLabel: string | null;
  requiresAcceptanceReview: boolean;
}

export interface PhysicalPlaceImportDraft {
  candidateId: string;
  sourceRecordId: string;
  legacyMappingId: string;
  sourceRecord: SourceRecordInput;
  candidate: SourceCandidateInput;
  candidateSourceRecord: {
    candidateId: string;
    sourceRecordId: string;
    relationship: 'origin';
  };
  legacyMapping: LegacyPlaceIdInput;
  reviewData: PhysicalPlaceReviewData;
}

export interface PhysicalPlaceImportRejection {
  inputIndex: number;
  legacyId: string | null;
  reason: 'invalid_record' | 'conflicting_legacy_identity';
  issues: string[];
}

export interface PhysicalPlaceReplay {
  inputIndex: number;
  legacyId: string;
  sourceRecordId: string;
}

export interface PhysicalPlaceDuplicateSignal {
  leftCandidateId: string;
  rightCandidateId: string;
  reason: 'shared_osm_identity' | 'same_name_and_coordinates';
  strength: 'strong' | 'review';
}

export interface PhysicalPlaceImportPlan {
  importerVersion: string;
  importBatchId: string;
  inputChecksum: string;
  drafts: PhysicalPlaceImportDraft[];
  rejections: PhysicalPlaceImportRejection[];
  replays: PhysicalPlaceReplay[];
  duplicateSignals: PhysicalPlaceDuplicateSignal[];
  summary: {
    inputCount: number;
    acceptedCount: number;
    rejectedCount: number;
    replayedCount: number;
    duplicateSignalCount: number;
    automaticConfirmedCount: 0;
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

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

function affirmativePaymentSignals(paymentTags: Record<string, string>): string[] {
  const affirmativeValues = new Set(['1', 'accepted', 'on', 'true', 'yes']);
  return Object.entries(paymentTags)
    .filter(([, value]) => affirmativeValues.has(value.trim().toLowerCase()))
    .map(([key]) => key)
    .sort();
}

function candidatePriority(record: LegacyPhysicalPlaceRecord): number {
  let priority = 100;
  if (record.websiteUrl !== null) priority += 200;
  if (record.osmType !== null) priority += 250;
  if (affirmativePaymentSignals(record.paymentTags).length > 0) priority += 250;
  if (record.observedAt !== null) priority += 100;
  if (record.sourceUrl !== null) priority += 100;
  return Math.min(priority, 1_000);
}

function sourceUrl(record: LegacyPhysicalPlaceRecord): string | null {
  if (record.sourceUrl !== null) return record.sourceUrl;
  if (record.osmType !== null && record.osmId !== null) {
    return `https://www.openstreetmap.org/${record.osmType}/${record.osmId}`;
  }
  return null;
}

async function createDraft(
  envelope: PhysicalPlaceImportEnvelope,
  rawRecord: unknown,
  record: LegacyPhysicalPlaceRecord,
  contentHash: string,
): Promise<PhysicalPlaceImportDraft> {
  const candidateId = await deterministicUuid(`candidate:cryptopaymap_v2:${record.legacyId}`);
  const externalId = `physical:${contentHash}`;
  const sourceRecordId = await deterministicUuid(
    `source-record:${envelope.sourceId}:${externalId}`,
  );
  const legacyMappingId = await deterministicUuid(
    `legacy-place-id:cryptopaymap_v2:${record.legacyId}`,
  );
  const observedAt = record.observedAt ?? envelope.fetchedAt;

  const sourceRecord = sourceRecordInputSchema.parse({
    sourceId: envelope.sourceId,
    externalId,
    sourceUrl: sourceUrl(record),
    rawPayload: {
      sourceSystem: 'cryptopaymap_v2',
      importerVersion: envelope.importerVersion,
      rawRecord,
      normalizedRecord: record,
    },
    observedAt,
    publishedAt: null,
    fetchedAt: envelope.fetchedAt,
    contentHash,
    archiveUrl: null,
    licenseId: envelope.licenseId,
  });

  const candidate = sourceCandidateInputSchema.parse({
    candidateType: 'physical_place',
    normalizedName: normalizeCandidateName(record.name),
    candidateStatus: 'new',
    priority: candidatePriority(record),
    duplicateGroupId: null,
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
    importBatchId: envelope.importBatchId,
    canonicalEntityId: null,
    canonicalLocationId: null,
  });

  const candidateSourceRecord = candidateSourceRecordInputSchema.parse({
    candidateId,
    sourceRecordId,
    relationship: 'origin',
  }) as PhysicalPlaceImportDraft['candidateSourceRecord'];

  const legacyMapping = legacyPlaceIdInputSchema.parse({
    sourceSystem: 'cryptopaymap_v2',
    legacyId: record.legacyId,
    legacyPath: record.legacyPath,
    migrationStatus: 'pending',
    canonicalPath: null,
    entityId: null,
    locationId: null,
    sourceRecordId,
    resolutionNote: null,
    resolvedAt: null,
  });

  const paymentSignals = affirmativePaymentSignals(record.paymentTags);

  return {
    candidateId,
    sourceRecordId,
    legacyMappingId,
    sourceRecord,
    candidate,
    candidateSourceRecord,
    legacyMapping,
    reviewData: {
      name: record.name,
      addressLine: record.addressLine,
      locality: record.locality,
      region: record.region,
      postalCode: record.postalCode,
      countryCode: record.countryCode,
      latitude: record.latitude,
      longitude: record.longitude,
      category: record.category,
      websiteUrl: record.websiteUrl,
      osmType: record.osmType,
      osmId: record.osmId,
      paymentTags: record.paymentTags,
      affirmativePaymentSignals: paymentSignals,
      legacyVerificationLabel: record.legacyVerificationLabel,
      requiresAcceptanceReview: paymentSignals.length > 0,
    },
  };
}

function signalKey(signal: PhysicalPlaceDuplicateSignal): string {
  return [signal.leftCandidateId, signal.rightCandidateId, signal.reason].join(':');
}

function duplicateSignals(drafts: PhysicalPlaceImportDraft[]): PhysicalPlaceDuplicateSignal[] {
  const signals = new Map<string, PhysicalPlaceDuplicateSignal>();
  const osmOwners = new Map<string, string>();
  const locationOwners = new Map<string, string>();

  const addSignal = (
    leftCandidateId: string,
    rightCandidateId: string,
    reason: PhysicalPlaceDuplicateSignal['reason'],
    strength: PhysicalPlaceDuplicateSignal['strength'],
  ) => {
    if (leftCandidateId === rightCandidateId) return;
    const [left, right] = [leftCandidateId, rightCandidateId].sort();
    const signal = {
      leftCandidateId: left ?? leftCandidateId,
      rightCandidateId: right ?? rightCandidateId,
      reason,
      strength,
    };
    signals.set(signalKey(signal), signal);
  };

  for (const draft of drafts) {
    const { reviewData, candidateId } = draft;
    if (reviewData.osmType !== null && reviewData.osmId !== null) {
      const osmKey = `${reviewData.osmType}:${reviewData.osmId}`;
      const owner = osmOwners.get(osmKey);
      if (owner !== undefined) addSignal(owner, candidateId, 'shared_osm_identity', 'strong');
      else osmOwners.set(osmKey, candidateId);
    }

    const locationKey = [
      draft.candidate.normalizedName,
      reviewData.latitude.toFixed(6),
      reviewData.longitude.toFixed(6),
    ].join(':');
    const owner = locationOwners.get(locationKey);
    if (owner !== undefined) {
      addSignal(owner, candidateId, 'same_name_and_coordinates', 'review');
    } else {
      locationOwners.set(locationKey, candidateId);
    }
  }

  return [...signals.values()].sort((left, right) =>
    signalKey(left).localeCompare(signalKey(right)),
  );
}

function issueStrings(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length === 0 ? '$' : `$.${issue.path.map(String).join('.')}`;
    return `${path}: ${issue.message}`;
  });
}

function possibleLegacyId(value: unknown): string | null {
  if (value === null || typeof value !== 'object') return null;
  const legacyId = (value as Record<string, unknown>).legacyId;
  return typeof legacyId === 'string' && legacyId.trim().length > 0 ? legacyId.trim() : null;
}

export async function createPhysicalPlaceImportPlan(
  input: unknown,
): Promise<PhysicalPlaceImportPlan> {
  const envelope = physicalPlaceImportEnvelopeSchema.parse(input);
  const drafts: PhysicalPlaceImportDraft[] = [];
  const rejections: PhysicalPlaceImportRejection[] = [];
  const replays: PhysicalPlaceReplay[] = [];
  const seenLegacyIds = new Map<string, { contentHash: string; sourceRecordId: string }>();
  const checksumRecords: unknown[] = [];

  for (const [inputIndex, unknownRecord] of envelope.records.entries()) {
    const result = legacyPhysicalPlaceRecordSchema.safeParse(unknownRecord);
    if (!result.success) {
      const issues = issueStrings(result.error);
      rejections.push({
        inputIndex,
        legacyId: possibleLegacyId(unknownRecord),
        reason: 'invalid_record',
        issues,
      });
      checksumRecords.push({ inputIndex, rawRecord: unknownRecord, rejected: issues });
      continue;
    }

    const record = result.data;
    const contentHash = await sha256(unknownRecord);
    const existing = seenLegacyIds.get(record.legacyId);
    if (existing !== undefined) {
      if (existing.contentHash === contentHash) {
        replays.push({
          inputIndex,
          legacyId: record.legacyId,
          sourceRecordId: existing.sourceRecordId,
        });
      } else {
        rejections.push({
          inputIndex,
          legacyId: record.legacyId,
          reason: 'conflicting_legacy_identity',
          issues: ['$.legacyId: the same legacy ID has conflicting content in this batch'],
        });
      }
      checksumRecords.push({ inputIndex, rawRecord: unknownRecord, replayOrConflict: true });
      continue;
    }

    const draft = await createDraft(envelope, unknownRecord, record, contentHash);
    seenLegacyIds.set(record.legacyId, { contentHash, sourceRecordId: draft.sourceRecordId });
    drafts.push(draft);
    checksumRecords.push({ inputIndex, rawRecord: unknownRecord });
  }

  const detectedDuplicateSignals = duplicateSignals(drafts);
  const inputChecksum = await sha256({
    sourceId: envelope.sourceId,
    licenseId: envelope.licenseId,
    importerVersion: envelope.importerVersion,
    records: checksumRecords,
  });

  return {
    importerVersion: envelope.importerVersion,
    importBatchId: envelope.importBatchId,
    inputChecksum,
    drafts,
    rejections,
    replays,
    duplicateSignals: detectedDuplicateSignals,
    summary: {
      inputCount: envelope.records.length,
      acceptedCount: drafts.length,
      rejectedCount: rejections.length,
      replayedCount: replays.length,
      duplicateSignalCount: detectedDuplicateSignals.length,
      automaticConfirmedCount: 0,
    },
  };
}
