import {
  createPhotoPrivateIntakeHttpRuntimeFromEnvironment,
  createPhotoUploadAuthorizationHttpRuntimeFromEnvironment,
} from '../src/submissions/photo-http-environment';
import {
  createPhotoPrivateIntakeHttpHandler,
  createPhotoUploadAuthorizationHttpHandler,
  photoPrivateIntakeHttpRequestSchema,
  photoPrivateIntakeHttpResponseSchema,
  photoUploadAuthorizationHttpRequestSchema,
} from '../src/submissions/photo-http';

const requestId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';
const quarantineUploadId = '30000000-0000-4000-8000-000000000001';

photoUploadAuthorizationHttpRequestSchema.parse({
  challengeToken: 'turnstile-token',
  authorization: {
    schemaVersion: 'photo-upload-authorization-v1',
    intakeRequestId: requestId,
    targetType: 'location',
    targetId,
    media: [
      {
        purpose: 'public_gallery_candidate',
        declaredMimeType: 'image/jpeg',
        declaredByteSize: 1_000,
      },
    ],
  },
});

photoPrivateIntakeHttpRequestSchema.parse({
  challengeToken: 'turnstile-token',
  submission: {
    schemaVersion: 'submission-common-v1',
    submissionType: 'photos',
    targetType: 'location',
    targetId,
    relationship: 'customer',
    contact: null,
    evidenceLinks: [],
    originalPayload: {
      schemaVersion: 'photo-media-v1',
      media: [
        {
          quarantineUploadId,
          purpose: 'public_gallery_candidate',
          role: 'exterior',
          declaredMimeType: 'image/jpeg',
          declaredByteSize: 1_000,
          capturedAt: null,
          description: null,
          suggestedAltText: null,
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
  },
});

photoPrivateIntakeHttpResponseSchema.parse({
  submissionReference: 'CPM-S-2026-000123',
  statusSecret: 'cpmss_private-status-secret',
  submittedAt: '2026-07-15T07:00:00.000Z',
});

for (const executable of [
  createPhotoUploadAuthorizationHttpHandler,
  createPhotoPrivateIntakeHttpHandler,
  createPhotoUploadAuthorizationHttpRuntimeFromEnvironment,
  createPhotoPrivateIntakeHttpRuntimeFromEnvironment,
]) {
  if (typeof executable !== 'function') {
    throw new Error('Photos HTTP boundary is not executable.');
  }
}

console.log('Photos public HTTP boundary schemas passed.');
