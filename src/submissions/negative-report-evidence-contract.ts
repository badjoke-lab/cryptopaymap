import { z } from 'zod';

const safeTextSchema = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !/[<>]/.test(value), 'HTML-like text is not accepted.');

export const negativeReportEvidenceDecisionValues = [
  'accept_negative_evidence',
  'accept_and_prioritize_recheck',
] as const;
export const negativeReportEvidenceDecisionSchema = z.enum(negativeReportEvidenceDecisionValues);

export const negativeReportEvidenceEventSchema = z
  .object({
    schemaVersion: z.literal('negative-report-evidence-event-v1'),
    requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    evidenceId: z.uuid(),
    claimId: z.uuid(),
    decision: negativeReportEvidenceDecisionSchema,
    evidenceSummary: safeTextSchema(1_000),
    reviewerNote: safeTextSchema(1_000).nullable(),
  })
  .strict();

export type NegativeReportEvidenceEvent = z.infer<typeof negativeReportEvidenceEventSchema>;

export function serializeNegativeReportEvidenceEvent(event: NegativeReportEvidenceEvent): string {
  return JSON.stringify(negativeReportEvidenceEventSchema.parse(event));
}

export function parseNegativeReportEvidenceEvent(
  value: string | null,
): NegativeReportEvidenceEvent | null {
  if (value === null) return null;
  try {
    const result = negativeReportEvidenceEventSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
