import { describe, expect, it } from 'vitest';
import { createInMemoryPhotoUploadReservationPersistence } from '../src/submissions/in-memory-photo-upload-reservations';
import {
  createPhotoUploadAuthorizationService,
  photoQuarantineObjectKey,
  photoUploadAuthorizationRequestSchema,
  type QuarantineUploadAuthorizationCommand,
  type QuarantineUploadAuthorizer,
} from '../src/submissions/photo-upload-authorization';

const intakeRequestId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';
const requestedAt = new Date('2026-07-15T00:00:00.000Z');

function validRequest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'photo-upload-authorization-v1',
    intakeRequestId,
    targetType: 'location',
    targetId,
    media: [
      {
        purpose: 'public_gallery_candidate',
        declaredMimeType: 'image/jpeg',
        declaredByteSize: 1_250_000,
      },
      {
        purpose: 'public_gallery_candidate',
        declaredMimeType: 'image/webp',
        declaredByteSize: 750_000,
      },
    ],
    ...overrides,
  };
}

function testAuthorizer(options: { failOnce?: boolean } = {}) {
  const calls: QuarantineUploadAuthorizationCommand[] = [];
  let remainingFailures = options.failOnce ? 1 : 0;
  const authorizer: QuarantineUploadAuthorizer = {
    async authorizeUpload(command) {
      calls.push(structuredClone(command));
      if (remainingFailures > 0) {
        remainingFailures -= 1;
        throw new Error('synthetic signer failure');
      }
      return {
        uploadUrl: `https://uploads.example.test/${encodeURIComponent(command.objectKey)}?signature=test`,
        requiredHeaders: {
          'content-type': command.declaredMimeType,
          ...Object.fromEntries(
            Object.entries(command.metadata).map(([key, value]) => [`x-amz-meta-${key}`, value]),
          ),
        },
      };
    },
  };
  return { authorizer, calls };
}

describe('P5-05C Photo quarantine upload authorization', () => {
  it('creates short-lived opaque reservations and signed PUT instructions without exposing a storage key field', async () => {
    const persistence = createInMemoryPhotoUploadReservationPersistence();
    const signer = testAuthorizer();
    const service = createPhotoUploadAuthorizationService({
      persistence,
      authorizer: signer.authorizer,
      authorizationTtlMs: 10 * 60 * 1_000,
    });

    const receipt = await service.authorize(validRequest(), requestedAt);

    expect(receipt.state).toBe('committed');
    expect(receipt.intakeRequestId).toBe(intakeRequestId);
    expect(receipt.expiresAt).toBe('2026-07-15T00:10:00.000Z');
    expect(receipt.uploads).toHaveLength(2);
    expect(persistence.list()).toHaveLength(2);
    expect(signer.calls).toHaveLength(2);
    expect(receipt.uploads[0]).toMatchObject({
      method: 'PUT',
      declaredByteSize: 1_250_000,
      requiredHeaders: {
        'content-type': 'image/jpeg',
        'x-amz-meta-cpm-intake-request-id': intakeRequestId,
        'x-amz-meta-cpm-target-type': 'location',
        'x-amz-meta-cpm-target-id': targetId,
        'x-amz-meta-cpm-purpose': 'public_gallery_candidate',
      },
    });
    expect(Object.hasOwn(receipt.uploads[0] ?? {}, 'objectKey')).toBe(false);
    expect(Object.hasOwn(receipt.uploads[0] ?? {}, 'storageKey')).toBe(false);
    expect(Object.hasOwn(receipt.uploads[0] ?? {}, 'originalFilename')).toBe(false);
    expect(JSON.stringify(persistence.list())).not.toContain('signature=test');
    expect(signer.calls[0]?.objectKey).toBe(
      photoQuarantineObjectKey(receipt.uploads[0]?.quarantineUploadId ?? ''),
    );
  });

  it('replays the same request with the same reservation IDs and no duplicate persistence', async () => {
    const persistence = createInMemoryPhotoUploadReservationPersistence();
    const signer = testAuthorizer();
    const service = createPhotoUploadAuthorizationService({
      persistence,
      authorizer: signer.authorizer,
    });

    const first = await service.authorize(validRequest(), requestedAt);
    const replay = await service.authorize(validRequest(), new Date('2026-07-15T00:01:00.000Z'));

    expect(first.state).toBe('committed');
    expect(replay.state).toBe('replayed');
    expect(replay.uploads.map((upload) => upload.quarantineUploadId)).toEqual(
      first.uploads.map((upload) => upload.quarantineUploadId),
    );
    expect(replay.expiresAt).toBe(first.expiresAt);
    expect(persistence.list()).toHaveLength(2);
  });

  it('rejects changed content under the same intake request ID', async () => {
    const persistence = createInMemoryPhotoUploadReservationPersistence();
    const signer = testAuthorizer();
    const service = createPhotoUploadAuthorizationService({
      persistence,
      authorizer: signer.authorizer,
    });

    await service.authorize(validRequest(), requestedAt);

    await expect(
      service.authorize(
        validRequest({
          targetId: '20000000-0000-4000-8000-000000000002',
        }),
        new Date('2026-07-15T00:01:00.000Z'),
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
    expect(persistence.list()).toHaveLength(2);
  });

  it('rejects expired or consumed reservation replay without identifying the private failure', async () => {
    const persistence = createInMemoryPhotoUploadReservationPersistence();
    const signer = testAuthorizer();
    const service = createPhotoUploadAuthorizationService({
      persistence,
      authorizer: signer.authorizer,
      authorizationTtlMs: 60_000,
    });

    const first = await service.authorize(validRequest(), requestedAt);
    persistence.markConsumed(first.uploads[0]?.quarantineUploadId ?? '');

    await expect(
      service.authorize(validRequest(), new Date('2026-07-15T00:00:30.000Z')),
    ).rejects.toMatchObject({ code: 'reservation_unavailable' });

    const secondPersistence = createInMemoryPhotoUploadReservationPersistence();
    const secondService = createPhotoUploadAuthorizationService({
      persistence: secondPersistence,
      authorizer: signer.authorizer,
      authorizationTtlMs: 60_000,
    });
    await secondService.authorize(validRequest(), requestedAt);
    await expect(
      secondService.authorize(validRequest(), new Date('2026-07-15T00:01:00.000Z')),
    ).rejects.toMatchObject({ code: 'reservation_unavailable' });
  });

  it('keeps durable reservations after a signer failure so an exact retry can recover', async () => {
    const persistence = createInMemoryPhotoUploadReservationPersistence();
    const signer = testAuthorizer({ failOnce: true });
    const service = createPhotoUploadAuthorizationService({
      persistence,
      authorizer: signer.authorizer,
    });

    await expect(service.authorize(validRequest(), requestedAt)).rejects.toMatchObject({
      code: 'authorization_failed',
    });
    expect(persistence.list()).toHaveLength(2);

    const replay = await service.authorize(validRequest(), new Date('2026-07-15T00:01:00.000Z'));
    expect(replay.state).toBe('replayed');
    expect(replay.uploads).toHaveLength(2);
  });

  it('converges concurrent identical requests on one reservation set', async () => {
    const persistence = createInMemoryPhotoUploadReservationPersistence();
    const signer = testAuthorizer();
    const service = createPhotoUploadAuthorizationService({
      persistence,
      authorizer: signer.authorizer,
    });

    const [left, right] = await Promise.all([
      service.authorize(validRequest(), requestedAt),
      service.authorize(validRequest(), requestedAt),
    ]);

    expect([left.state, right.state].sort()).toEqual(['committed', 'replayed']);
    expect(left.uploads.map((upload) => upload.quarantineUploadId)).toEqual(
      right.uploads.map((upload) => upload.quarantineUploadId),
    );
    expect(persistence.list()).toHaveLength(2);
  });

  it('rejects unsupported purposes, file metadata, per-file limits, total limits, and undeclared fields', () => {
    expect(
      photoUploadAuthorizationRequestSchema.safeParse(
        validRequest({
          media: [
            {
              purpose: 'evidence_image',
              declaredMimeType: 'image/jpeg',
              declaredByteSize: 100,
            },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      photoUploadAuthorizationRequestSchema.safeParse(
        validRequest({
          media: [
            {
              purpose: 'public_gallery_candidate',
              declaredMimeType: 'image/svg+xml',
              declaredByteSize: 100,
            },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      photoUploadAuthorizationRequestSchema.safeParse(
        validRequest({
          media: [
            {
              purpose: 'public_gallery_candidate',
              declaredMimeType: 'image/jpeg',
              declaredByteSize: 5_000_001,
            },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      photoUploadAuthorizationRequestSchema.safeParse(
        validRequest({
          media: Array.from({ length: 8 }, () => ({
            purpose: 'public_gallery_candidate',
            declaredMimeType: 'image/jpeg',
            declaredByteSize: 5_000_000,
          })),
        }),
      ).success,
    ).toBe(true);
    expect(
      photoUploadAuthorizationRequestSchema.safeParse(
        validRequest({
          media: Array.from({ length: 8 }, () => ({
            purpose: 'public_gallery_candidate',
            declaredMimeType: 'image/jpeg',
            declaredByteSize: 5_000_000,
          })).concat({
            purpose: 'public_gallery_candidate',
            declaredMimeType: 'image/jpeg',
            declaredByteSize: 1,
          }),
        }),
      ).success,
    ).toBe(false);
    expect(
      photoUploadAuthorizationRequestSchema.safeParse({
        ...validRequest(),
        originalFilename: 'private-photo.jpg',
      }).success,
    ).toBe(false);
  });

  it('rejects signer responses that omit the required content type or signed metadata', async () => {
    const persistence = createInMemoryPhotoUploadReservationPersistence();
    const service = createPhotoUploadAuthorizationService({
      persistence,
      authorizer: {
        async authorizeUpload() {
          return {
            uploadUrl: 'https://uploads.example.test/object?signature=test',
            requiredHeaders: { 'content-type': 'image/png' },
          };
        },
      },
    });

    await expect(service.authorize(validRequest(), requestedAt)).rejects.toMatchObject({
      code: 'authorization_failed',
    });
  });
});
