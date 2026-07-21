import { z } from 'zod';

const timestampSchema = z.iso.datetime({ offset: true });
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const businessClaimFieldProvenanceRequestSchema = z
  .object({
    schemaVersion: z.literal('business-claim-field-provenance-v1'),
    requestId: z.uuid(),
    expectedFieldApplicationEventId: z.uuid(),
    expectedTargetUpdatedAt: timestampSchema,
  })
  .strict();

export const businessClaimFieldProvenanceSourceFieldSchema = z
  .object({
    fieldPath: z.string().trim().min(1).max(160),
    beforeValue: z.unknown(),
    appliedValue: z.unknown(),
  })
  .strict();

export const businessClaimFieldProvenanceSourcePayloadSchema = z
  .object({
    schemaVersion: z.literal('business-claim-field-provenance-source-v1'),
    submissionReference: z.string().trim().min(1).max(64),
    fieldApplicationEventId: z.uuid(),
    relationshipDecisionId: z.uuid(),
    target: z
      .object({
        targetType: z.enum(['entity', 'location']),
        targetId: z.uuid(),
      })
      .strict(),
    fields: z.array(businessClaimFieldProvenanceSourceFieldSchema).min(1).max(14),
    fieldAppliedAt: timestampSchema,
  })
  .strict()
  .superRefine((payload, context) => {
    const paths = payload.fields.map((field) => field.fieldPath);
    if (new Set(paths).size !== paths.length) {
      context.addIssue({ code: 'custom', path: ['fields'], message: 'Field paths must be unique.' });
    }
  });

export const businessClaimFieldProvenanceEventPayloadSchema = z
  .object({
    schemaVersion: z.literal('business-claim-field-provenance-event-v1'),
    requestFingerprint: hashSchema,
    submissionId: z.uuid(),
    fieldApplicationEventId: z.uuid(),
    relationshipDecisionId: z.uuid(),
    sourceRecordId: z.uuid(),
    target: z
      .object({
        targetType: z.enum(['entity', 'location']),
        targetId: z.uuid(),
      })
      .strict(),
    fieldPaths: z.array(z.string().trim().min(1).max(160)).min(1).max(14),
    expectedTargetUpdatedAt: timestampSchema,
    fieldAppliedAt: timestampSchema,
    completedAt: timestampSchema,
  })
  .strict()
  .superRefine((payload, context) => {
    if (new Set(payload.fieldPaths).size !== payload.fieldPaths.length) {
      context.addIssue({ code: 'custom', path: ['fieldPaths'], message: 'Field paths must be unique.' });
    }
  });

export const businessClaimFieldProvenanceReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed']),
    submissionId: z.uuid(),
    requestId: z.uuid(),
    fieldApplicationEventId: z.uuid(),
    sourceRecordId: z.uuid(),
    targetType: z.enum(['entity', 'location']),
    targetId: z.uuid(),
    fieldPaths: z.array(z.string().trim().min(1).max(160)).min(1).max(14),
    completedAt: timestampSchema,
  })
  .strict();

export type BusinessClaimFieldProvenanceRequest = z.infer<
  typeof businessClaimFieldProvenanceRequestSchema
>;
export type BusinessClaimFieldProvenanceSourcePayload = z.infer<
  typeof businessClaimFieldProvenanceSourcePayloadSchema
>;
export type BusinessClaimFieldProvenanceEventPayload = z.infer<
  typeof businessClaimFieldProvenanceEventPayloadSchema
>;
export type BusinessClaimFieldProvenanceReceipt = z.infer<
  typeof businessClaimFieldProvenanceReceiptSchema
>;

export function serializeBusinessClaimFieldProvenanceEventPayload(
  payload: BusinessClaimFieldProvenanceEventPayload,
): string {
  return JSON.stringify(businessClaimFieldProvenanceEventPayloadSchema.parse(payload));
}

export function parseBusinessClaimFieldProvenanceEventPayload(
  value: string | null,
): BusinessClaimFieldProvenanceEventPayload | null {
  if (value === null || value.length === 0 || value.length > 100_000) return null;
  try {
    return businessClaimFieldProvenanceEventPayloadSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}
