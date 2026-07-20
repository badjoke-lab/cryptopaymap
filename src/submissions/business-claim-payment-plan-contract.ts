import { z } from 'zod';
import {
  assetStatusValues,
  claimScopeValues,
  networkStatusValues,
  paymentMethodValues,
  paymentRegistryStatusValues,
  routeTypeValues,
} from '../db/schema';
import { suggestPaymentProposalSchema } from './suggest-contract';

const timestampSchema = z.iso.datetime({ offset: true });
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const businessClaimPaymentPlanSelectionSchema = z
  .object({
    submittedIndex: z.number().int().min(0).max(19),
    selectedClaimId: z.uuid(),
  })
  .strict();

export const businessClaimPaymentPlanRequestSchema = z
  .object({
    schemaVersion: z.literal('business-claim-payment-plan-v1'),
    requestId: z.uuid(),
    expectedApplicationUpdatedAt: timestampSchema,
    expectedSourceDecisionEventId: z.uuid(),
    expectedFieldApplicationEventId: z.uuid(),
    expectedDraftSetHash: hashSchema,
    selections: z.array(businessClaimPaymentPlanSelectionSchema).max(20),
  })
  .strict()
  .superRefine((request, context) => {
    const indexes = request.selections.map((selection) => selection.submittedIndex);
    if (new Set(indexes).size !== indexes.length) {
      context.addIssue({
        code: 'custom',
        path: ['selections'],
        message: 'Payment plan selections must use unique submitted indexes.',
      });
    }
  });

const privateAssetSchema = z
  .object({
    id: z.uuid(),
    slug: slugSchema,
    symbol: z.string().trim().min(1).max(16),
    status: z.enum(assetStatusValues),
  })
  .strict();
const privateNetworkSchema = z
  .object({ id: z.uuid(), slug: slugSchema, status: z.enum(networkStatusValues) })
  .strict();
const privatePaymentMethodSchema = z
  .object({
    id: z.uuid(),
    slug: z.enum(paymentMethodValues),
    status: z.enum(paymentRegistryStatusValues),
  })
  .strict();
const privateProcessorSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(160),
    websiteUrl: z.url().nullable(),
    updatedAt: timestampSchema,
  })
  .strict();

export const businessClaimPaymentPlannedClaimSchema = z
  .object({
    claimId: z.uuid(),
    entityId: z.uuid(),
    locationId: z.uuid().nullable(),
    claimScope: z.enum(claimScopeValues),
    routeType: z.enum(routeTypeValues),
    processorId: z.uuid().nullable(),
    customerPaysCrypto: z.literal(true),
    merchantExplicitlyAcceptsCrypto: z.literal(true),
    claimStatus: z.literal('candidate'),
    visibility: z.literal('hidden'),
    howToPay: z.string().trim().min(1).max(1_000).nullable(),
    restrictions: z.string().trim().min(1).max(1_000).nullable(),
  })
  .strict();

export const businessClaimPaymentExistingClaimGuardSchema = z
  .object({
    claimId: z.uuid(),
    expectedClaimUpdatedAt: timestampSchema,
    claimAssetSetHash: hashSchema,
    rowCount: z.number().int().min(0).max(100),
  })
  .strict();

export const businessClaimPaymentPlanItemSchema = z
  .object({
    submittedIndex: z.number().int().min(0).max(19),
    proposal: suggestPaymentProposalSchema,
    operation: z.enum(['insert_claim_asset', 'already_present']),
    targetKind: z.enum(['existing_claim', 'new_candidate_claim']),
    targetClaimId: z.uuid(),
    expectedTargetClaimUpdatedAt: timestampSchema.nullable(),
    asset: privateAssetSchema,
    network: privateNetworkSchema,
    paymentMethod: privatePaymentMethodSchema,
    processor: privateProcessorSchema.nullable(),
    existingClaimAssetRowId: z.uuid().nullable(),
    plannedClaimAssetRowId: z.uuid().nullable(),
    isPrimary: z.boolean(),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.operation === 'insert_claim_asset') {
      if (item.plannedClaimAssetRowId === null || item.existingClaimAssetRowId !== null) {
        context.addIssue({
          code: 'custom',
          message: 'Inserted payment items require only a planned Claim Asset row ID.',
        });
      }
    } else if (item.existingClaimAssetRowId === null || item.plannedClaimAssetRowId !== null) {
      context.addIssue({
        code: 'custom',
        message: 'Already-present payment items require only an existing Claim Asset row ID.',
      });
    }

    if (item.targetKind === 'existing_claim') {
      if (item.expectedTargetClaimUpdatedAt === null) {
        context.addIssue({
          code: 'custom',
          path: ['expectedTargetClaimUpdatedAt'],
          message: 'Existing Claim targets require an expected version.',
        });
      }
    } else {
      if (item.expectedTargetClaimUpdatedAt !== null || item.operation !== 'insert_claim_asset') {
        context.addIssue({
          code: 'custom',
          message: 'New candidate Claim targets can only plan new Claim Asset rows.',
        });
      }
    }
  });

export const businessClaimPaymentPlanEventPayloadSchema = z
  .object({
    schemaVersion: z.literal('business-claim-payment-plan-event-v1'),
    planId: z.uuid(),
    requestFingerprint: hashSchema,
    applicationId: z.uuid(),
    expectedApplicationUpdatedAt: timestampSchema,
    submissionId: z.uuid(),
    sourceDecisionEventId: z.uuid(),
    fieldApplicationEventId: z.uuid(),
    target: z
      .object({
        targetType: z.enum(['entity', 'location']),
        targetId: z.uuid(),
        entityId: z.uuid(),
        entityType: z.enum(['merchant', 'online_service']),
        expectedEntityUpdatedAt: timestampSchema,
        locationId: z.uuid().nullable(),
        expectedLocationUpdatedAt: timestampSchema.nullable(),
      })
      .strict(),
    draftSetHash: hashSchema,
    selections: z.array(businessClaimPaymentPlanSelectionSchema).max(20),
    plannedClaims: z.array(businessClaimPaymentPlannedClaimSchema).max(20),
    existingClaims: z.array(businessClaimPaymentExistingClaimGuardSchema).max(20),
    items: z.array(businessClaimPaymentPlanItemSchema).min(1).max(20),
    plannedAt: timestampSchema,
  })
  .strict();

export const businessClaimPaymentPlanReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed']),
    planId: z.uuid(),
    applicationId: z.uuid(),
    submissionId: z.uuid(),
    draftSetHash: hashSchema,
    itemCount: z.number().int().min(1).max(20),
    plannedClaimCount: z.number().int().min(0).max(20),
    insertCount: z.number().int().min(0).max(20),
    alreadyPresentCount: z.number().int().min(0).max(20),
    plannedAt: timestampSchema,
  })
  .strict();

export type BusinessClaimPaymentPlanSelection = z.infer<
  typeof businessClaimPaymentPlanSelectionSchema
>;
export type BusinessClaimPaymentPlanRequest = z.infer<
  typeof businessClaimPaymentPlanRequestSchema
>;
export type BusinessClaimPaymentPlannedClaim = z.infer<
  typeof businessClaimPaymentPlannedClaimSchema
>;
export type BusinessClaimPaymentExistingClaimGuard = z.infer<
  typeof businessClaimPaymentExistingClaimGuardSchema
>;
export type BusinessClaimPaymentPlanItem = z.infer<typeof businessClaimPaymentPlanItemSchema>;
export type BusinessClaimPaymentPlanEventPayload = z.infer<
  typeof businessClaimPaymentPlanEventPayloadSchema
>;
export type BusinessClaimPaymentPlanReceipt = z.infer<
  typeof businessClaimPaymentPlanReceiptSchema
>;

export function serializeBusinessClaimPaymentPlanEventPayload(
  payload: BusinessClaimPaymentPlanEventPayload,
): string {
  return JSON.stringify(businessClaimPaymentPlanEventPayloadSchema.parse(payload));
}

export function parseBusinessClaimPaymentPlanEventPayload(
  value: string | null,
): BusinessClaimPaymentPlanEventPayload | null {
  if (value === null || value.length === 0 || value.length > 250_000) return null;
  try {
    return businessClaimPaymentPlanEventPayloadSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}
