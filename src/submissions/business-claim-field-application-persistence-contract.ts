import { z } from 'zod';
import {
  businessClaimFieldApplicationProjectionSchema,
  businessClaimFieldApplicationRequestSchema,
} from '../admin/submissions/business-claim-field-application';

const timestampSchema = z.iso.datetime({ offset: true });

export const businessClaimFieldApplicationEventPayloadSchema = z
  .object({
    schemaVersion: z.literal('business-claim-field-application-event-v1'),
    request: businessClaimFieldApplicationRequestSchema,
    projection: businessClaimFieldApplicationProjectionSchema,
    appliedAt: timestampSchema,
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.request.requestId !== payload.projection.requestId) {
      context.addIssue({
        code: 'custom',
        path: ['projection', 'requestId'],
        message: 'The durable projection must use the application request ID.',
      });
    }
    if (
      payload.request.expectedRelationshipDecisionId !==
      payload.projection.relationshipDecisionId
    ) {
      context.addIssue({
        code: 'custom',
        path: ['projection', 'relationshipDecisionId'],
        message: 'The durable projection must use the reviewed relationship decision.',
      });
    }
    if (payload.projection.generatedAt !== payload.appliedAt) {
      context.addIssue({
        code: 'custom',
        path: ['projection', 'generatedAt'],
        message: 'The durable projection timestamp must equal the application timestamp.',
      });
    }
  });

export const businessClaimFieldApplicationReceiptSchema = z
  .object({
    state: z.enum(['committed', 'replayed']),
    submissionId: z.uuid(),
    requestId: z.uuid(),
    requestFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    relationshipDecisionId: z.uuid(),
    targetType: z.enum(['entity', 'location']),
    targetId: z.uuid(),
    appliedEntityFields: z.array(z.string().min(1).max(80)).max(4),
    rejectedEntityFields: z.array(z.string().min(1).max(80)).max(4),
    appliedLocationFields: z.array(z.string().min(1).max(80)).max(14),
    rejectedLocationFields: z.array(z.string().min(1).max(80)).max(14),
    acceptedPaymentDraftCount: z.number().int().min(0).max(20),
    rejectedPaymentDraftCount: z.number().int().min(0).max(20),
    canonicalMutationCommitted: z.boolean(),
    appliedAt: timestampSchema,
  })
  .strict();

export type BusinessClaimFieldApplicationEventPayload = z.infer<
  typeof businessClaimFieldApplicationEventPayloadSchema
>;
export type BusinessClaimFieldApplicationReceipt = z.infer<
  typeof businessClaimFieldApplicationReceiptSchema
>;

export function serializeBusinessClaimFieldApplicationEventPayload(
  payload: BusinessClaimFieldApplicationEventPayload,
): string {
  return JSON.stringify(businessClaimFieldApplicationEventPayloadSchema.parse(payload));
}

export function parseBusinessClaimFieldApplicationEventPayload(
  value: string | null,
): BusinessClaimFieldApplicationEventPayload | null {
  if (value === null || value.length === 0 || value.length > 80_000) return null;
  try {
    return businessClaimFieldApplicationEventPayloadSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}
