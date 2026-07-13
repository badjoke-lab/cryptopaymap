import { z } from 'zod';

const safeTextSchema = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !/[<>]/.test(value), 'HTML-like text is not accepted.');

export const positivePaymentEvidenceDecisionValues = [
  'accept_evidence',
  'accept_and_reconfirm',
] as const;
export const positivePaymentEvidenceDecisionSchema = z.enum(
  positivePaymentEvidenceDecisionValues,
);

export const positivePaymentEvidenceEventSchema = z
  .object({
    schemaVersion: z.literal('positive-payment-evidence-event-v1'),
    requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    evidenceId: z.uuid(),
    claimId: z.uuid(),
    decision: positivePaymentEvidenceDecisionSchema,
    verificationEventId: z.uuid().nullable(),
    summary: safeTextSchema(1_000),
    reviewerNote: safeTextSchema(1_000).nullable(),
  })
  .strict();

export type PositivePaymentEvidenceEvent = z.infer<typeof positivePaymentEvidenceEventSchema>;

export function serializePositivePaymentEvidenceEvent(
  event: PositivePaymentEvidenceEvent,
): string {
  return JSON.stringify(positivePaymentEvidenceEventSchema.parse(event));
}

export function parsePositivePaymentEvidenceEvent(value: string | null): PositivePaymentEvidenceEvent | null {
  if (value === null) return null;
  try {
    const result = positivePaymentEvidenceEventSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
