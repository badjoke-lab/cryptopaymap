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
  importableOnlineCandidateTypeValues,
  legacyOnlineServiceRecordSchema,
  onlineServiceImportEnvelopeSchema,
  type ImportableOnlineCandidateType,
  type LegacyOnlineServiceRecord,
  type OnlineServiceImportEnvelope,
} from '../schemas/online-service-import';

export interface OnlineServiceReviewData {
  recordType: ImportableOnlineCandidateType;
  name: string;
  websiteUrl: string | null;
  officialDomain: string | null;
  countryCode: string | null;
  category: string | null;
  acceptanceScope: LegacyOnlineServiceRecord['acceptanceScope'];
  proposedRouteType: LegacyOnlineServiceRecord['routeType'];
  processorName: string | null;
  processorUrl: string | null;
  assetLabels: string[];
  networkLabels: string[];
  paymentMethodLabels: string[];
  scopeNotes: string | null;
  howToPay: string | null;
  evidenceUrls: string[];
  legacyVerificationLabel: string | null;
  requiresAcceptanceReview: boolean;
}

export interface OnlineServiceImportDraft {
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
  reviewData: OnlineServiceReviewData;
}

export interface OnlineServiceImportRejection {
  inputIndex: number;
  legacyId: string | null;
  reason: 'invalid_record' | 'conflicting_legacy_identity' | 'out_of_scope';
  issues: string[];
}

export interface OnlineServiceReplay {
  inputIndex: number;
  legacyId: string;
  sourceRecordId: string;
}

export interface OnlineServiceDuplicateSignal {
  leftCandidateId: string;
  rightCandidateId: string;
  reason: 'shared_official_domain' | 'same_normalized_name';
  strength: 'strong' | 'review';
}

export interface OnlineServiceImportPlan {
  importerVersion: string;
  importBatchId: string;
  inputChecksum: string;
  drafts: OnlineServiceImportDraft[];
  rejections: OnlineServiceImportRejection[];
  replays: OnlineServiceReplay[];
  duplicateSignals: OnlineServiceDuplicateSignal[];
  summary: {
    inputCount: number;
    acceptedCount: number;
    rejectedCount: number;
    outOfScopeCount: number;
    replayedCount: number;
    duplicateSignalCount: number;
    automaticConfirmedCount: 0;
  };
}

const importableTypeSet = new Set<string>(importableOnlineCandidateTypeValues);

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

function isImportableType(value: string): value is ImportableOnlineCandidateType {
  return importableTypeSet.has(value);
}

function officialDomain(url: string | null): string | null {
  if (url === null) return null;
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
}

function uniqueLabels(labels: readonly string[]): string[] {
  const values = new Map<string, string>();
  for (const label of labels) {
    const normalized = label.trim();
    const key = normalized.toLocaleLowerCase('en-US');
    if (!values.has(key)) values.set(key, normalized);
  }
  return [...values.values()].sort((left, right) => left.localeCompare(right));
}

function sourceUrl(record: LegacyOnlineServiceRecord): string | null {
  return record.sourceUrl ?? record.websiteUrl ?? record.evidenceUrls[0] ?? null;
}

function candidatePriority(record: LegacyOnlineServiceRecord): number {
  let priority = 100;
  if (record.websiteUrl !== null) priority += 250;
  if (record.evidenceUrls.length > 0) priority += 200;
  if (record.observedAt !== null) priority += 100;
  if (record.routeType !== null) priority += 100;
  if (record.assetLabels.length > 0) priority += 100;
  if (record.networkLabels.length > 0) priority += 100;
  if (record.howToPay !== null) priority += 50;
  return Math.min(priority, 1_000);
}

function requiresAcceptanceReview(record: LegacyOnlineServiceRecord): boolean {
  if (!['online_service', 'platform'].includes(record.recordType)) return false;
  return (
    record.acceptanceScope !== null ||
    record.routeType !== null ||
    record.assetLabels.length > 0 ||
    record.networkLabels.length > 0 ||
    record.paymentMethodLabels.length > 0 ||
    record.howToPay !== null ||
    record.evidenceUrls.length > 0
  );
}

async function createDraft(
  envelope: OnlineServiceImportEnvelope,
  rawRecord: unknown,
  record: LegacyOnlineServiceRecord & { recordType: ImportableOnlineCandidateType },
  contentHash: string,
): Promise<OnlineServiceImportDraft> {
  const candidateId = await deterministicUuid(
    `candidate:crypto_acceptance_registry:${record.legacyId}`,
  );
  const externalId = `online:${contentHash}`;
  const sourceRecordId = await deterministicUuid(
    `source-record:${envelope.sourceId}:${externalId}`,
  );
  const legacyMappingId = await deterministicUuid(
    `legacy-place-id:crypto_acceptance_registry:${record.legacyId}`,
  );
  const observedAt = record.observedAt ?? envelope.fetchedAt;

  const sourceRecord = sourceRecordInputSchema.parse({
    sourceId: envelope.sourceId,
    externalId,
    sourceUrl: sourceUrl(record),
    rawPayload: {
      sourceSystem: 'crypto_acceptance_registry',
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
    candidateType: record.recordType,
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
  }) as OnlineServiceImportDraft['candidateSourceRecord'];

  const legacyMapping = legacyPlaceIdInputSchema.parse({
    sourceSystem: 'crypto_acceptance_registry',
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

  return {
    candidateId,
    sourceRecordId,
    legacyMappingId,
    sourceRecord,
    candidate,
    candidateSourceRecord,
    legacyMapping,
    reviewData: {
      recordType: record.recordType,
      name: record.name,
      websiteUrl: record.websiteUrl,
      officialDomain: officialDomain(record.websiteUrl),
      countryCode: record.countryCode,
      category: record.category,
      acceptanceScope: record.acceptanceScope,
      proposedRouteType: record.routeType,
      processorName: record.processorName,
      processorUrl: record.processorUrl,
      assetLabels: uniqueLabels(record.assetLabels),
      networkLabels: uniqueLabels(record.networkLabels),
      paymentMethodLabels: uniqueLabels(record.paymentMethodLabels),
      scopeNotes: record.scopeNotes,
      howToPay: record.howToPay,
      evidenceUrls: [...record.evidenceUrls],
      legacyVerificationLabel: record.legacyVerificationLabel,
      requiresAcceptanceReview: requiresAcceptanceReview(record),
    },
  };
}

function signalKey(signal: OnlineServiceDuplicateSignal): string {
  return [signal.leftCandidateId, signal.rightCandidateId, signal.reason].join(':');
}

function duplicateSignals(drafts: OnlineServiceImportDraft[]): OnlineServiceDuplicateSignal[] {
  const signals = new Map<string, OnlineServiceDuplicateSignal>();
  const domainOwners = new Map<string, string>();
  const nameOwners = new Map<string, string>();

  const addSignal = (
    leftCandidateId: string,
    rightCandidateId: string,
    reason: OnlineServiceDuplicateSignal['reason'],
    strength: OnlineServiceDuplicateSignal['strength'],
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
    const domain = draft.reviewData.officialDomain;
    if (domain !== null) {
      const owner = domainOwners.get(domain);
      if (owner !== undefined)
        addSignal(owner, draft.candidateId, 'shared_official_domain', 'strong');
      else domainOwners.set(domain, draft.candidateId);
    }

    const nameKey = `${draft.candidate.candidateType}:${draft.candidate.normalizedName}`;
    const owner = nameOwners.get(nameKey);
    if (owner !== undefined) {
      addSignal(owner, draft.candidateId, 'same_normalized_name', 'review');
    } else {
      nameOwners.set(nameKey, draft.candidateId);
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

export async function createOnlineServiceImportPlan(
  input: unknown,
): Promise<OnlineServiceImportPlan> {
  const envelope = onlineServiceImportEnvelopeSchema.parse(input);
  const drafts: OnlineServiceImportDraft[] = [];
  const rejections: OnlineServiceImportRejection[] = [];
  const replays: OnlineServiceReplay[] = [];
  const seenLegacyIds = new Map<
    string,
    { contentHash: string; sourceRecordId: string | null; outOfScope: boolean }
  >();
  const checksumRecords: unknown[] = [];

  for (const [inputIndex, unknownRecord] of envelope.records.entries()) {
    const result = legacyOnlineServiceRecordSchema.safeParse(unknownRecord);
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
      if (existing.contentHash !== contentHash) {
        rejections.push({
          inputIndex,
          legacyId: record.legacyId,
          reason: 'conflicting_legacy_identity',
          issues: ['$.legacyId: the same legacy ID has conflicting content in this batch'],
        });
      } else if (existing.sourceRecordId !== null) {
        replays.push({
          inputIndex,
          legacyId: record.legacyId,
          sourceRecordId: existing.sourceRecordId,
        });
      } else {
        rejections.push({
          inputIndex,
          legacyId: record.legacyId,
          reason: 'out_of_scope',
          issues: [`$.recordType: ${record.recordType} is outside the main acceptance directory`],
        });
      }
      checksumRecords.push({ inputIndex, rawRecord: unknownRecord, replayOrConflict: true });
      continue;
    }

    if (!isImportableType(record.recordType)) {
      seenLegacyIds.set(record.legacyId, { contentHash, sourceRecordId: null, outOfScope: true });
      rejections.push({
        inputIndex,
        legacyId: record.legacyId,
        reason: 'out_of_scope',
        issues: [`$.recordType: ${record.recordType} is outside the main acceptance directory`],
      });
      checksumRecords.push({ inputIndex, rawRecord: unknownRecord, outOfScope: true });
      continue;
    }

    const importableRecord = {
      ...record,
      recordType: record.recordType,
    } as LegacyOnlineServiceRecord & {
      recordType: ImportableOnlineCandidateType;
    };
    const draft = await createDraft(envelope, unknownRecord, importableRecord, contentHash);
    seenLegacyIds.set(record.legacyId, {
      contentHash,
      sourceRecordId: draft.sourceRecordId,
      outOfScope: false,
    });
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
  const outOfScopeCount = rejections.filter(
    (rejection) => rejection.reason === 'out_of_scope',
  ).length;

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
      outOfScopeCount,
      replayedCount: replays.length,
      duplicateSignalCount: detectedDuplicateSignals.length,
      automaticConfirmedCount: 0,
    },
  };
}
