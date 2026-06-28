import { z } from 'zod';
import type { CandidateDetailData, CandidateSourceSnapshot } from './detail';
import {
  importableOnlineCandidateTypeValues,
  legacyOnlineServiceRecordSchema,
} from '../../schemas/online-service-import';
import { legacyPhysicalPlaceRecordSchema } from '../../schemas/physical-place-import';

const importerPayloadSchema = z
  .object({
    normalizedRecord: z.unknown(),
  })
  .passthrough();
const importableOnlineCandidateTypeSchema = z.enum(importableOnlineCandidateTypeValues);

function boundedPaymentTags(paymentTags: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(paymentTags)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, 100),
  );
}

export function projectCandidateSourceSnapshot(
  candidateType: CandidateDetailData['candidate']['candidateType'],
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

  const candidateTypeResult = importableOnlineCandidateTypeSchema.safeParse(candidateType);
  if (!candidateTypeResult.success) return null;
  const recordResult = legacyOnlineServiceRecordSchema.safeParse(
    payloadResult.data.normalizedRecord,
  );
  if (!recordResult.success) return null;
  const recordTypeResult = importableOnlineCandidateTypeSchema.safeParse(recordResult.data.recordType);
  if (!recordTypeResult.success || recordTypeResult.data !== candidateTypeResult.data) return null;
  const record = recordResult.data;

  return {
    kind: 'online_service',
    recordType: recordTypeResult.data,
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
