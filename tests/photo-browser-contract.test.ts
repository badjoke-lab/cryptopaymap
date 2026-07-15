import { describe, expect, it } from 'vitest';
import {
  buildPhotoAuthorizationRequest,
  buildPhotoSubmissionIntake,
  createPhotoBrowserMediaValues,
  detectPhotoDeclaredMimeType,
  emptyPhotoBrowserFormValues,
  photoBrowserFormValuesSchema,
} from '../src/submissions/photo-browser-contract';

const requestId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';
const clientId = '30000000-0000-4000-8000-000000000001';
const reservationId = '40000000-0000-4000-8000-000000000001';

function validValues() {
  const values = emptyPhotoBrowserFormValues('location', targetId);
  values.relationship = 'customer';
  values.contactEmail = 'reviewer@example.com';
  values.contactAllowed = true;
  values.submitterNote = 'The photo shows the checkout counter.';
  values.privacyNoticeAccepted = true;
  values.submissionTermsAccepted = true;
  const media = createPhotoBrowserMediaValues(clientId, 'image/jpeg', 1_024);
  media.role = 'checkout_terminal';
  media.capturedAt = '2026-07-15';
  media.description = 'Checkout terminal at the existing location.';
  media.suggestedAltText = 'A checkout terminal beside the register.';
  media.photographerPresent = true;
  media.rightsHolderPresent = true;
  media.publicDisplayPermission = true;
  values.media = [media];
  return values;
}

describe('P5-05H Photos browser contract', () => {
  it('builds one authorization and private Photos intake without original filenames', () => {
    const values = validValues();
    const authorization = buildPhotoAuthorizationRequest(requestId, values);
    expect(authorization).toEqual({
      schemaVersion: 'photo-upload-authorization-v1',
      intakeRequestId: requestId,
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

    const submission = buildPhotoSubmissionIntake(values, [reservationId]);
    expect(submission.originalPayload.media[0]).toMatchObject({
      quarantineUploadId: reservationId,
      purpose: 'public_gallery_candidate',
      role: 'checkout_terminal',
      declaredMimeType: 'image/jpeg',
      declaredByteSize: 1_024,
    });
    const serialized = JSON.stringify({ authorization, submission });
    expect(serialized).not.toContain('filename');
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('uploadUrl');
    expect(serialized).not.toContain('wallet');
  });

  it('detects supported declared types without trusting unsupported extensions', () => {
    expect(detectPhotoDeclaredMimeType({ name: 'counter.JPG', type: '' })).toBe('image/jpeg');
    expect(detectPhotoDeclaredMimeType({ name: 'counter.heic', type: '' })).toBe('image/heic');
    expect(detectPhotoDeclaredMimeType({ name: 'counter.bin', type: 'application/octet-stream' })).toBe(
      null,
    );
  });

  it('rejects mismatched reservation sets and incomplete rights declarations', () => {
    const values = validValues();
    expect(() => buildPhotoSubmissionIntake(values, [])).toThrow(/reservation set/i);

    values.media[0]!.publicDisplayPermission = false;
    expect(() => buildPhotoSubmissionIntake(values, [reservationId])).toThrow();
  });

  it('enforces the eight-file and forty-megabyte browser boundary', () => {
    const values = validValues();
    values.media = Array.from({ length: 8 }, (_, index) => ({
      ...values.media[0]!,
      clientId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      declaredByteSize: 5_000_000,
    }));
    expect(photoBrowserFormValuesSchema.parse(values).media).toHaveLength(8);

    values.media[0]!.declaredByteSize = 5_000_001;
    expect(photoBrowserFormValuesSchema.safeParse(values).success).toBe(false);
  });
});
