import { z } from 'zod';
import { ownershipVerificationMethodSchema } from './business-claim-contract';

const timestampSchema = z.iso.datetime({ offset: true });

export const businessClaimVerificationOutcomeValues = [
  'passed',
  'failed',
  'inconclusive',
  'provider_error',
] as const;
export const businessClaimVerificationOutcomeSchema = z.enum(
  businessClaimVerificationOutcomeValues,
);

export const businessClaimVerificationAdapterResultSchema = z
  .object({
    outcome: businessClaimVerificationOutcomeSchema,
    resultCode: z.string().trim().min(1).max(96),
    observedAt: timestampSchema,
    retryable: z.boolean(),
    summary: z.string().trim().min(1).max(500),
    providerReferenceHash: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .nullable(),
  })
  .strict();

export const businessClaimVerificationResultEventPayloadSchema = z
  .object({
    schemaVersion: z.literal('business-claim-verification-result-event-v1'),
    executionId: z.uuid(),
    preparationId: z.uuid(),
    expectedSubmissionUpdatedAt: timestampSchema,
    expectedPreparationExpiresAt: timestampSchema,
    targetType: z.enum(['entity', 'location']),
    targetId: z.uuid(),
    method: ownershipVerificationMethodSchema,
    adapterId: z.string().trim().min(1).max(96),
    adapterVersion: z.string().trim().min(1).max(64),
    outcome: businessClaimVerificationOutcomeSchema,
    resultCode: z.string().trim().min(1).max(96),
    observedAt: timestampSchema,
    retryable: z.boolean(),
    summary: z.string().trim().min(1).max(500),
    providerReferenceHash: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .nullable(),
  })
  .strict();

export type BusinessClaimVerificationAdapterResult = z.infer<
  typeof businessClaimVerificationAdapterResultSchema
>;
export type BusinessClaimVerificationResultEventPayload = z.infer<
  typeof businessClaimVerificationResultEventPayloadSchema
>;

export function serializeBusinessClaimVerificationResultEventPayload(
  payload: BusinessClaimVerificationResultEventPayload,
): string {
  return JSON.stringify(businessClaimVerificationResultEventPayloadSchema.parse(payload));
}

export function parseBusinessClaimVerificationResultEventPayload(
  value: string | null,
): BusinessClaimVerificationResultEventPayload | null {
  if (value === null || value.length === 0 || value.length > 16_000) return null;
  try {
    return businessClaimVerificationResultEventPayloadSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}
