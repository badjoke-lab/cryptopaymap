import { z } from 'zod';

const safePlainTextSchema = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !/[<>]/.test(value), 'HTML-like text is not accepted.');

export const suggestCandidateAcceptanceReasonValues = [
  'useful_but_incomplete',
  'insufficient_evidence',
  'identity_needs_review',
  'payment_details_incomplete',
  'other',
] as const;
export const suggestCandidateAcceptanceReasonSchema = z.enum(
  suggestCandidateAcceptanceReasonValues,
);

export const suggestAcceptedCandidateEventPayloadSchema = z
  .object({
    schemaVersion: z.literal('suggest-accepted-candidate-event-v1'),
    candidateId: z.uuid(),
    sourceRecordId: z.uuid(),
    sourceId: z.uuid(),
    candidateType: z.enum(['physical_place', 'online_service']),
    normalizedName: z.string().trim().min(1).max(200),
    reasonCode: suggestCandidateAcceptanceReasonSchema,
    note: safePlainTextSchema(1_000).nullable(),
  })
  .strict();

export type SuggestAcceptedCandidateEventPayload = z.infer<
  typeof suggestAcceptedCandidateEventPayloadSchema
>;

export function serializeSuggestAcceptedCandidateEventPayload(
  payload: SuggestAcceptedCandidateEventPayload,
): string {
  return JSON.stringify(suggestAcceptedCandidateEventPayloadSchema.parse(payload));
}

export function parseSuggestAcceptedCandidateEventPayload(
  value: string | null,
): SuggestAcceptedCandidateEventPayload | null {
  if (value === null) return null;
  try {
    return suggestAcceptedCandidateEventPayloadSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}
