import {
  mediaDuplicateSignalsSchema,
  projectMediaDuplicateSignals,
} from '../src/admin/media-review/duplicate-signals';
import { createDrizzlePhotoPrivateCleanupCandidateReader } from '../src/submissions/drizzle-photo-private-lifecycle';
import { createInMemoryPhotoPrivateObjectLifecycleStore } from '../src/submissions/in-memory-photo-private-lifecycle';
import {
  createPhotoPrivateCleanupService,
  photoPrivateCleanupCandidateSchema,
  photoPrivateCleanupReceiptSchema,
  photoPrivateCleanupRequestSchema,
} from '../src/submissions/photo-private-lifecycle';
import { createR2PhotoPrivateObjectLifecycleStore } from '../src/submissions/r2-photo-private-lifecycle';
import { photoQuarantineObjectKey } from '../src/submissions/photo-upload-authorization';

const reservationId = '10000000-0000-4000-8000-000000000001';
const request = photoPrivateCleanupRequestSchema.parse({
  schemaVersion: 'photo-private-cleanup-v1',
  runId: '20000000-0000-4000-8000-000000000001',
  asOf: '2026-07-15T00:00:00.000Z',
  limit: 25,
});

photoPrivateCleanupCandidateSchema.parse({
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
});

photoPrivateCleanupReceiptSchema.parse({
  schemaVersion: 'photo-private-cleanup-receipt-v1',
  runId: request.runId,
  asOf: request.asOf,
  state: 'completed',
  candidateCount: 0,
  deletedObjectCount: 0,
  missingObjectCount: 0,
  failedObjectCount: 0,
  candidates: [],
});

mediaDuplicateSignalsSchema.parse(
  projectMediaDuplicateSignals(
    { type: 'location', id: '30000000-0000-4000-8000-000000000001' },
    null,
    [],
  ),
);

for (const executable of [
  createPhotoPrivateCleanupService,
  createDrizzlePhotoPrivateCleanupCandidateReader,
  createInMemoryPhotoPrivateObjectLifecycleStore,
  createR2PhotoPrivateObjectLifecycleStore,
  projectMediaDuplicateSignals,
]) {
  if (typeof executable !== 'function') {
    throw new Error('Photo private lifecycle boundary is not executable.');
  }
}

console.log('Photo duplicate signals and private lifecycle schemas passed.');
