import { z } from 'zod';
import {
  assetStatusValues,
  networkStatusValues,
  paymentMethodValues,
  paymentRegistryStatusValues,
} from '../db/schema';

const timestampSchema = z.iso.datetime({ offset: true });
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const problemClaimAssetReplacementSelectionSchema = z
  .object({
    mode: z.enum(['automatic_single_row', 'reviewed_current_row']),
    selectedCurrentRowId: z.uuid().nullable(),
  })
  .strict()
  .superRefine((selection, context) => {
    if (selection.mode === 'automatic_single_row' && selection.selectedCurrentRowId !== null) {
      context.addIssue({
        code: 'custom',
        path: ['selectedCurrentRowId'],
        message: 'Automatic single-row planning must not select a row.',
      });
    }
    if (selection.mode === 'reviewed_current_row' && selection.selectedCurrentRowId === null) {
      context.addIssue({
        code: 'custom',
        path: ['selectedCurrentRowId'],
        message: 'Reviewed multi-row planning requires one current row.',
      });
    }
  });

export const problemClaimAssetReplacementPlanRequestSchema = z
  .object({
    schemaVersion: z.literal('problem-claim-asset-replacement-plan-v1'),
    requestId: z.uuid(),
    expectedApplicationUpdatedAt: timestampSchema,
    expectedClaimUpdatedAt: timestampSchema,
    expectedSourceDecisionEventId: z.uuid(),
    expectedCurrentSetHash: hashSchema,
    selection: problemClaimAssetReplacementSelectionSchema,
  })
  .strict();

const privateRegistryAssetSchema = z
  .object({
    id: z.uuid(),
    slug: slugSchema,
    symbol: z.string().trim().min(1).max(16),
    status: z.enum(assetStatusValues),
  })
  .strict();
const privateRegistryNetworkSchema = z
  .object({
    id: z.uuid(),
    slug: slugSchema,
    status: z.enum(networkStatusValues),
  })
  .strict();
const privateRegistryPaymentMethodSchema = z
  .object({
    id: z.uuid(),
    slug: z.enum(paymentMethodValues),
    status: z.enum(paymentRegistryStatusValues),
  })
  .strict();

export const problemClaimAssetReplacementPrivateRowSchema = z
  .object({
    rowId: z.uuid(),
    claimId: z.uuid(),
    asset: privateRegistryAssetSchema,
    network: privateRegistryNetworkSchema,
    paymentMethod: privateRegistryPaymentMethodSchema,
    contractAddress: z.string().trim().min(1).max(256).nullable(),
    isPrimary: z.boolean(),
    notes: z.string().trim().min(1).max(4_000).nullable(),
  })
  .strict();

export const problemClaimAssetReplacementPlanEventPayloadSchema = z
  .object({
    schemaVersion: z.literal('problem-claim-asset-replacement-plan-event-v1'),
    planId: z.uuid(),
    requestFingerprint: hashSchema,
    applicationId: z.uuid(),
    expectedApplicationUpdatedAt: timestampSchema,
    submissionId: z.uuid(),
    sourceDecisionEventId: z.uuid(),
    claimId: z.uuid(),
    expectedClaimUpdatedAt: timestampSchema,
    correction: z
      .object({
        reportType: z.enum(['wrong_asset', 'wrong_network']),
        kind: z.enum(['asset', 'network']),
        proposedSlug: slugSchema,
      })
      .strict(),
    selection: problemClaimAssetReplacementSelectionSchema,
    selectedCurrentRowId: z.uuid(),
    replacementRowId: z.uuid(),
    currentSetHash: hashSchema,
    proposedSetHash: hashSchema,
    currentSet: z.array(problemClaimAssetReplacementPrivateRowSchema).min(1).max(50),
    proposedSet: z.array(problemClaimAssetReplacementPrivateRowSchema).min(1).max(50),
    plannedAt: timestampSchema,
  })
  .strict();

export const problemClaimAssetReplacementPlanReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed']),
    planId: z.uuid(),
    applicationId: z.uuid(),
    claimId: z.uuid(),
    correction: z
      .object({
        reportType: z.enum(['wrong_asset', 'wrong_network']),
        kind: z.enum(['asset', 'network']),
        proposedSlug: slugSchema,
      })
      .strict(),
    selection: problemClaimAssetReplacementSelectionSchema,
    selectedCurrentRowId: z.uuid(),
    replacementRowId: z.uuid(),
    currentSetHash: hashSchema,
    proposedSetHash: hashSchema,
    plannedAt: timestampSchema,
  })
  .strict();

export type ProblemClaimAssetReplacementPlanRequest = z.infer<
  typeof problemClaimAssetReplacementPlanRequestSchema
>;
export type ProblemClaimAssetReplacementPrivateRow = z.infer<
  typeof problemClaimAssetReplacementPrivateRowSchema
>;
export type ProblemClaimAssetReplacementPlanEventPayload = z.infer<
  typeof problemClaimAssetReplacementPlanEventPayloadSchema
>;
export type ProblemClaimAssetReplacementPlanReceipt = z.infer<
  typeof problemClaimAssetReplacementPlanReceiptSchema
>;

export function serializeProblemClaimAssetReplacementPlanEventPayload(
  payload: ProblemClaimAssetReplacementPlanEventPayload,
): string {
  return JSON.stringify(problemClaimAssetReplacementPlanEventPayloadSchema.parse(payload));
}

export function parseProblemClaimAssetReplacementPlanEventPayload(
  value: string | null,
): ProblemClaimAssetReplacementPlanEventPayload | null {
  if (value === null || value.length === 0 || value.length > 250_000) return null;
  try {
    return problemClaimAssetReplacementPlanEventPayloadSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}
