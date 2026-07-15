import { z } from 'zod';
import { photosReviewProjectionSchema } from './photo-media-contract';
import {
  photoObjectValidationRequestSchema,
  type PhotoObjectValidationResult,
} from './photo-object-validation';
import type {
  PhotoMediaHandoffPersistence,
  PhotoProcessingSubmissionContext,
} from './photo-private-processing';
import {
  photoPrivateProcessingRequestSchema,
  type PhotoPrivateProcessingReceipt,
} from './photo-private-processing';

const processorVersionSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/);

export const photoPrivateExecutionRequestSchema = z
  .object({
    schemaVersion: z.literal('photo-private-execution-v1'),
    processingRequestId: z.uuid(),
    submissionId: z.uuid(),
    processorVersion: processorVersionSchema,
    validatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type PhotoPrivateExecutionRequest = z.infer<typeof photoPrivateExecutionRequestSchema>;

export interface PhotoPostIntakeValidationExecutor {
  validateForSubmission(
    rawInput: unknown,
    rawSubmissionId: unknown,
    validatedAt?: Date,
  ): Promise<PhotoObjectValidationResult>;
}

export interface PhotoPrivateProcessingExecutor {
  process(rawInput: unknown, processedAt?: Date): Promise<PhotoPrivateProcessingReceipt>;
}

export interface PhotoPrivateExecutionDependencies {
  contexts: Pick<PhotoMediaHandoffPersistence, 'loadSubmissionContext'>;
  validation: PhotoPostIntakeValidationExecutor;
  processing: PhotoPrivateProcessingExecutor;
}

export class PhotoPrivateExecutionError extends Error {
  constructor(
    readonly code: 'invalid_request' | 'submission_unavailable' | 'persistence_unavailable',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PhotoPrivateExecutionError';
  }
}

function validateExecutionTime(value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new PhotoPrivateExecutionError(
      'invalid_request',
      'Private photo execution timestamp is invalid.',
    );
  }
}

export function createPhotoPrivateExecutionService(
  dependencies: PhotoPrivateExecutionDependencies,
) {
  return {
    async execute(
      rawInput: unknown,
      processedAt = new Date(),
    ): Promise<PhotoPrivateProcessingReceipt> {
      validateExecutionTime(processedAt);

      let request: PhotoPrivateExecutionRequest;
      try {
        request = photoPrivateExecutionRequestSchema.parse(rawInput);
      } catch (error) {
        throw new PhotoPrivateExecutionError(
          'invalid_request',
          'Private photo execution request failed validation.',
          { cause: error },
        );
      }

      const validatedAt = new Date(request.validatedAt);
      if (Number.isNaN(validatedAt.getTime()) || validatedAt.getTime() > processedAt.getTime()) {
        throw new PhotoPrivateExecutionError(
          'invalid_request',
          'Private photo validation cannot occur after processing.',
        );
      }

      let context: PhotoProcessingSubmissionContext | null;
      try {
        context = await dependencies.contexts.loadSubmissionContext(request.submissionId);
      } catch (error) {
        throw new PhotoPrivateExecutionError(
          'persistence_unavailable',
          'Private photo execution context could not be loaded.',
          { cause: error },
        );
      }
      if (context === null) {
        throw new PhotoPrivateExecutionError(
          'submission_unavailable',
          'The Photos Submission is unavailable for private execution.',
        );
      }

      const normalized = photosReviewProjectionSchema.safeParse(context.normalizedPayload);
      if (
        !normalized.success ||
        context.id !== request.submissionId ||
        context.submissionType !== 'photos' ||
        normalized.data.targetType !== context.targetType ||
        normalized.data.targetId !== context.targetId
      ) {
        throw new PhotoPrivateExecutionError(
          'submission_unavailable',
          'The Photos Submission is unavailable for private execution.',
        );
      }

      const validationRequest = photoObjectValidationRequestSchema.parse({
        schemaVersion: 'photo-object-validation-v1',
        intakeRequestId: context.intakeRequestId,
        targetType: context.targetType,
        targetId: context.targetId,
        media: normalized.data.media.map((item) => ({
          quarantineUploadId: item.quarantineUploadId,
          purpose: item.purpose,
          declaredMimeType: item.declaredMimeType,
          declaredByteSize: item.declaredByteSize,
        })),
      });
      const validation = await dependencies.validation.validateForSubmission(
        validationRequest,
        context.id,
        validatedAt,
      );

      return dependencies.processing.process(
        photoPrivateProcessingRequestSchema.parse({
          schemaVersion: 'photo-private-processing-v1',
          processingRequestId: request.processingRequestId,
          submissionId: context.id,
          processorVersion: request.processorVersion,
          validation,
        }),
        processedAt,
      );
    },
  };
}
