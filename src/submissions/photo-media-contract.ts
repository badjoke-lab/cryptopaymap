import { z } from 'zod';
import { mediaRightsStatusValues, mediaRoleValues } from '../db/schema/media-legacy';
import { dateOnlySchema, httpsUrlSchema } from '../schemas/core';
import { commonSubmissionIntakeSchema, type CommonSubmissionIntake } from './contract';

const boundedPlainText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !/[<>]/.test(value), 'HTML-like text is not accepted.');

export const submissionMediaPurposeValues = [
  'evidence_image',
  'owner_verification_proof',
  'public_gallery_candidate',
] as const;
export const submissionMediaPurposeSchema = z.enum(submissionMediaPurposeValues);

export const submissionMediaMimeTypeValues = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;
export const submissionMediaMimeTypeSchema = z.enum(submissionMediaMimeTypeValues);

export const publicGalleryMediaRoleValues = [
  'cover',
  'gallery',
  'exterior',
  'interior',
  'product',
  'menu',
  'payment_sign',
  'checkout_terminal',
] as const;
export const publicGalleryMediaRoleSchema = z.enum(publicGalleryMediaRoleValues);

export const submissionMediaRoleSchema = z.enum(mediaRoleValues);
export const submissionMediaRightsStatusSchema = z.enum(mediaRightsStatusValues);

export const submissionMediaRightsDeclarationSchema = z
  .object({
    rightsStatus: submissionMediaRightsStatusSchema,
    rightsHolderPresent: z.boolean(),
    permissionReferencePresent: z.boolean(),
    licenseName: boundedPlainText(160).nullable(),
    licenseUrl: httpsUrlSchema.nullable(),
    publicDisplayPermission: z.boolean(),
  })
  .strict()
  .superRefine((rights, context) => {
    if (rights.rightsStatus === 'submitted_with_permission') {
      if (!rights.rightsHolderPresent && !rights.permissionReferencePresent) {
        context.addIssue({
          code: 'custom',
          message: 'Submitted permission requires a rights holder or permission reference.',
        });
      }
      if (rights.licenseName !== null || rights.licenseUrl !== null) {
        context.addIssue({
          code: 'custom',
          path: ['licenseName'],
          message: 'Submitted permission must not also claim a license.',
        });
      }
    }
    if (rights.rightsStatus === 'licensed') {
      if (rights.licenseName === null || rights.licenseUrl === null) {
        context.addIssue({
          code: 'custom',
          path: ['licenseName'],
          message: 'Licensed media requires a license name and URL.',
        });
      }
    } else if (rights.licenseName !== null || rights.licenseUrl !== null) {
      context.addIssue({
        code: 'custom',
        path: ['licenseName'],
        message: 'License metadata is only accepted for licensed media.',
      });
    }
  });

export const submissionMediaItemSchema = z
  .object({
    quarantineUploadId: z.uuid(),
    purpose: submissionMediaPurposeSchema,
    role: submissionMediaRoleSchema,
    declaredMimeType: submissionMediaMimeTypeSchema,
    declaredByteSize: z.number().int().min(1).max(5_000_000),
    capturedAt: dateOnlySchema.nullable(),
    description: boundedPlainText(1_000).nullable(),
    suggestedAltText: boundedPlainText(500).nullable(),
    photographerPresent: z.boolean(),
    rights: submissionMediaRightsDeclarationSchema,
  })
  .strict()
  .superRefine((item, context) => {
    if (item.purpose === 'evidence_image') {
      if (item.role !== 'evidence_image') {
        context.addIssue({
          code: 'custom',
          path: ['role'],
          message: 'Evidence images must use the evidence_image role.',
        });
      }
      if (item.rights.publicDisplayPermission) {
        context.addIssue({
          code: 'custom',
          path: ['rights', 'publicDisplayPermission'],
          message: 'Evidence-image intake does not grant public-display permission.',
        });
      }
    }
    if (item.purpose === 'owner_verification_proof') {
      if (item.role !== 'owner_verification_proof') {
        context.addIssue({
          code: 'custom',
          path: ['role'],
          message: 'Owner-verification proof must use the owner_verification_proof role.',
        });
      }
      if (item.rights.publicDisplayPermission) {
        context.addIssue({
          code: 'custom',
          path: ['rights', 'publicDisplayPermission'],
          message: 'Owner-verification proof is never public-gallery permission.',
        });
      }
    }
    if (item.purpose === 'public_gallery_candidate') {
      if (!publicGalleryMediaRoleSchema.safeParse(item.role).success) {
        context.addIssue({
          code: 'custom',
          path: ['role'],
          message: 'Public-gallery candidates require a public gallery role.',
        });
      }
      if (!item.rights.publicDisplayPermission) {
        context.addIssue({
          code: 'custom',
          path: ['rights', 'publicDisplayPermission'],
          message: 'Public-gallery candidates require explicit public-display permission.',
        });
      }
      if (
        !['submitted_with_permission', 'licensed', 'public_domain'].includes(
          item.rights.rightsStatus,
        )
      ) {
        context.addIssue({
          code: 'custom',
          path: ['rights', 'rightsStatus'],
          message: 'Public-gallery candidates require a publishable declared rights basis.',
        });
      }
    }
  });

export const photosOriginalPayloadSchema = z
  .object({
    schemaVersion: z.literal('photo-media-v1'),
    media: z.array(submissionMediaItemSchema).min(1).max(8),
    submitterNote: boundedPlainText(2_000).nullable(),
  })
  .strict()
  .superRefine((payload, context) => {
    const seen = new Set<string>();
    payload.media.forEach((item, index) => {
      if (item.purpose !== 'public_gallery_candidate') {
        context.addIssue({
          code: 'custom',
          path: ['media', index, 'purpose'],
          message: 'The Photos route accepts public-gallery candidates only.',
        });
      }
      if (seen.has(item.quarantineUploadId)) {
        context.addIssue({
          code: 'custom',
          path: ['media', index, 'quarantineUploadId'],
          message: 'A quarantine upload may appear only once in a Submission.',
        });
      }
      seen.add(item.quarantineUploadId);
    });
  });

export const photosSubmissionIntakeSchema = commonSubmissionIntakeSchema
  .safeExtend({
    submissionType: z.literal('photos'),
    targetType: z.enum(['entity', 'location']),
    targetId: z.uuid(),
    relationship: z.enum([
      'customer',
      'employee',
      'owner_or_authorized_representative',
      'independent_researcher',
      'other',
    ]),
    evidenceLinks: z.tuple([]),
    originalPayload: photosOriginalPayloadSchema,
  })
  .strict();

export const photoMediaReviewItemSchema = z
  .object({
    quarantineUploadId: z.uuid(),
    purpose: z.literal('public_gallery_candidate'),
    role: publicGalleryMediaRoleSchema,
    declaredMimeType: submissionMediaMimeTypeSchema,
    declaredByteSize: z.number().int().min(1).max(5_000_000),
    capturedAt: dateOnlySchema.nullable(),
    description: boundedPlainText(1_000).nullable(),
    suggestedAltText: boundedPlainText(500).nullable(),
    photographerPresent: z.boolean(),
    rightsStatus: z.enum(['submitted_with_permission', 'licensed', 'public_domain']),
    rightsHolderPresent: z.boolean(),
    permissionReferencePresent: z.boolean(),
    licenseName: boundedPlainText(160).nullable(),
    licenseUrl: httpsUrlSchema.nullable(),
    publicDisplayPermission: z.literal(true),
  })
  .strict();

export const photosReviewProjectionSchema = z
  .object({
    targetType: z.enum(['entity', 'location']),
    targetId: z.uuid(),
    relationship: z.enum([
      'customer',
      'employee',
      'owner_or_authorized_representative',
      'independent_researcher',
      'other',
    ]),
    media: z.array(photoMediaReviewItemSchema).min(1).max(8),
    submitterNote: boundedPlainText(2_000).nullable(),
  })
  .strict();

export type SubmissionMediaItem = z.infer<typeof submissionMediaItemSchema>;
export type PhotosSubmissionIntake = z.infer<typeof photosSubmissionIntakeSchema>;
export type PhotosReviewProjection = z.infer<typeof photosReviewProjectionSchema>;

export function normalizeParsedPhotosSubmissionIntake(
  intake: PhotosSubmissionIntake,
): PhotosReviewProjection {
  return photosReviewProjectionSchema.parse({
    targetType: intake.targetType,
    targetId: intake.targetId,
    relationship: intake.relationship,
    media: intake.originalPayload.media.map((item) => ({
      quarantineUploadId: item.quarantineUploadId,
      purpose: item.purpose,
      role: item.role,
      declaredMimeType: item.declaredMimeType,
      declaredByteSize: item.declaredByteSize,
      capturedAt: item.capturedAt,
      description: item.description,
      suggestedAltText: item.suggestedAltText,
      photographerPresent: item.photographerPresent,
      rightsStatus: item.rights.rightsStatus,
      rightsHolderPresent: item.rights.rightsHolderPresent,
      permissionReferencePresent: item.rights.permissionReferencePresent,
      licenseName: item.rights.licenseName,
      licenseUrl: item.rights.licenseUrl,
      publicDisplayPermission: item.rights.publicDisplayPermission,
    })),
    submitterNote: intake.originalPayload.submitterNote,
  });
}

export function normalizePhotosSubmissionIntake(raw: unknown): PhotosReviewProjection {
  return normalizeParsedPhotosSubmissionIntake(photosSubmissionIntakeSchema.parse(raw));
}

export type PhotoMediaCommonSubmission = CommonSubmissionIntake;
