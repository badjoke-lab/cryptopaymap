import { describe, expect, it } from 'vitest';
import { createPhotoPostIntakeObjectValidationService } from '../src/submissions/photo-post-intake-object-validation';
import type { PhotoQuarantineObjectStore } from '../src/submissions/photo-object-validation';
import {
  photoQuarantineObjectKey,
  type PhotoUploadReservationRecord,
} from '../src/submissions/photo-upload-authorization';

const submissionId = '10000000-0000-4000-8000-000000000001';
const intakeRequestId = '20000000-0000-4000-8000-000000000001';
const targetId = '30000000-0000-4000-8000-000000000001';
const quarantineUploadId = '40000000-0000-4000-8000-000000000001';
const consumedAt = '2026-07-15T00:05:00.000Z';
const validatedAt = new Date('2026-07-15T00:06:00.000Z');

function uint32Be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function ascii(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: number[]): number[] {
  const typeBytes = ascii(type);
  return [
    ...uint32Be(data.length),
    ...typeBytes,
    ...data,
    ...uint32Be(crc32(Uint8Array.from([...typeBytes, ...data]))),
  ];
}

function png(width: number, height: number): Uint8Array<ArrayBuffer> {
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...pngChunk('IHDR', [...uint32Be(width), ...uint32Be(height), 8, 2, 0, 0, 0]),
    ...pngChunk('IDAT', [0]),
    ...pngChunk('IEND', []),
  ]);
}

function reservation(
  overrides: Partial<PhotoUploadReservationRecord> = {},
): PhotoUploadReservationRecord {
  return {
    id: quarantineUploadId,
    intakeRequestId,
    purpose: 'public_gallery_candidate',
    expiresAt: '2026-07-15T00:10:00.000Z',
    consumedBySubmissionId: submissionId,
    consumedAt,
    createdAt: '2026-07-15T00:00:00.000Z',
    ...overrides,
  };
}

function request(byteSize: number) {
  return {
    schemaVersion: 'photo-object-validation-v1' as const,
    intakeRequestId,
    targetType: 'location' as const,
    targetId,
    media: [
      {
        quarantineUploadId,
        purpose: 'public_gallery_candidate' as const,
        declaredMimeType: 'image/png' as const,
        declaredByteSize: byteSize,
      },
    ],
  };
}

function objectStore(body: Uint8Array): PhotoQuarantineObjectStore {
  return {
    async readPrivateObject(key) {
      return {
        key,
        body,
        byteSize: body.byteLength,
        contentType: 'image/png',
        customMetadata: {
          'cpm-schema-version': 'photo-upload-v1',
          'cpm-reservation-id': quarantineUploadId,
          'cpm-intake-request-id': intakeRequestId,
          'cpm-target-type': 'location',
          'cpm-target-id': targetId,
          'cpm-purpose': 'public_gallery_candidate',
          'cpm-declared-byte-size': body.byteLength.toString(),
        },
      };
    },
  };
}

function service(record: PhotoUploadReservationRecord) {
  const body = png(640, 480);
  return {
    body,
    validation: createPhotoPostIntakeObjectValidationService({
      reservations: {
        async readByIntakeRequestId() {
          return [record];
        },
      },
      targets: {
        async targetExists() {
          return true;
        },
      },
      objects: objectStore(body),
    }),
  };
}

describe('P5-05J exact post-intake photo validation', () => {
  it('validates only the reservation consumed by the exact Photos Submission', async () => {
    const { body, validation } = service(reservation());

    const result = await validation.validateForSubmission(
      request(body.byteLength),
      submissionId,
      validatedAt,
    );

    expect(result.receipt.validatedAt).toBe(validatedAt.toISOString());
    expect(result.receipt.media).toEqual([
      expect.objectContaining({
        quarantineUploadId,
        mimeType: 'image/png',
        byteSize: body.byteLength,
        width: 640,
        height: 480,
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ]);
    expect(result.objects[0]).toEqual(
      expect.objectContaining({
        privateObjectKey: photoQuarantineObjectKey(quarantineUploadId),
        body,
      }),
    );
  });

  it('rejects unconsumed reservations and reservations consumed by another Submission', async () => {
    const cases = [
      reservation({ consumedAt: null, consumedBySubmissionId: null }),
      reservation({ consumedBySubmissionId: '10000000-0000-4000-8000-000000000099' }),
    ];

    for (const record of cases) {
      const { body, validation } = service(record);
      await expect(
        validation.validateForSubmission(request(body.byteLength), submissionId, validatedAt),
      ).rejects.toMatchObject({ code: 'reservation_unavailable' });
    }
  });

  it('rejects a post-intake validation timestamp before consumption', async () => {
    const { body, validation } = service(reservation());

    await expect(
      validation.validateForSubmission(
        request(body.byteLength),
        submissionId,
        new Date('2026-07-15T00:04:59.999Z'),
      ),
    ).rejects.toMatchObject({ code: 'reservation_unavailable' });
  });
});
