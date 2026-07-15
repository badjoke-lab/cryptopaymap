import { describe, expect, it } from 'vitest';
import {
  createPhotoPrivateExecutionService,
  PhotoPrivateExecutionError,
} from '../src/submissions/photo-private-execution';
import type {
  PhotoPrivateProcessingRequest,
  PhotoProcessingSubmissionContext,
} from '../src/submissions/photo-private-processing';

const submissionId = '10000000-0000-4000-8000-000000000001';
const intakeRequestId = '20000000-0000-4000-8000-000000000001';
const processingRequestId = '30000000-0000-4000-8000-000000000001';
const targetId = '40000000-0000-4000-8000-000000000001';
const quarantineUploadId = '50000000-0000-4000-8000-000000000001';
const validatedAt = '2026-07-15T00:06:00.000Z';
const processedAt = new Date('2026-07-15T00:07:00.000Z');

function context(): PhotoProcessingSubmissionContext {
  return {
    id: submissionId,
    intakeRequestId,
    submissionType: 'photos',
    targetType: 'location',
    targetId,
    workflowStatus: 'received',
    updatedAt: '2026-07-15T00:05:00.000Z',
    normalizedPayload: {
      targetType: 'location',
      targetId,
      relationship: 'customer',
      media: [
        {
          quarantineUploadId,
          purpose: 'public_gallery_candidate',
          role: 'cover',
          declaredMimeType: 'image/png',
          declaredByteSize: 3,
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
      ],
      submitterNote: null,
    },
    reservations: [
      {
        id: quarantineUploadId,
        intakeRequestId,
        purpose: 'public_gallery_candidate',
        expiresAt: '2026-07-15T00:10:00.000Z',
        consumedBySubmissionId: submissionId,
        consumedAt: '2026-07-15T00:05:00.000Z',
      },
    ],
  };
}

describe('P5-05J protected private photo execution', () => {
  it('builds the exact post-intake validation request before protected processing', async () => {
    const validationCalls: Array<{
      request: unknown;
      submissionId: unknown;
      validatedAt: Date | undefined;
    }> = [];
    const processingCalls: Array<{ request: unknown; processedAt: Date | undefined }> = [];
    const body = Uint8Array.from([1, 2, 3]);
    const validation = {
      receipt: {
        schemaVersion: 'photo-object-validation-receipt-v1' as const,
        intakeRequestId,
        targetType: 'location' as const,
        targetId,
        validatedAt,
        media: [
          {
            quarantineUploadId,
            mimeType: 'image/png' as const,
            byteSize: 3,
            width: 1,
            height: 1,
            contentHash: 'a'.repeat(64),
          },
        ],
      },
      objects: [
        {
          quarantineUploadId,
          privateObjectKey: `quarantine/photos/v1/${quarantineUploadId}`,
          body,
          mimeType: 'image/png' as const,
          byteSize: 3,
          width: 1,
          height: 1,
          contentHash: 'a'.repeat(64),
        },
      ],
    };
    const service = createPhotoPrivateExecutionService({
      contexts: {
        async loadSubmissionContext() {
          return context();
        },
      },
      validation: {
        async validateForSubmission(request, receivedSubmissionId, receivedValidatedAt) {
          validationCalls.push({
            request,
            submissionId: receivedSubmissionId,
            validatedAt: receivedValidatedAt,
          });
          return validation;
        },
      },
      processing: {
        async process(request, receivedProcessedAt) {
          processingCalls.push({ request, processedAt: receivedProcessedAt });
          const parsed = request as PhotoPrivateProcessingRequest;
          return {
            schemaVersion: 'photo-private-processing-receipt-v1',
            state: 'committed',
            processingRequestId: parsed.processingRequestId,
            submissionId: parsed.submissionId,
            processedAt: processedAt.toISOString(),
            media: [
              {
                quarantineUploadId,
                mediaAssetId: '60000000-0000-4000-8000-000000000001',
                originalContentHash: 'a'.repeat(64),
                displayFileId: '70000000-0000-4000-8000-000000000001',
                displayContentHash: 'b'.repeat(64),
                thumbnailFileId: '80000000-0000-4000-8000-000000000001',
                thumbnailContentHash: 'c'.repeat(64),
              },
            ],
          };
        },
      },
    });

    const receipt = await service.execute(
      {
        schemaVersion: 'photo-private-execution-v1',
        processingRequestId,
        submissionId,
        processorVersion: 'cloudflare-images/1',
        validatedAt,
      },
      processedAt,
    );

    expect(receipt.state).toBe('committed');
    expect(validationCalls).toEqual([
      {
        request: {
          schemaVersion: 'photo-object-validation-v1',
          intakeRequestId,
          targetType: 'location',
          targetId,
          media: [
            {
              quarantineUploadId,
              purpose: 'public_gallery_candidate',
              declaredMimeType: 'image/png',
              declaredByteSize: 3,
            },
          ],
        },
        submissionId,
        validatedAt: new Date(validatedAt),
      },
    ]);
    expect(processingCalls[0]?.processedAt).toEqual(processedAt);
    expect(processingCalls[0]?.request).toEqual(
      expect.objectContaining({
        schemaVersion: 'photo-private-processing-v1',
        processingRequestId,
        submissionId,
        processorVersion: 'cloudflare-images/1',
        validation,
      }),
    );
  });

  it('rejects validation timestamps after processing before reading private state', async () => {
    let loaded = false;
    const service = createPhotoPrivateExecutionService({
      contexts: {
        async loadSubmissionContext() {
          loaded = true;
          return context();
        },
      },
      validation: {
        async validateForSubmission() {
          throw new Error('must not run');
        },
      },
      processing: {
        async process() {
          throw new Error('must not run');
        },
      },
    });

    await expect(
      service.execute(
        {
          schemaVersion: 'photo-private-execution-v1',
          processingRequestId,
          submissionId,
          processorVersion: 'cloudflare-images/1',
          validatedAt: '2026-07-15T00:08:00.000Z',
        },
        processedAt,
      ),
    ).rejects.toBeInstanceOf(PhotoPrivateExecutionError);
    expect(loaded).toBe(false);
  });
});
