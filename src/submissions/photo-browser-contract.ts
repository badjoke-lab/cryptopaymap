import { z } from 'zod';
import {
  photosSubmissionIntakeSchema,
  publicGalleryMediaRoleSchema,
  submissionMediaMimeTypeSchema,
  type PhotosSubmissionIntake,
} from './photo-media-contract';
import {
  photoUploadAuthorizationReceiptSchema,
  photoUploadAuthorizationRequestSchema,
  type PhotoUploadAuthorizationReceipt,
  type PhotoUploadAuthorizationRequest,
} from './photo-upload-authorization';

const optionalTrimmed = (value: string): string | null => {
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
};

export interface PhotoBrowserFile {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

export interface PhotoBrowserMediaValues {
  file: PhotoBrowserFile;
  role: z.infer<typeof publicGalleryMediaRoleSchema>;
  capturedAt: string;
  description: string;
  suggestedAltText: string;
  photographerPresent: boolean;
  rightsStatus: 'submitted_with_permission' | 'licensed' | 'public_domain';
  rightsHolderPresent: boolean;
  permissionReferencePresent: boolean;
  licenseName: string;
  licenseUrl: string;
}

export interface PhotoBrowserFormValues {
  targetType: 'entity' | 'location';
  targetId: string;
  relationship:
    | 'customer'
    | 'employee'
    | 'owner_or_authorized_representative'
    | 'independent_researcher'
    | 'other';
  contactEmail: string;
  contactAllowed: boolean;
  submitterNote: string;
  privacyNoticeAccepted: boolean;
  submissionTermsAccepted: boolean;
  media: PhotoBrowserMediaValues[];
}

export type PhotoSubmissionIntake = PhotosSubmissionIntake;
export type PhotoUploadAuthorization = PhotoUploadAuthorizationRequest;
export type PhotoUploadReceipt = PhotoUploadAuthorizationReceipt;

export interface PhotoUploadedReservation {
  quarantineUploadId: string;
  declaredMimeType: z.infer<typeof submissionMediaMimeTypeSchema>;
  declaredByteSize: number;
}

export function emptyPhotoBrowserFormValues(
  targetType: PhotoBrowserFormValues['targetType'] = 'location',
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

function declaredMimeType(file: PhotoBrowserFile) {
  return submissionMediaMimeTypeSchema.parse(file.type.toLowerCase());
}

function assertMediaCount(media: PhotoBrowserMediaValues[]): void {
  if (media.length < 1 || media.length > 8) {
    throw new z.ZodError([
      {
        code: 'custom',
        path: ['media'],
        message: 'Choose between one and eight photos.',
        input: media,
      },
    ]);
  }
}

export function buildPhotoUploadAuthorizationFromBrowserForm(
  values: PhotoBrowserFormValues,
  intakeRequestId: string,
): PhotoUploadAuthorizationRequest {
  assertMediaCount(values.media);
  return photoUploadAuthorizationRequestSchema.parse({
    schemaVersion: 'photo-upload-authorization-v1',
    intakeRequestId,
    targetType: values.targetType,
    targetId: values.targetId.trim(),
    media: values.media.map(({ file }) => ({
      purpose: 'public_gallery_candidate',
      declaredMimeType: declaredMimeType(file),
      declaredByteSize: file.size,
    })),
  });
}

export function parsePhotoUploadReceipt(raw: unknown): PhotoUploadAuthorizationReceipt {
  return photoUploadAuthorizationReceiptSchema.parse(raw);
}

export function buildPhotosSubmissionIntakeFromBrowserForm(
  values: PhotoBrowserFormValues,
  uploads: PhotoUploadedReservation[],
): PhotosSubmissionIntake {
  assertMediaCount(values.media);
  if (uploads.length !== values.media.length) {
    throw new Error('Every selected photo must have one completed private upload.');
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
      media: values.media.map((item, index) => {
        const upload = uploads[index];
        if (upload === undefined) throw new Error('A private upload reservation is missing.');
        const mimeType = declaredMimeType(item.file);
        if (upload.declaredMimeType !== mimeType || upload.declaredByteSize !== item.file.size) {
          throw new Error('The private upload receipt does not match the selected photo.');
        }
        return {
          quarantineUploadId: upload.quarantineUploadId,
          purpose: 'public_gallery_candidate',
          role: item.role,
          declaredMimeType: mimeType,
          declaredByteSize: item.file.size,
          capturedAt: optionalTrimmed(item.capturedAt),
          description: optionalTrimmed(item.description),
          suggestedAltText: optionalTrimmed(item.suggestedAltText),
          photographerPresent: item.photographerPresent,
          rights: {
            rightsStatus: item.rightsStatus,
            rightsHolderPresent: item.rightsHolderPresent,
            permissionReferencePresent: item.permissionReferencePresent,
            licenseName:
              item.rightsStatus === 'licensed' ? optionalTrimmed(item.licenseName) : null,
            licenseUrl:
              item.rightsStatus === 'licensed' ? optionalTrimmed(item.licenseUrl) : null,
            publicDisplayPermission: true,
          },
        };
      }),
      submitterNote: optionalTrimmed(values.submitterNote),
    },
    acknowledgements: {
      privacyNoticeAccepted: values.privacyNoticeAccepted,
      submissionTermsAccepted: values.submissionTermsAccepted,
    },
  });
}

export function browserPhotoValidationMessages(error: unknown): string[] {
  if (!(error instanceof z.ZodError)) {
    return [error instanceof Error ? error.message : 'Check the photos form and try again.'];
  }
  return [...new Set(error.issues.map((issue) => issue.message))].slice(0, 8);
}
