import { z } from 'zod';
import { suggestPaymentProposalSchema } from './suggest-contract';

const timestampSchema = z.iso.datetime({ offset: true });
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const businessClaimPaymentApplicationRequestSchema = z
  .object({
    schemaVersion: z.literal('business-claim-payment-application-v1'),
    requestId: z.uuid(),
    planId: z.uuid(),
    expectedApplicationUpdatedAt: timestampSchema,
    expectedSourceDecisionEventId: z.uuid(),
    expectedFieldApplicationEventId: z.uuid(),
    expectedPlanCreatedAt: timestampSchema,
    expectedDraftSetHash: hashSchema,
  })
  .strict();

export const businessClaimPaymentSourceItemSchema = z
  .object({
    submittedIndex: z.number().int().min(0).max(19),
    proposal: suggestPaymentProposalSchema,
    operation: z.enum(['insert_claim_asset', 'already_present']),
    targetKind: z.enum(['existing_claim', 'new_candidate_claim']),
    targetClaimId: z.uuid(),
    claimAssetRowId: z.uuid(),
    assetId: z.uuid(),
    networkId: z.uuid(),
    paymentMethodId: z.uuid(),
    contractAddress: z.string().trim().min(1).max(256).nullable(),
    isPrimary: z.boolean(),
  })
  .strict();

export const businessClaimPaymentSourcePayloadSchema = z
  .object({
    schemaVersion: z.literal('business-claim-payment-source-v1'),
    submissionReference: z.string().trim().min(1).max(64),
    planId: z.uuid(),
    sourceDecisionEventId: z.uuid(),
    fieldApplicationEventId: z.uuid(),
    target: z
      .object({
        targetType: z.enum(['entity', 'location']),
        targetId: z.uuid(),
        entityId: z.uuid(),
        locationId: z.uuid().nullable(),
      })
      .strict(),
    draftSetHash: hashSchema,
    items: z.array(businessClaimPaymentSourceItemSchema).min(1).max(20),
  })
  .strict();

export const businessClaimPaymentVerificationReferenceSchema = z
  .object({ claimId: z.uuid(), verificationEventId: z.uuid() })
  .strict();

export const businessClaimPaymentFinalClaimAssetSetSchema = z
  .object({
    claimId: z.uuid(),
    rowIds: z.array(z.uuid()).min(1).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.rowIds).size !== value.rowIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['rowIds'],
        message: 'Final Claim Asset row IDs must be unique.',
      });
    }
  });

export const businessClaimPaymentApplicationEventPayloadSchema = z
  .object({
    schemaVersion: z.literal('business-claim-payment-application-event-v1'),
    requestFingerprint: hashSchema,
    applicationId: z.uuid(),
    planId: z.uuid(),
    sourceDecisionEventId: z.uuid(),
    fieldApplicationEventId: z.uuid(),
    sourceRecordId: z.uuid(),
    target: z
      .object({
        targetType: z.enum(['entity', 'location']),
        targetId: z.uuid(),
        entityId: z.uuid(),
        locationId: z.uuid().nullable(),
      })
      .strict(),
    draftSetHash: hashSchema,
    createdClaimIds: z.array(z.uuid()).max(20),
    insertedClaimAssetRowIds: z.array(z.uuid()).max(20),
    alreadyPresentClaimAssetRowIds: z.array(z.uuid()).max(20),
    finalClaimAssetSets: z.array(businessClaimPaymentFinalClaimAssetSetSchema).min(1).max(20),
    verificationEvents: z.array(businessClaimPaymentVerificationReferenceSchema).min(1).max(20),
    expectedApplicationUpdatedAt: timestampSchema,
    expectedPlanCreatedAt: timestampSchema,
    appliedAt: timestampSchema,
  })
  .strict()
  .superRefine((payload, context) => {
    for (const [key, values] of [
      ['createdClaimIds', payload.createdClaimIds],
      ['insertedClaimAssetRowIds', payload.insertedClaimAssetRowIds],
      ['alreadyPresentClaimAssetRowIds', payload.alreadyPresentClaimAssetRowIds],
    ] as const) {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: 'custom', path: [key], message: `${key} must be unique.` });
      }
    }
    const finalClaimIds = payload.finalClaimAssetSets.map((item) => item.claimId);
    const finalRowIds = payload.finalClaimAssetSets.flatMap((item) => item.rowIds);
    if (
      new Set(finalClaimIds).size !== finalClaimIds.length ||
      new Set(finalRowIds).size !== finalRowIds.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['finalClaimAssetSets'],
        message: 'Final Claim and Claim Asset row IDs must be globally unique.',
      });
    }
    const verificationIds = payload.verificationEvents.map((item) => item.verificationEventId);
    const verificationClaimIds = payload.verificationEvents.map((item) => item.claimId);
    if (
      new Set(verificationIds).size !== verificationIds.length ||
      new Set(verificationClaimIds).size !== verificationClaimIds.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['verificationEvents'],
        message: 'Verification event and Claim IDs must be unique.',
      });
    }
  });

export const businessClaimPaymentApplicationReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed', 'already_applied']),
    applicationId: z.uuid(),
    submissionId: z.uuid(),
    planId: z.uuid(),
    applicationEventId: z.uuid(),
    sourceRecordId: z.uuid(),
    createdClaimIds: z.array(z.uuid()).max(20),
    insertedClaimAssetRowIds: z.array(z.uuid()).max(20),
    alreadyPresentClaimAssetRowIds: z.array(z.uuid()).max(20),
    verificationEventIds: z.array(z.uuid()).min(1).max(20),
    applicationStatus: z.literal('committed'),
    publicationStatus: z.enum(['pending', 'committed', 'failed']),
    transitionEventId: z.uuid().nullable(),
    appliedAt: timestampSchema,
  })
  .strict();

export type BusinessClaimPaymentApplicationRequest = z.infer<
  typeof businessClaimPaymentApplicationRequestSchema
>;
export type BusinessClaimPaymentSourceItem = z.infer<typeof businessClaimPaymentSourceItemSchema>;
export type BusinessClaimPaymentSourcePayload = z.infer<
  typeof businessClaimPaymentSourcePayloadSchema
>;
export type BusinessClaimPaymentVerificationReference = z.infer<
  typeof businessClaimPaymentVerificationReferenceSchema
>;
export type BusinessClaimPaymentFinalClaimAssetSet = z.infer<
  typeof businessClaimPaymentFinalClaimAssetSetSchema
>;
export type BusinessClaimPaymentApplicationEventPayload = z.infer<
  typeof businessClaimPaymentApplicationEventPayloadSchema
>;
export type BusinessClaimPaymentApplicationReceipt = z.infer<
  typeof businessClaimPaymentApplicationReceiptSchema
>;

export function serializeBusinessClaimPaymentApplicationEventPayload(
  payload: BusinessClaimPaymentApplicationEventPayload,
): string {
  return JSON.stringify(businessClaimPaymentApplicationEventPayloadSchema.parse(payload));
}

export function parseBusinessClaimPaymentApplicationEventPayload(
  value: string | null,
): BusinessClaimPaymentApplicationEventPayload | null {
  if (value === null || value.length === 0 || value.length > 250_000) return null;
  try {
    return businessClaimPaymentApplicationEventPayloadSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}
