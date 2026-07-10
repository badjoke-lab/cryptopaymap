import { z } from 'zod';

const safePlainTextSchema = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value.trim().length > 0, 'Text must contain non-whitespace content.')
    .refine((value) => !/[<>]/.test(value), 'HTML-like text is not accepted.');

export const submissionHoldDayValues = [30, 60, 90] as const;
export const submissionHoldDaysSchema = z.union([
  z.literal(30),
  z.literal(60),
  z.literal(90),
]);
export const submissionHoldReasonSchema = safePlainTextSchema(500);
export const submissionHoldRequiredActionSchema = safePlainTextSchema(500);
export const submissionHoldPublicMessageSchema = safePlainTextSchema(1_000);

export const submissionHoldEventPayloadSchema = z
  .object({
    schemaVersion: z.literal('suggest-hold-event-v1'),
    holdDays: submissionHoldDaysSchema,
    nextReviewAt: z.iso.datetime({ offset: true }),
    holdReason: submissionHoldReasonSchema,
    requiredAction: submissionHoldRequiredActionSchema,
    publicMessage: submissionHoldPublicMessageSchema,
  })
  .strict();

export type SubmissionHoldEventPayload = z.infer<typeof submissionHoldEventPayloadSchema>;

export function calculateSubmissionHoldNextReviewAt(changedAt: Date, holdDays: 30 | 60 | 90): Date {
  if (Number.isNaN(changedAt.getTime())) {
    throw new Error('Hold change time is invalid.');
  }
  const result = new Date(changedAt);
  result.setUTCDate(result.getUTCDate() + holdDays);
  return result;
}

export function serializeSubmissionHoldEventPayload(payload: SubmissionHoldEventPayload): string {
  return JSON.stringify(submissionHoldEventPayloadSchema.parse(payload));
}

export function parseSubmissionHoldEventPayload(
  value: string | null,
): SubmissionHoldEventPayload | null {
  if (value === null) return null;
  try {
    return submissionHoldEventPayloadSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}
