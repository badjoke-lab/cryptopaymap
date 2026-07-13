import { z } from 'zod';
import {
  problemReportCorrectionSchema,
  problemReportDuplicateTargetSchema,
} from './report-contract';

const safeTextSchema = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !/[<>]/.test(value), 'HTML-like text is not accepted.');

export const problemReportDecisionOperationValues = [
  'approve_correction_handoff',
  'resolve_duplicate',
  'resolve_no_change',
  'temporarily_hide_claim',
  'apply_negative_claim_action',
] as const;
export const problemReportDecisionOperationSchema = z.enum(problemReportDecisionOperationValues);

export const problemReportClaimActionValues = ['mark_stale', 'end'] as const;
export const problemReportClaimActionSchema = z.enum(problemReportClaimActionValues);

export const problemReportDecisionEventSchema = z
  .object({
    schemaVersion: z.literal('problem-report-decision-event-v1'),
    requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    operation: problemReportDecisionOperationSchema,
    reportType: z.string().trim().min(1).max(96),
    claimId: z.uuid().nullable(),
    evidenceId: z.uuid().nullable(),
    verificationEventId: z.uuid().nullable(),
    claimAction: problemReportClaimActionSchema.nullable(),
    proposedCorrection: problemReportCorrectionSchema.nullable(),
    duplicateTarget: problemReportDuplicateTargetSchema.nullable(),
    publicSummary: safeTextSchema(1_000).nullable(),
    internalNote: safeTextSchema(2_000).nullable(),
  })
  .strict();

export type ProblemReportDecisionEvent = z.infer<typeof problemReportDecisionEventSchema>;

export function serializeProblemReportDecisionEvent(event: ProblemReportDecisionEvent): string {
  return JSON.stringify(problemReportDecisionEventSchema.parse(event));
}

export function parseProblemReportDecisionEvent(
  value: string | null,
): ProblemReportDecisionEvent | null {
  if (value === null) return null;
  try {
    const result = problemReportDecisionEventSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
