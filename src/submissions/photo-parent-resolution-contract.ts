import { z } from 'zod';

const safePlainTextSchema = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value.trim().length > 0, 'Text must contain non-whitespace content.')
    .refine((value) => !/[<>]/.test(value), 'HTML-like text is not accepted.');

export const photoParentResolutionPublicMessageSchema = safePlainTextSchema(1_000);
export const photoParentResolutionInternalNoteSchema = safePlainTextSchema(2_000);
export const photoParentResolutionFingerprintSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'Photos parent-resolution fingerprints must be lowercase SHA-256 hex.');
export const photoParentResolutionValueSchema = z.enum([
  'approved',
  'partially_approved',
  'not_approved',
]);
export const photoParentResolutionReasonCodeSchema = z.enum([
  'all_media_approved',
  'media_partially_approved',
  'all_media_rejected',
]);
export const photoParentMediaPublicDecisionSchema = z.enum(['approved', 'rejected']);
export const photoParentMediaReferenceSchema = z
  .string()
  .min(8)
  .max(80)
  .regex(/^[A-Z0-9_-]+$/);

export const photoParentMediaDecisionSnapshotSchema = z
  .object({
    mediaReference: photoParentMediaReferenceSchema,
    mediaAssetId: z.uuid(),
    mediaUpdatedAt: z.iso.datetime({ offset: true }),
    decisionId: z.uuid(),
    decisionAction: z.enum(['approve_public', 'reject']),
    decisionDecidedAt: z.iso.datetime({ offset: true }),
    decision: photoParentMediaPublicDecisionSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (
      (snapshot.decisionAction === 'approve_public' && snapshot.decision !== 'approved') ||
      (snapshot.decisionAction === 'reject' && snapshot.decision !== 'rejected')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['decision'],
        message: 'Media review action and public decision must match.',
      });
    }
  });

export const photoParentResolutionEventPayloadSchema = z
  .object({
    schemaVersion: z.literal('photo-parent-resolution-event-v1'),
    requestFingerprint: photoParentResolutionFingerprintSchema,
    requestId: z.uuid(),
    submissionId: z.uuid(),
    expectedSubmissionUpdatedAt: z.iso.datetime({ offset: true }),
    handoffEventId: z.uuid(),
    resolution: photoParentResolutionValueSchema,
    reasonCode: photoParentResolutionReasonCodeSchema,
    publicMessage: photoParentResolutionPublicMessageSchema,
    internalNote: photoParentResolutionInternalNoteSchema.nullable(),
    media: z.array(photoParentMediaDecisionSnapshotSchema).min(1).max(8),
  })
  .strict()
  .superRefine((payload, context) => {
    const ids = payload.media.map((item) => item.mediaAssetId);
    const references = payload.media.map((item) => item.mediaReference);
    const decisions = payload.media.map((item) => item.decision);
    if (new Set(ids).size !== ids.length || new Set(references).size !== references.length) {
      context.addIssue({
        code: 'custom',
        path: ['media'],
        message: 'Photos parent Media decisions must be unique.',
      });
    }
    const approved = decisions.filter((decision) => decision === 'approved').length;
    const rejected = decisions.length - approved;
    const expectedResolution =
      rejected === 0 ? 'approved' : approved === 0 ? 'not_approved' : 'partially_approved';
    const expectedReason =
      rejected === 0
        ? 'all_media_approved'
        : approved === 0
          ? 'all_media_rejected'
          : 'media_partially_approved';
    if (payload.resolution !== expectedResolution || payload.reasonCode !== expectedReason) {
      context.addIssue({
        code: 'custom',
        path: ['resolution'],
        message: 'Photos parent outcome must match the complete child Media decision set.',
      });
    }
  });

export type PhotoParentMediaDecisionSnapshot = z.infer<
  typeof photoParentMediaDecisionSnapshotSchema
>;
export type PhotoParentResolutionEventPayload = z.infer<
  typeof photoParentResolutionEventPayloadSchema
>;

export function photoParentMediaReference(mediaAssetId: string): string {
  return photoParentMediaReferenceSchema.parse(
    `MEDIA-${z.uuid().parse(mediaAssetId).toUpperCase()}`,
  );
}

export function serializePhotoParentResolutionEventPayload(
  payload: PhotoParentResolutionEventPayload,
): string {
  return JSON.stringify(photoParentResolutionEventPayloadSchema.parse(payload));
}

export function parsePhotoParentResolutionEventPayload(
  value: string | null,
): PhotoParentResolutionEventPayload | null {
  if (value === null) return null;
  try {
    return photoParentResolutionEventPayloadSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}
