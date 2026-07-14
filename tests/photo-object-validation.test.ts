import { describe, expect, it } from 'vitest';
import { createInMemoryPhotoQuarantineObjectStore } from '../src/submissions/in-memory-photo-quarantine-object-store';
import { createInMemoryPhotoUploadReservationPersistence } from '../src/submissions/in-memory-photo-upload-reservations';
import {
  createPhotoObjectValidationService,
  photoObjectValidationRequestSchema,
  type PhotoObjectValidationRequest,
} from '../src/submissions/photo-object-validation';
import { photoQuarantineObjectKey } from '../src/submissions/photo-upload-authorization';
import { createR2PhotoQuarantineObjectStore } from '../src/submissions/r2-photo-quarantine-object-store';

const intakeRequestId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';
const quarantineUploadId = '30000000-0000-4000-8000-000000000001';
const validatedAt = new Date('2026-07-15T00:05:00.000Z');

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

function png(width = 640, height = 480): Uint8Array {
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

function requestFor(body: Uint8Array): PhotoObjectValidationRequest {
  return photoObjectValidationRequestSchema.parse({
    schemaVersion: 'photo-object-validation-v1',
    intakeRequestId,
    targetType: 'location',
    targetId,
    media: [
      {
        quarantineUploadId,
        purpose: 'public_gallery_candidate',
        declaredMimeType: 'image/png',
        declaredByteSize: body.byteLength,
      },
    ],
  });
}

function metadataFor(body: Uint8Array): Record<string, string> {
  return {
    'cpm-schema-version': 'photo-upload-v1',
    'cpm-reservation-id': quarantineUploadId,
    'cpm-intake-request-id': intakeRequestId,
    'cpm-target-type': 'location',
    'cpm-target-id': targetId,
    'cpm-purpose': 'public_gallery_candidate',
    'cpm-declared-byte-size': body.byteLength.toString(),
  };
}

async function setup(body = png()) {
  const reservations = createInMemoryPhotoUploadReservationPersistence();
  await reservations.createReservations({
    reservations: [
      {
        id: quarantineUploadId,
        intakeRequestId,
        purpose: 'public_gallery_candidate',
        createdAt: new Date('2026-07-15T00:00:00.000Z'),
        expiresAt: new Date('2026-07-15T00:10:00.000Z'),
      },
    ],
  });
  const objects = createInMemoryPhotoQuarantineObjectStore();
  objects.put({
    key: photoQuarantineObjectKey(quarantineUploadId),
    body,
    byteSize: body.byteLength,
    contentType: 'image/png',
    customMetadata: metadataFor(body),
  });
  return {
    body,
    reservations,
    objects,
    service: createPhotoObjectValidationService({
      reservations,
      targets: {
        async targetExists() {
          return true;
        },
      },
      objects,
    }),
  };
}

describe('P5-05D private photo object validation', () => {
  it('validates private context, bytes, dimensions, and hash without receipt leakage', async () => {
    const fixture = await setup();
    const result = await fixture.service.validate(requestFor(fixture.body), validatedAt);
    expect(result.receipt).toMatchObject({
      schemaVersion: 'photo-object-validation-receipt-v1',
      intakeRequestId,
      targetType: 'location',
      targetId,
      media: [
        {
          quarantineUploadId,
          mimeType: 'image/png',
          byteSize: fixture.body.byteLength,
          width: 640,
          height: 480,
        },
      ],
    });
    expect(result.receipt.media[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.objects[0]).toMatchObject({
      quarantineUploadId,
      privateObjectKey: photoQuarantineObjectKey(quarantineUploadId),
      body: fixture.body,
    });
    const serialized = JSON.stringify(result.receipt);
    for (const forbidden of [
      'privateObjectKey',
      'quarantine/photos/',
      'customMetadata',
      'body',
      'signedUrl',
      'originalFilename',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('rejects unavailable targets before object inspection', async () => {
    const fixture = await setup();
    let reads = 0;
    const service = createPhotoObjectValidationService({
      reservations: fixture.reservations,
      targets: {
        async targetExists() {
          return false;
        },
      },
      objects: {
        async readPrivateObject() {
          reads += 1;
          return null;
        },
      },
    });
    await expect(service.validate(requestFor(fixture.body), validatedAt)).rejects.toMatchObject({
      code: 'target_unavailable',
    });
    expect(reads).toBe(0);
  });

  it('rejects mismatched, expired, and consumed reservations', async () => {
    const fixture = await setup();
    const changed = requestFor(fixture.body);
    changed.media[0] = {
      quarantineUploadId: '30000000-0000-4000-8000-000000000002',
      purpose: 'public_gallery_candidate',
      declaredMimeType: 'image/png',
      declaredByteSize: fixture.body.byteLength,
    };
    await expect(fixture.service.validate(changed, validatedAt)).rejects.toMatchObject({
      code: 'reservation_conflict',
    });
    await expect(
      fixture.service.validate(requestFor(fixture.body), new Date('2026-07-15T00:10:00.000Z')),
    ).rejects.toMatchObject({ code: 'reservation_unavailable' });
    fixture.reservations.markConsumed(quarantineUploadId);
    await expect(
      fixture.service.validate(requestFor(fixture.body), new Date('2026-07-15T00:06:00.000Z')),
    ).rejects.toMatchObject({ code: 'reservation_unavailable' });
  });

  it('rejects missing objects, metadata drift, and byte-size mismatches', async () => {
    const missing = await setup();
    missing.objects.delete(photoQuarantineObjectKey(quarantineUploadId));
    await expect(
      missing.service.validate(requestFor(missing.body), validatedAt),
    ).rejects.toMatchObject({ code: 'object_missing' });

    const metadata = await setup();
    metadata.objects.put({
      key: photoQuarantineObjectKey(quarantineUploadId),
      body: metadata.body,
      byteSize: metadata.body.byteLength,
      contentType: 'image/png',
      customMetadata: {
        ...metadataFor(metadata.body),
        'cpm-target-id': '20000000-0000-4000-8000-000000000002',
      },
    });
    await expect(
      metadata.service.validate(requestFor(metadata.body), validatedAt),
    ).rejects.toMatchObject({ code: 'object_metadata_mismatch' });

    const size = await setup();
    size.objects.put({
      key: photoQuarantineObjectKey(quarantineUploadId),
      body: size.body,
      byteSize: size.body.byteLength - 1,
      contentType: 'image/png',
      customMetadata: metadataFor(size.body),
    });
    await expect(size.service.validate(requestFor(size.body), validatedAt)).rejects.toMatchObject({
      code: 'byte_size_mismatch',
    });
  });

  it('rejects disguised files and actual-signature MIME mismatches', async () => {
    const disguised = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
    const fixture = await setup(disguised);
    await expect(
      fixture.service.validate(requestFor(disguised), validatedAt),
    ).rejects.toMatchObject({ code: 'unsupported_file' });

    const mismatch = await setup();
    const request = requestFor(mismatch.body);
    request.media[0] = {
      quarantineUploadId,
      purpose: 'public_gallery_candidate',
      declaredMimeType: 'image/jpeg',
      declaredByteSize: mismatch.body.byteLength,
    };
    mismatch.objects.put({
      key: photoQuarantineObjectKey(quarantineUploadId),
      body: mismatch.body,
      byteSize: mismatch.body.byteLength,
      contentType: 'image/jpeg',
      customMetadata: metadataFor(mismatch.body),
    });
    await expect(mismatch.service.validate(request, validatedAt)).rejects.toMatchObject({
      code: 'object_metadata_mismatch',
    });
  });

  it('rejects duplicate IDs and permits the exact Photos total limit', () => {
    const body = png();
    const item = {
      quarantineUploadId,
      purpose: 'public_gallery_candidate',
      declaredMimeType: 'image/png',
      declaredByteSize: body.byteLength,
    };
    expect(
      photoObjectValidationRequestSchema.safeParse({
        ...requestFor(body),
        media: [item, item],
      }).success,
    ).toBe(false);
    expect(
      photoObjectValidationRequestSchema.safeParse({
        ...requestFor(body),
        media: Array.from({ length: 8 }, (_, index) => ({
          ...item,
          quarantineUploadId: `30000000-0000-4000-8000-${(index + 1).toString().padStart(12, '0')}`,
          declaredByteSize: 5_000_000,
        })),
      }).success,
    ).toBe(true);
  });

  it('bounds R2 reads before allocating oversized bodies', async () => {
    let bodyReads = 0;
    const store = createR2PhotoQuarantineObjectStore({
      async get(key) {
        return {
          key,
          size: 5_000_001,
          async arrayBuffer() {
            bodyReads += 1;
            return new ArrayBuffer(0);
          },
        };
      },
    });
    await expect(
      store.readPrivateObject(photoQuarantineObjectKey(quarantineUploadId), 5_000_000),
    ).rejects.toMatchObject({ code: 'object_too_large' });
    expect(bodyReads).toBe(0);
  });

  it('normalizes R2 bodies and metadata without signed URL material', async () => {
    const body = png(32, 24);
    const store = createR2PhotoQuarantineObjectStore({
      async get(key) {
        return {
          key,
          size: body.byteLength,
          httpMetadata: { contentType: 'image/png' },
          customMetadata: metadataFor(body),
          async arrayBuffer() {
            return body.slice().buffer;
          },
        };
      },
    });
    const object = await store.readPrivateObject(
      photoQuarantineObjectKey(quarantineUploadId),
      body.byteLength,
    );
    expect(object).toMatchObject({
      key: photoQuarantineObjectKey(quarantineUploadId),
      byteSize: body.byteLength,
      contentType: 'image/png',
      customMetadata: metadataFor(body),
    });
    expect(object?.body).toEqual(body);
    expect(JSON.stringify(object)).not.toContain('signature');
  });
});
