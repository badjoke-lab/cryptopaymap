import { inspectPhotoImage } from '../src/submissions/photo-image-inspection';
import { createInMemoryPhotoQuarantineObjectStore } from '../src/submissions/in-memory-photo-quarantine-object-store';
import {
  createPhotoObjectValidationService,
  photoObjectValidationReceiptSchema,
  photoObjectValidationRequestSchema,
} from '../src/submissions/photo-object-validation';
import { createR2PhotoQuarantineObjectStore } from '../src/submissions/r2-photo-quarantine-object-store';
import './check-photo-private-processing';

const parsed = photoObjectValidationRequestSchema.parse({
  schemaVersion: 'photo-object-validation-v1',
  intakeRequestId: '10000000-0000-4000-8000-000000000001',
  targetType: 'location',
  targetId: '20000000-0000-4000-8000-000000000001',
  media: [
    {
      quarantineUploadId: '30000000-0000-4000-8000-000000000001',
      purpose: 'public_gallery_candidate',
      declaredMimeType: 'image/png',
      declaredByteSize: 1_000,
    },
  ],
});

photoObjectValidationReceiptSchema.parse({
  schemaVersion: 'photo-object-validation-receipt-v1',
  intakeRequestId: parsed.intakeRequestId,
  targetType: parsed.targetType,
  targetId: parsed.targetId,
  validatedAt: '2026-07-15T00:00:00.000Z',
  media: [
    {
      quarantineUploadId: parsed.media[0]?.quarantineUploadId,
      mimeType: 'image/png',
      byteSize: 1_000,
      width: 100,
      height: 100,
      contentHash: 'a'.repeat(64),
    },
  ],
});

if (typeof inspectPhotoImage !== 'function') {
  throw new Error('Photo image inspection is not executable.');
}
if (typeof createPhotoObjectValidationService !== 'function') {
  throw new Error('Photo object validation service is not executable.');
}
if (typeof createInMemoryPhotoQuarantineObjectStore !== 'function') {
  throw new Error('Photo quarantine in-memory adapter is not executable.');
}
if (typeof createR2PhotoQuarantineObjectStore !== 'function') {
  throw new Error('Photo quarantine R2 adapter is not executable.');
}

console.log('Photo object validation schemas and services passed.');
