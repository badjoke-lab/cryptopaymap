import { z } from 'zod';
import { submissionResolutionSchema, submissionTypeSchema } from './contract';

const safePlainTextSchema = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value.trim().length > 0, 'Text must contain non-whitespace content.')
    .refine((value) => !/[<>]/.test(value), 'HTML-like text is not accepted.');

export const submissionTerminalPublicMessageSchema = safePlainTextSchema(1_000);
export const submissionTerminalInternalNoteSchema = safePlainTextSchema(2_000);
export const submissionTerminalRequestFingerprintSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'Terminal-resolution fingerprints must be lowercase SHA-256 hex.');

export const submissionTerminalActionValues = [
  'not_approved',
  'duplicate',
  'no_change',
  'withdrawn',
] as const;
export const submissionTerminalActionSchema = z.enum(submissionTerminalActionValues);

export const submissionTerminalReasonCodeValues = [
  'insufficient_evidence',
  'unverifiable',
  'out_of_scope',
  'policy_not_met',
  'hold_expired',
  'duplicate_submission',
  'already_current',
  'no_material_difference',
  'submitter_requested',
  'superseded_by_submitter',
  'other',
] as const;
export const submissionTerminalReasonCodeSchema = z.enum(submissionTerminalReasonCodeValues);

export const submissionTerminalResolutionEventPayloadSchema = z
  .object({
    schemaVersion: z.literal('submission-terminal-resolution-event-v1'),
    requestFingerprint: submissionTerminalRequestFingerprintSchema,
    submissionType: submissionTypeSchema,
    action: submissionTerminalActionSchema,
    resolution: submissionResolutionSchema,
    reasonCode: submissionTerminalReasonCodeSchema,
    publicMessage: submissionTerminalPublicMessageSchema,
    internalNote: submissionTerminalInternalNoteSchema.nullable(),
    duplicateSubmissionId: z.uuid().nullable(),
    duplicateSubmissionPublicId: z
      .string()
      .regex(/^CPM-S-\d{4}-\d{6}$/)
      .nullable(),
  })
  .strict()
  .superRefine((payload, context) => {
    const expectedResolution = payload.action;
    if (payload.resolution !== expectedResolution) {
      context.addIssue({
        code: 'custom',
        path: ['resolution'],
        message: 'Terminal-resolution action and resolution must match.',
      });
    }
    const hasDuplicateReference =
      payload.duplicateSubmissionId !== null && payload.duplicateSubmissionPublicId !== null;
    if (payload.action === 'duplicate' && !hasDuplicateReference) {
      context.addIssue({
        code: 'custom',
        path: ['duplicateSubmissionId'],
        message: 'Duplicate terminal resolution requires an exact referenced Submission.',
      });
    }
    if (
      payload.action !== 'duplicate' &&
      (payload.duplicateSubmissionId !== null || payload.duplicateSubmissionPublicId !== null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['duplicateSubmissionId'],
        message: 'Only duplicate terminal resolution may retain a duplicate reference.',
      });
    }
  });

export type SubmissionTerminalResolutionEventPayload = z.infer<
  typeof submissionTerminalResolutionEventPayloadSchema
>;

export function serializeSubmissionTerminalResolutionEventPayload(
  payload: SubmissionTerminalResolutionEventPayload,
): string {
  return JSON.stringify(submissionTerminalResolutionEventPayloadSchema.parse(payload));
}

export function parseSubmissionTerminalResolutionEventPayload(
  value: string | null,
): SubmissionTerminalResolutionEventPayload | null {
  if (value === null) return null;
  try {
    return submissionTerminalResolutionEventPayloadSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}
