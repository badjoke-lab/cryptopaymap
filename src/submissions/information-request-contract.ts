import { z } from 'zod';

const safePlainTextSchema = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value.trim().length > 0, 'Text must contain non-whitespace content.')
    .refine((value) => !/[<>]/.test(value), 'HTML-like text is not accepted.');

export const submissionInformationRequestedActionSchema = safePlainTextSchema(500);
export const submissionInformationPublicMessageSchema = safePlainTextSchema(1_000);

export const submissionInformationRequestEventPayloadSchema = z
  .object({
    schemaVersion: z.literal('suggest-information-request-event-v1'),
    requestedAction: submissionInformationRequestedActionSchema,
    publicMessage: submissionInformationPublicMessageSchema,
  })
  .strict();

export type SubmissionInformationRequestEventPayload = z.infer<
  typeof submissionInformationRequestEventPayloadSchema
>;

export function serializeSubmissionInformationRequestEventPayload(
  payload: SubmissionInformationRequestEventPayload,
): string {
  return JSON.stringify(submissionInformationRequestEventPayloadSchema.parse(payload));
}

export function parseSubmissionInformationRequestEventPayload(
  value: string | null,
): SubmissionInformationRequestEventPayload | null {
  if (value === null) return null;
  try {
    return submissionInformationRequestEventPayloadSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}
