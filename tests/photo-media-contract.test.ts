import { describe, expect, it } from 'vitest';
import {
  normalizePhotosSubmissionIntake,
  photosSubmissionIntakeSchema,
  submissionMediaItemSchema,
} from '../src/submissions/photo-media-contract';

const targetId = '10000000-0000-4000-8000-000000000001';
const uploadId = '20000000-0000-4000-8000-000000000001';

function galleryItem(overrides: Record<string, unknown> = {}) {
  return {
    quarantineUploadId: uploadId,
    purpose: 'public_gallery_candidate',
    role: 'exterior',
    declaredMimeType: 'image/jpeg',
    declaredByteSize: 1_250_000,
    capturedAt: '2026-07-10',
    description: 'Exterior of the listed business.',
    suggestedAltText: 'Storefront entrance viewed from the street.',
    photographerPresent: true,
    rights: {
      rightsStatus: 'submitted_with_permission',
      rightsHolderPresent: true,
      permissionReferencePresent: false,
      licenseName: null,
      licenseUrl: null,
      publicDisplayPermission: true,
    },
    ...overrides,
  };
}

function validIntake(media = [galleryItem()]) {
  return {
    schemaVersion: 'submission-common-v1',
    submissionType: 'photos',
    targetType: 'location',
    targetId,
    relationship: 'customer',
    contact: {
      email: 'photographer@example.test',
      contactAllowed: true,
    },
    evidenceLinks: [],
    originalPayload: {
      schemaVersion: 'photo-media-v1',
      media,
      submitterNote: 'The image was taken during a recent visit.',
    },
    acknowledgements: {
      privacyNoticeAccepted: true,
      submissionTermsAccepted: true,
    },
  };
}

describe('P5-05A Photo and Media submission contract', () => {
  it('normalizes a target-aware public-gallery candidate without contact or storage secrets', () => {
    const projection = normalizePhotosSubmissionIntake(validIntake());
    expect(projection).toMatchObject({
      targetType: 'location',
      targetId,
      relationship: 'customer',
      media: [
        {
          quarantineUploadId: uploadId,
          purpose: 'public_gallery_candidate',
          role: 'exterior',
          declaredMimeType: 'image/jpeg',
          declaredByteSize: 1_250_000,
          rightsStatus: 'submitted_with_permission',
          publicDisplayPermission: true,
        },
      ],
    });
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain('photographer@example.test');
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('signedUrl');
    expect(serialized).not.toContain('originalFilename');
    expect(serialized).not.toContain('exif');
    expect(serialized).not.toContain('gps');
    expect(serialized).not.toContain('statusToken');
  });

  it('defines evidence and owner-proof items but keeps them private-purpose only', () => {
    expect(
      submissionMediaItemSchema.parse({
        ...galleryItem(),
        purpose: 'evidence_image',
        role: 'evidence_image',
        rights: {
          rightsStatus: 'restricted',
          rightsHolderPresent: false,
          permissionReferencePresent: false,
          licenseName: null,
          licenseUrl: null,
          publicDisplayPermission: false,
        },
      }),
    ).toMatchObject({ purpose: 'evidence_image', role: 'evidence_image' });
    expect(
      submissionMediaItemSchema.parse({
        ...galleryItem(),
        purpose: 'owner_verification_proof',
        role: 'owner_verification_proof',
        rights: {
          rightsStatus: 'restricted',
          rightsHolderPresent: false,
          permissionReferencePresent: false,
          licenseName: null,
          licenseUrl: null,
          publicDisplayPermission: false,
        },
      }),
    ).toMatchObject({
      purpose: 'owner_verification_proof',
      role: 'owner_verification_proof',
    });
  });

  it('rejects evidence or owner-proof media on the Photos route', () => {
    const result = photosSubmissionIntakeSchema.safeParse(
      validIntake([
        {
          ...galleryItem(),
          purpose: 'evidence_image',
          role: 'evidence_image',
          rights: {
            rightsStatus: 'restricted',
            rightsHolderPresent: false,
            permissionReferencePresent: false,
            licenseName: null,
            licenseUrl: null,
            publicDisplayPermission: false,
          },
        },
      ]),
    );
    expect(result.success).toBe(false);
  });

  it('rejects role-purpose mismatches and non-publishable gallery rights', () => {
    expect(
      submissionMediaItemSchema.safeParse(galleryItem({ role: 'owner_verification_proof' }))
        .success,
    ).toBe(false);
    expect(
      submissionMediaItemSchema.safeParse(
        galleryItem({
          rights: {
            rightsStatus: 'restricted',
            rightsHolderPresent: false,
            permissionReferencePresent: false,
            licenseName: null,
            licenseUrl: null,
            publicDisplayPermission: true,
          },
        }),
      ).success,
    ).toBe(false);
  });

  it('rejects unsupported formats, oversized files, duplicate uploads, and more than eight items', () => {
    expect(
      submissionMediaItemSchema.safeParse(galleryItem({ declaredMimeType: 'image/svg+xml' }))
        .success,
    ).toBe(false);
    expect(
      submissionMediaItemSchema.safeParse(galleryItem({ declaredByteSize: 5_000_001 })).success,
    ).toBe(false);
    expect(
      photosSubmissionIntakeSchema.safeParse(validIntake([galleryItem(), galleryItem()])).success,
    ).toBe(false);
    const nine = Array.from({ length: 9 }, (_, index) =>
      galleryItem({
        quarantineUploadId: `20000000-0000-4000-8000-${(index + 1).toString().padStart(12, '0')}`,
      }),
    );
    expect(photosSubmissionIntakeSchema.safeParse(validIntake(nine)).success).toBe(false);
  });

  it('rejects private storage, filename, EXIF, GPS, wallet, or receipt fields', () => {
    for (const forbidden of [
      { storageKey: 'quarantine/private/object' },
      { signedUrl: 'https://private.example.test/object?token=secret' },
      { originalFilename: 'receipt-wallet-address.jpg' },
      { exif: { camera: 'secret-device' } },
      { gps: { latitude: 35, longitude: 139 } },
      { walletAddress: 'rPrivateAddress' },
      { receiptData: 'customer-name' },
    ]) {
      expect(
        photosSubmissionIntakeSchema.safeParse(validIntake([galleryItem(forbidden)])).success,
      ).toBe(false);
    }
  });
});
