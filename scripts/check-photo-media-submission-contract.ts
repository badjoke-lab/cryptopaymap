import {
  normalizePhotosSubmissionIntake,
  photosReviewProjectionSchema,
  photosSubmissionIntakeSchema,
  submissionMediaItemSchema,
} from '../src/submissions/photo-media-contract';
import './check-photo-private-intake';

const intake = {
  schemaVersion: 'submission-common-v1',
  submissionType: 'photos',
  targetType: 'location',
  targetId: '10000000-0000-4000-8000-000000000001',
  relationship: 'customer',
  contact: null,
  evidenceLinks: [],
  originalPayload: {
    schemaVersion: 'photo-media-v1',
    media: [
      {
        quarantineUploadId: '20000000-0000-4000-8000-000000000001',
        purpose: 'public_gallery_candidate',
        role: 'exterior',
        declaredMimeType: 'image/jpeg',
        declaredByteSize: 1000,
        capturedAt: '2026-07-14',
        description: 'Exterior image.',
        suggestedAltText: 'Storefront exterior.',
        photographerPresent: true,
        rights: {
          rightsStatus: 'submitted_with_permission',
          rightsHolderPresent: true,
          permissionReferencePresent: false,
          licenseName: null,
          licenseUrl: null,
          publicDisplayPermission: true,
        },
      },
    ],
    submitterNote: null,
  },
  acknowledgements: {
    privacyNoticeAccepted: true,
    submissionTermsAccepted: true,
  },
};

const parsed = photosSubmissionIntakeSchema.parse(intake);
const projection = normalizePhotosSubmissionIntake(parsed);
photosReviewProjectionSchema.parse(projection);

if (submissionMediaItemSchema.safeParse({}).success) {
  throw new Error('Photo and Media item schema accepted an empty item.');
}
if (JSON.stringify(projection).includes('storageKey')) {
  throw new Error('Photo and Media review projection exposed a storage key.');
}

console.log('Photo and Media submission contract checks passed.');
