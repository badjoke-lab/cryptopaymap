import { z } from 'zod';
import { submissionPublicIdSchema } from './contract';
import {
  photosSubmissionIntakeSchema,
  publicGalleryMediaRoleSchema,
  submissionMediaMimeTypeSchema,
  type PhotosSubmissionIntake,
} from './photo-media-contract';

const maxPhotoBytes = 5_000_000;
const maxPhotoCount = 8;
const maxTotalPhotoBytes = 40_000_000;

const optionalTrimmed = (value: string): string | null => {
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
};

export const photoBrowserMediaValuesSchema = z
  .object({
    clientId: z.uuid(),
    declaredMimeType: submissionMediaMimeTypeSchema,
    declaredByteSize: z.number().int().min(1).max(maxPhotoBytes),
    role: publicGalleryMediaRoleSchema,
    capturedAt: z.string().max(10),
    description: z.string().max(1_000),
    suggestedAltText: z.string().max(500),
    photographerPresent: z.boolean(),
    rightsStatus: z.enum(['submitted_with_permission', 'licensed', 'public_domain']),
    rightsHolderPresent: z.boolean(),
    permissionReferencePresent: z.boolean(),
    licenseName: z.string().max(160),
    licenseUrl: z.string().max(2_048),
    publicDisplayPermission: z.boolean(),
  })
  .strict();

export const photoBrowserFormValuesSchema = z
  .object({
    targetType: z.enum(['entity', 'location']),
    targetId: z.string().max(64),
    relationship: z.enum([
      'customer',
      'employee',
      'owner_or_authorized_representative',
      'independent_researcher',
      'other',
    ]),
    contactEmail: z.string().max(320),
    contactAllowed: z.boolean(),
    submitterNote: z.string().max(2_000),
    privacyNoticeAccepted: z.boolean(),
    submissionTermsAccepted: z.boolean(),
    media: z.array(photoBrowserMediaValuesSchema).min(1).max(maxPhotoCount),
  })
  .strict()
  .superRefine((values, context) => {
    const total = values.media.reduce((sum, item) => sum + item.declaredByteSize, 0);
    if (total > maxTotalPhotoBytes) {
      context.addIssue({
        code: 'custom',
        path: ['media'],
        message: 'The selected photos exceed the 40 MB total limit.',
      });
    }
    const ids = new Set(values.media.map((item) => item.clientId));
    if (ids.size !== values.media.length) {
      context.addIssue({
        code: 'custom',
        path: ['media'],
        message: 'Each selected photo must have a unique browser identity.',
      });
    }
  });

export const photoBrowserAuthorizationRequestSchema = z
  .object({
    schemaVersion: z.literal('photo-upload-authorization-v1'),
    intakeRequestId: z.uuid(),
    targetType: z.enum(['entity', 'location']),
    targetId: z.uuid(),
    media: z
      .array(
        z
          .object({
            purpose: z.literal('public_gallery_candidate'),
            declaredMimeType: submissionMediaMimeTypeSchema,
            declaredByteSize: z.number().int().min(1).max(maxPhotoBytes),
          })
          .strict(),
      )
      .min(1)
      .max(maxPhotoCount),
  })
  .strict();

export const photoBrowserUploadAuthorizationReceiptSchema = z
  .object({
    schemaVersion: z.literal('photo-upload-authorization-receipt-v1'),
    state: z.enum(['committed', 'replayed']),
    intakeRequestId: z.uuid(),
    expiresAt: z.iso.datetime({ offset: true }),
    uploads: z
      .array(
        z
          .object({
            quarantineUploadId: z.uuid(),
            method: z.literal('PUT'),
            uploadUrl: z.url().refine((value) => value.startsWith('https://')),
            requiredHeaders: z.record(z.string().min(1), z.string().min(1)),
            declaredByteSize: z.number().int().min(1).max(maxPhotoBytes),
          })
          .strict(),
      )
      .min(1)
      .max(maxPhotoCount),
  })
  .strict();

export const photoBrowserPrivateReceiptSchema = z
  .object({
    submissionReference: submissionPublicIdSchema,
    statusSecret: z.string().min(1).max(512),
    submittedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type PhotoBrowserFormValues = z.infer<typeof photoBrowserFormValuesSchema>;
export type PhotoBrowserMediaValues = z.infer<typeof photoBrowserMediaValuesSchema>;
export type PhotoBrowserAuthorizationRequest = z.infer<
  typeof photoBrowserAuthorizationRequestSchema
>;
export type PhotoBrowserUploadAuthorizationReceipt = z.infer<
  typeof photoBrowserUploadAuthorizationReceiptSchema
>;
export type PhotoBrowserPrivateReceipt = z.infer<typeof photoBrowserPrivateReceiptSchema>;

export function emptyPhotoBrowserFormValues(
  targetType: PhotoBrowserFormValues['targetType'] = 'entity',
  targetId = '',
): PhotoBrowserFormValues {
  return {
    targetType,
    targetId,
    relationship: 'customer',
    contactEmail: '',
    contactAllowed: false,
    submitterNote: '',
    privacyNoticeAccepted: false,
    submissionTermsAccepted: false,
    media: [],
  };
}

export function detectPhotoDeclaredMimeType(file: {
  name: string;
  type: string;
}): z.infer<typeof submissionMediaMimeTypeSchema> | null {
  const direct = submissionMediaMimeTypeSchema.safeParse(file.type.toLowerCase());
  if (direct.success) return direct.data;

  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'heic') return 'image/heic';
  if (extension === 'heif') return 'image/heif';
  return null;
}

export function createPhotoBrowserMediaValues(
  clientId: string,
  declaredMimeType: z.infer<typeof submissionMediaMimeTypeSchema>,
  declaredByteSize: number,
): PhotoBrowserMediaValues {
  return photoBrowserMediaValuesSchema.parse({
    clientId,
    declaredMimeType,
    declaredByteSize,
    role: 'gallery',
    capturedAt: '',
    description: '',
    suggestedAltText: '',
    photographerPresent: false,
    rightsStatus: 'submitted_with_permission',
    rightsHolderPresent: false,
    permissionReferencePresent: false,
    licenseName: '',
    licenseUrl: '',
    publicDisplayPermission: false,
  });
}

export function buildPhotoAuthorizationRequest(
  requestId: string,
  rawValues: PhotoBrowserFormValues,
): PhotoBrowserAuthorizationRequest {
  const values = photoBrowserFormValuesSchema.parse(rawValues);
  return photoBrowserAuthorizationRequestSchema.parse({
    schemaVersion: 'photo-upload-authorization-v1',
    intakeRequestId: requestId,
    targetType: values.targetType,
    targetId: values.targetId.trim(),
    media: values.media.map((item) => ({
      purpose: 'public_gallery_candidate',
      declaredMimeType: item.declaredMimeType,
      declaredByteSize: item.declaredByteSize,
    })),
  });
}

export function buildPhotoSubmissionIntake(
  rawValues: PhotoBrowserFormValues,
  quarantineUploadIds: string[],
): PhotosSubmissionIntake {
  const values = photoBrowserFormValuesSchema.parse(rawValues);
  if (quarantineUploadIds.length !== values.media.length) {
    throw new Error('The upload reservation set does not match the selected photos.');
  }

  const contactEmail = optionalTrimmed(values.contactEmail);
  return photosSubmissionIntakeSchema.parse({
    schemaVersion: 'submission-common-v1',
    submissionType: 'photos',
    targetType: values.targetType,
    targetId: values.targetId.trim(),
    relationship: values.relationship,
    contact:
      contactEmail === null
        ? null
        : {
            email: contactEmail,
            contactAllowed: values.contactAllowed,
          },
    evidenceLinks: [],
    originalPayload: {
      schemaVersion: 'photo-media-v1',
      media: values.media.map((item, index) => ({
        quarantineUploadId: quarantineUploadIds[index],
        purpose: 'public_gallery_candidate',
        role: item.role,
        declaredMimeType: item.declaredMimeType,
        declaredByteSize: item.declaredByteSize,
        capturedAt: optionalTrimmed(item.capturedAt),
        description: optionalTrimmed(item.description),
        suggestedAltText: optionalTrimmed(item.suggestedAltText),
        photographerPresent: item.photographerPresent,
        rights: {
          rightsStatus: item.rightsStatus,
          rightsHolderPresent: item.rightsHolderPresent,
          permissionReferencePresent: item.permissionReferencePresent,
          licenseName: optionalTrimmed(item.licenseName),
          licenseUrl: optionalTrimmed(item.licenseUrl),
          publicDisplayPermission: item.publicDisplayPermission,
        },
      })),
      submitterNote: optionalTrimmed(values.submitterNote),
    },
    acknowledgements: {
      privacyNoticeAccepted: values.privacyNoticeAccepted,
      submissionTermsAccepted: values.submissionTermsAccepted,
    },
  });
}

export function browserPhotoValidationMessages(error: unknown): string[] {
  if (!(error instanceof z.ZodError)) return ['Check the photo form and try again.'];
  return [...new Set(error.issues.map((issue) => issue.message))].slice(0, 8);
}
