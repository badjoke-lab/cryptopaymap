import { createDrizzlePhotoMediaHandoffPersistence } from '../src/submissions/drizzle-photo-private-processing';
import { createInMemoryPrivatePhotoDerivativeStore } from '../src/submissions/in-memory-private-photo-derivatives';
import {
  createPhotoPrivateProcessingService,
  photoMediaHandoffEventPayloadSchema,
  photoPrivateProcessingReceiptSchema,
  photoPrivateProcessingRequestSchema,
  photoProcessedDerivativeSchema,
} from '../src/submissions/photo-private-processing';
import { createR2PrivatePhotoDerivativeStore } from '../src/submissions/r2-private-photo-derivatives';

const request = photoPrivateProcessingRequestSchema.parse({
  schemaVersion: 'photo-private-processing-v1',
  processingRequestId: '10000000-0000-4000-8000-000000000001',
  submissionId: '20000000-0000-4000-8000-000000000001',
  processorVersion: 'check-codec/1.0.0',
  validation: {
    receipt: {
      schemaVersion: 'photo-object-validation-receipt-v1',
      intakeRequestId: '30000000-0000-4000-8000-000000000001',
      targetType: 'location',
      targetId: '40000000-0000-4000-8000-000000000001',
      validatedAt: '2026-07-15T00:00:00.000Z',
      media: [
        {
          quarantineUploadId: '50000000-0000-4000-8000-000000000001',
          mimeType: 'image/png',
          byteSize: 4,
          width: 1,
          height: 1,
          contentHash: 'a'.repeat(64),
        },
      ],
    },
    objects: [
      {
        quarantineUploadId: '50000000-0000-4000-8000-000000000001',
        privateObjectKey: 'quarantine/photos/v1/50000000-0000-4000-8000-000000000001',
        body: Uint8Array.from([1, 2, 3, 4]),
        mimeType: 'image/png',
        byteSize: 4,
        width: 1,
        height: 1,
        contentHash: 'a'.repeat(64),
      },
    ],
  },
});

photoProcessedDerivativeSchema.parse({
  variant: 'display',
  body: Uint8Array.from([1]),
  mimeType: 'image/webp',
  width: 1,
  height: 1,
  metadataStripped: true,
  orientationNormalized: true,
});

const event = photoMediaHandoffEventPayloadSchema.parse({
  schemaVersion: 'photo-media-handoff-event-v1',
  processingRequestId: request.processingRequestId,
  requestFingerprint: 'b'.repeat(64),
  submissionId: request.submissionId,
  processorVersion: request.processorVersion,
  processedAt: '2026-07-15T00:01:00.000Z',
  targetType: 'location',
  targetId: request.validation.receipt.targetId,
  media: [
    {
      quarantineUploadId: request.validation.receipt.media[0]?.quarantineUploadId,
      mediaAssetId: '60000000-0000-4000-8000-000000000001',
      originalFileId: '70000000-0000-4000-8000-000000000001',
      displayFileId: '70000000-0000-4000-8000-000000000002',
      thumbnailFileId: '70000000-0000-4000-8000-000000000003',
      originalContentHash: 'a'.repeat(64),
      displayContentHash: 'c'.repeat(64),
      thumbnailContentHash: 'd'.repeat(64),
      reviewContext: {
        role: 'cover',
        capturedAt: null,
        description: null,
        suggestedAltText: null,
        photographerPresent: true,
        rightsStatus: 'submitted_with_permission',
        rightsHolderPresent: true,
        permissionReferencePresent: false,
        licenseName: null,
        licenseUrl: null,
        publicDisplayPermission: true,
      },
    },
  ],
});

photoPrivateProcessingReceiptSchema.parse({
  schemaVersion: 'photo-private-processing-receipt-v1',
  state: 'committed',
  processingRequestId: event.processingRequestId,
  submissionId: event.submissionId,
  processedAt: event.processedAt,
  media: event.media.map((item) => ({
    quarantineUploadId: item.quarantineUploadId,
    mediaAssetId: item.mediaAssetId,
    originalContentHash: item.originalContentHash,
    displayFileId: item.displayFileId,
    displayContentHash: item.displayContentHash,
    thumbnailFileId: item.thumbnailFileId,
    thumbnailContentHash: item.thumbnailContentHash,
  })),
});

for (const implementation of [
  createPhotoPrivateProcessingService,
  createDrizzlePhotoMediaHandoffPersistence,
  createInMemoryPrivatePhotoDerivativeStore,
  createR2PrivatePhotoDerivativeStore,
]) {
  if (typeof implementation !== 'function') {
    throw new Error('P5-05E photo private processing implementation is not executable.');
  }
}

console.log('Photo private processing and Media handoff schemas passed.');
