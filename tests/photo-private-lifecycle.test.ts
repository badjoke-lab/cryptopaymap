import { describe, expect, it } from 'vitest';
import { privateMediaDerivativeKey } from '../src/admin/media-review/storage-plan';
import { createInMemoryPhotoPrivateObjectLifecycleStore } from '../src/submissions/in-memory-photo-private-lifecycle';
import {
  createPhotoPrivateCleanupService,
  PhotoPrivateCleanupError,
  type PhotoPrivateCleanupCandidate,
} from '../src/submissions/photo-private-lifecycle';
import { photoQuarantineObjectKey } from '../src/submissions/photo-upload-authorization';

const reservationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000001';
const mediaAssetId = '30000000-0000-4000-8000-000000000001';
const originalFileId = '40000000-0000-4000-8000-000000000001';
const displayFileId = '40000000-0000-4000-8000-000000000002';
const displayHash = 'd'.repeat(64);
const displayKey = privateMediaDerivativeKey(mediaAssetId, {
  id: displayFileId,
  contentHash: displayHash,
  mimeType: 'image/webp',
});

const expiredAuthorization: PhotoPrivateCleanupCandidate = {
  referenceType: 'reservation',
  referenceId: reservationId,
  reason: 'expired_authorization',
  eligibleAt: '2026-07-14T00:00:00.000Z',
  submissionId: null,
  mediaAssetId: null,
  objects: [
    {
      objectRefId: reservationId,
      reservationId,
      mediaAssetId: null,
      mediaFileId: null,
      variant: 'original',
      storageScope: 'quarantine',
      storageKey: photoQuarantineObjectKey(reservationId),
      mimeType: 'application/octet-stream',
      contentHash: null,
    },
  ],
};

const rejectedMedia: PhotoPrivateCleanupCandidate = {
  referenceType: 'media_asset',
  referenceId: mediaAssetId,
  reason: 'rejected_media',
  eligibleAt: '2026-06-01T00:00:00.000Z',
  submissionId,
  mediaAssetId,
  objects: [
    {
      objectRefId: originalFileId,
      reservationId,
      mediaAssetId,
      mediaFileId: originalFileId,
      variant: 'original',
      storageScope: 'quarantine',
      storageKey: photoQuarantineObjectKey(reservationId),
      mimeType: 'image/png',
      contentHash: 'a'.repeat(64),
    },
    {
      objectRefId: displayFileId,
      reservationId: null,
      mediaAssetId,
      mediaFileId: displayFileId,
      variant: 'display',
      storageScope: 'private',
      storageKey: displayKey,
      mimeType: 'image/webp',
      contentHash: displayHash,
    },
  ],
};

const request = {
  schemaVersion: 'photo-private-cleanup-v1',
  runId: '50000000-0000-4000-8000-000000000001',
  asOf: '2026-07-15T00:00:00.000Z',
  limit: 50,
} as const;

function reader(candidates: PhotoPrivateCleanupCandidate[]) {
  return {
    async loadCleanupCandidates() {
      return structuredClone(candidates);
    },
  };
}

describe('P5-05F private photo lifecycle cleanup', () => {
  it('deletes only eligible private objects and emits a leakage-safe receipt', async () => {
    const objects = createInMemoryPhotoPrivateObjectLifecycleStore([
      { storageScope: 'quarantine', storageKey: photoQuarantineObjectKey(reservationId) },
      { storageScope: 'private', storageKey: displayKey },
    ]);
    const service = createPhotoPrivateCleanupService({
      candidates: reader([expiredAuthorization, rejectedMedia]),
      objects,
    });

    const receipt = await service.run(request);

    expect(receipt.state).toBe('completed');
    expect(receipt.candidateCount).toBe(2);
    expect(receipt.deletedObjectCount).toBe(2);
    expect(receipt.failedObjectCount).toBe(0);
    expect(objects.list()).toEqual([]);
    expect(JSON.stringify(receipt)).not.toContain('quarantine/photos');
    expect(JSON.stringify(receipt)).not.toContain('media/private');
  });

  it('treats missing objects as an idempotent replay', async () => {
    const service = createPhotoPrivateCleanupService({
      candidates: reader([expiredAuthorization]),
      objects: createInMemoryPhotoPrivateObjectLifecycleStore(),
    });

    const receipt = await service.run(request);

    expect(receipt.state).toBe('completed');
    expect(receipt.deletedObjectCount).toBe(0);
    expect(receipt.missingObjectCount).toBe(1);
    expect(receipt.candidates[0]?.outcome).toBe('replayed');
  });

  it('rejects a terminal candidate before its 30-day retention boundary', async () => {
    const service = createPhotoPrivateCleanupService({
      candidates: reader([
        { ...rejectedMedia, eligibleAt: '2026-07-01T00:00:00.000Z' },
      ]),
      objects: createInMemoryPhotoPrivateObjectLifecycleStore(),
    });

    await expect(service.run(request)).rejects.toEqual(
      expect.objectContaining<Partial<PhotoPrivateCleanupError>>({
        code: 'candidate_invalid',
      }),
    );
  });

  it('rejects noncanonical private object keys without deleting anything', async () => {
    const invalid = structuredClone(rejectedMedia);
    invalid.objects[1] = {
      ...invalid.objects[1]!,
      storageKey: 'media/private/wrong.webp',
    };
    const objects = createInMemoryPhotoPrivateObjectLifecycleStore([
      { storageScope: 'private', storageKey: displayKey },
    ]);
    const service = createPhotoPrivateCleanupService({
      candidates: reader([invalid]),
      objects,
    });

    await expect(service.run(request)).rejects.toEqual(
      expect.objectContaining<Partial<PhotoPrivateCleanupError>>({
        code: 'candidate_invalid',
      }),
    );
    expect(objects.list()).toEqual([{ storageScope: 'private', storageKey: displayKey }]);
  });

  it('continues other deletions and reports a partial run when one object fails', async () => {
    const objects = createInMemoryPhotoPrivateObjectLifecycleStore([
      { storageScope: 'quarantine', storageKey: photoQuarantineObjectKey(reservationId) },
      { storageScope: 'private', storageKey: displayKey },
    ]);
    objects.fail('private', displayKey);
    const service = createPhotoPrivateCleanupService({
      candidates: reader([rejectedMedia]),
      objects,
    });

    const receipt = await service.run(request);

    expect(receipt.state).toBe('partial');
    expect(receipt.deletedObjectCount).toBe(1);
    expect(receipt.failedObjectCount).toBe(1);
    expect(receipt.candidates[0]?.outcome).toBe('partial');
    expect(objects.list()).toEqual([{ storageScope: 'private', storageKey: displayKey }]);
  });
});
