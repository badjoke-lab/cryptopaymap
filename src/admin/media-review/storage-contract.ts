import { z } from 'zod';
import type { MediaReviewDecisionCommand, MediaReviewDecisionReceipt } from './decision';

export const mediaStorageScopeSchema = z.enum(['private', 'public']);
export const mediaStorageOperationTypeSchema = z.enum(['publish', 'revoke']);

export const mediaStorageExpectationSchema = z
  .object({
    key: z.string().trim().min(1).max(1_024),
    mimeType: z.enum(['image/jpeg', 'image/webp']),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const inspectedMediaStorageObjectSchema = mediaStorageExpectationSchema.extend({
  byteSize: z.number().int().positive(),
});

export const mediaFileTransitionSchema = z
  .object({
    fileId: z.uuid(),
    fromScope: mediaStorageScopeSchema,
    fromKey: z.string().trim().min(1).max(1_024),
    toScope: mediaStorageScopeSchema,
    toKey: z.string().trim().min(1).max(1_024),
  })
  .strict();

export const mediaStorageOperationSchema = z
  .object({
    type: mediaStorageOperationTypeSchema,
    fileId: z.uuid(),
    source: mediaStorageExpectationSchema,
    destination: mediaStorageExpectationSchema,
  })
  .strict();

export const mediaStoragePlanSchema = z
  .object({
    mediaAssetId: z.uuid(),
    action: z.enum(['approve_private', 'approve_public', 'reject', 'restrict', 'supersede']),
    operations: z.array(mediaStorageOperationSchema).max(3),
    transitions: z.array(mediaFileTransitionSchema).max(3),
  })
  .strict();

export type MediaStorageExpectation = z.infer<typeof mediaStorageExpectationSchema>;
export type InspectedMediaStorageObject = z.infer<typeof inspectedMediaStorageObjectSchema>;
export type MediaFileTransition = z.infer<typeof mediaFileTransitionSchema>;
export type MediaStorageOperation = z.infer<typeof mediaStorageOperationSchema>;
export type MediaStoragePlan = z.infer<typeof mediaStoragePlanSchema>;

export type StoragePreparedMediaReviewCommand = MediaReviewDecisionCommand & {
  fileTransitions?: MediaFileTransition[];
};

export interface MediaStorageAdapter {
  inspectPrivateObject(key: string): Promise<InspectedMediaStorageObject | null>;
  publishObject(sourceKey: string, destination: MediaStorageExpectation): Promise<void>;
  revokePublicObject(key: string): Promise<void>;
}

export interface MediaStorageAwareDecisionBackend {
  commitDecision(command: MediaReviewDecisionCommand): Promise<MediaReviewDecisionReceipt>;
}

export type MediaStorageErrorCode =
  | 'invalid_plan'
  | 'source_missing'
  | 'source_mismatch'
  | 'publish_failed'
  | 'cleanup_failed'
  | 'revoke_failed';

export class MediaStorageError extends Error {
  readonly code: MediaStorageErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: MediaStorageErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MediaStorageError';
    this.code = code;
    this.issues = issues;
  }
}
