import { z } from 'zod';
import type { CandidateDetailSource, CandidateSourceSnapshot } from './detail';
import { legacyOnlineServiceRecordSchema } from '../../schemas/online-service-import';
import { legacyPhysicalPlaceRecordSchema } from '../../schemas/physical-place-import';

const importerPayloadSchema = z
  .object({
    normalizedRecord: z.unknown(),
  })
  .passthrough();

const onlineCandidateTypes = new Set([
  'online_service',
  'payment_processor',
  'payment_program',
  'platform',
]);

function boundedPaymentTags(paymentTags: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(paymentTags).sort(([left], [right]) => left.localeCompare(right)).slice(0, 100));
}

export function projectCandidateSourceSnapshot(
  candidateType: CandidateDetailSource['snapshot'] extends infer _Snapshot
    ? 'physical_place' | 'online_service' | 'payment_processor' | 'payment_program' | 'platform'
    : never,
  rawPayload: unknown,
): CandidateSourceSnapshot | null {
  const payloadResult = importerPayloadSchema.safeParse(rawPayload);
  if (!payloadResult.success) return null;

  if (candidateType === 'physical_place') {
    const recordResult = legacyPhysicalPlaceRecordSchema.safeParse(
      payloadResult.data.normalizedRecord,
    );
    if (!recordResult.success) return null;
    const record = recordResult.data;
    return {
      kind: 'physical_place',
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
      paymentTags: boundedPaymentTags(record.paymentTags),
      legacyVerificationLabel: record.legacyVerificationLabel,
    };
  }

  if (!onlineCandidateTypes.has(candidateType)) return null;
  const recordResult = legacyOnlineServiceRecordSchema.safeParse(
    payloadResult.data.normalizedRecord,
  );
  if (!recordResult.success || recordResult.data.recordType !== candidateType) return null;
  const record = recordResult.data;
  if (!onlineCandidateTypes.has(record.recordType)) return null;

  return {
    kind: 'online_service',
    recordType: record.recordType,
    name: record.name,
    websiteUrl: record.websiteUrl,
    countryCode: record.countryCode,
    category: record.category,
    acceptanceScope: record.acceptanceScope,
    routeType: record.routeType,
    processorName: record.processorName,
    processorUrl: record.processorUrl,
    assetLabels: record.assetLabels,
    networkLabels: record.networkLabels,
    paymentMethodLabels: record.paymentMethodLabels,
    scopeNotes: record.scopeNotes,
    howToPay: record.howToPay,
    evidenceUrls: record.evidenceUrls,
    legacyVerificationLabel: record.legacyVerificationLabel,
  };
}
