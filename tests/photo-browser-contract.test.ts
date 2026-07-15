import { describe, expect, it } from 'vitest';
import {
  buildPhotosSubmissionIntakeFromBrowserForm,
  buildPhotoUploadAuthorizationFromBrowserForm,
  emptyPhotoBrowserFormValues,
  type PhotoBrowserFormValues,
} from '../src/submissions/photo-browser-contract';

const intakeRequestId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';
const quarantineUploadId = '30000000-0000-4000-8000-000000000001';

function validValues(): PhotoBrowserFormValues {
  const values = emptyPhotoBrowserFormValues('location', targetId);
  values.relationship = 'customer';
  values.contactEmail = 'person@example.com';
  values.contactAllowed = true;
  values.privacyNoticeAccepted = true;
  values.submissionTermsAccepted = true;
  values.media = [
    {
      browserId: 'browser-photo-1',
      file: { name: 'shop.jpg', type: 'image/jpeg', size: 1_024 },
      role: 'exterior',
      capturedAt: '2026-07-15',
      description: 'Storefront with a crypto payment sign.',
      suggestedAltText: 'Storefront displaying a crypto payment sign.',
      photographerPresent: true,
      rightsStatus: 'submitted_with_permission',
      rightsHolderPresent: true,
      permissionReferencePresent: false,
      licenseName: '',
      licenseUrl: '',
    },
  ];
  return values;
}

describe('Photos browser contract', () => {
  it('builds the exact upload authorization without filenames or browser-only fields', () => {
    const authorization = buildPhotoUploadAuthorizationFromBrowserForm(
      validValues(),
      intakeRequestId,
    );

    expect(authorization).toEqual({
      schemaVersion: 'photo-upload-authorization-v1',
      intakeRequestId,
      targetType: 'location',
      targetId,
      media: [
        {
          purpose: 'public_gallery_candidate',
          declaredMimeType: 'image/jpeg',
          declaredByteSize: 1_024,
        },
      ],
    });
    expect(JSON.stringify(authorization)).not.toContain('shop.jpg');
  });

  it('builds a strict private Photos Submission from completed opaque reservations', () => {
    const submission = buildPhotosSubmissionIntakeFromBrowserForm(validValues(), [
      {
        quarantineUploadId,
        declaredMimeType: 'image/jpeg',
        declaredByteSize: 1_024,
      },
    ]);

    expect(submission.submissionType).toBe('photos');
    expect(submission.originalPayload.media[0]?.quarantineUploadId).toBe(quarantineUploadId);
    expect(submission.originalPayload.media[0]?.role).toBe('exterior');
    expect(submission.originalPayload.media[0]?.rights.publicDisplayPermission).toBe(true);
    expect(submission.contact).toEqual({
      email: 'person@example.com',
      contactAllowed: true,
    });
    const serialized = JSON.stringify(submission);
    expect(serialized).not.toContain('shop.jpg');
    expect(serialized).not.toContain('uploadUrl');
    expect(serialized).not.toContain('requiredHeaders');
  });

  it('rejects a reservation that does not match the selected file declaration', () => {
    expect(() =>
      buildPhotosSubmissionIntakeFromBrowserForm(validValues(), [
        {
          quarantineUploadId,
          declaredMimeType: 'image/png',
          declaredByteSize: 1_024,
        },
      ]),
    ).toThrow('does not match');
  });

  it('rejects invalid rights declarations through the authoritative domain schema', () => {
    const values = validValues();
    values.media[0] = {
      ...values.media[0]!,
      rightsHolderPresent: false,
      permissionReferencePresent: false,
    };

    expect(() =>
      buildPhotosSubmissionIntakeFromBrowserForm(values, [
        {
          quarantineUploadId,
          declaredMimeType: 'image/jpeg',
          declaredByteSize: 1_024,
        },
      ]),
    ).toThrow();
  });

  it('rejects more than eight selected photos before authorization', () => {
    const values = validValues();
    values.media = Array.from({ length: 9 }, (_, index) => ({
      ...values.media[0]!,
      file: { name: `${index}.jpg`, type: 'image/jpeg', size: 100 },
    }));

    expect(() => buildPhotoUploadAuthorizationFromBrowserForm(values, intakeRequestId)).toThrow();
  });
});
