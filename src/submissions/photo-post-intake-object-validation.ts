import { z } from 'zod';
import {
  inspectPhotoImage,
  PhotoImageInspectionError,
  type DecodedPhotoImage,
} from './photo-image-inspection';
import {
  photoObjectValidationReceiptSchema,
  photoObjectValidationRequestSchema,
  PhotoObjectValidationError,
  PhotoQuarantineObjectStoreError,
  type PhotoImageDecoder,
  type PhotoObjectValidationReceipt,
  type PhotoQuarantineObject,
  type PhotoQuarantineObjectStore,
  type PhotoUploadTargetReader,
  type ValidatedPhotoObject,
} from './photo-object-validation';
import {
  photoQuarantineObjectKey,
  type PhotoUploadReservationPersistence,
  type PhotoUploadReservationRecord,
} from './photo-upload-authorization';

const submissionIdSchema = z.uuid();

export interface PhotoPostIntakeObjectValidationDependencies {
  reservations: Pick<PhotoUploadReservationPersistence, 'readByIntakeRequestId'>;
  targets: PhotoUploadTargetReader;
  objects: PhotoQuarantineObjectStore;
  decoder?: PhotoImageDecoder;
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', copyArrayBuffer(bytes));
  return bytesToHex(new Uint8Array(digest));
}

function expectedMetadata(
  request: z.infer<typeof photoObjectValidationRequestSchema>,
  item: z.infer<typeof photoObjectValidationRequestSchema>['media'][number],
): Record<string, string> {
  return {
    'cpm-schema-version': 'photo-upload-v1',
    'cpm-reservation-id': item.quarantineUploadId,
    'cpm-intake-request-id': request.intakeRequestId,
    'cpm-target-type': request.targetType,
    'cpm-target-id': request.targetId,
    'cpm-purpose': item.purpose,
    'cpm-declared-byte-size': item.declaredByteSize.toString(),
  };
}

function exactMetadataMatches(
  actual: Record<string, string>,
  expected: Record<string, string>,
): boolean {
  const actualEntries = Object.entries(actual).sort(([left], [right]) => left.localeCompare(right));
  const expectedEntries = Object.entries(expected).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return (
    actualEntries.length === expectedEntries.length &&
    actualEntries.every(
      ([key, value], index) =>
        expectedEntries[index]?.[0] === key && expectedEntries[index]?.[1] === value,
    )
  );
}

function assertConsumedReservationSet(
  reservations: PhotoUploadReservationRecord[],
  request: z.infer<typeof photoObjectValidationRequestSchema>,
  submissionId: string,
  validatedAt: Date,
): void {
  const expectedIds = request.media.map((item) => item.quarantineUploadId).sort();
  const actualIds = reservations.map((reservation) => reservation.id).sort();
  if (
    expectedIds.length !== actualIds.length ||
    expectedIds.some((id, index) => id !== actualIds[index])
  ) {
    throw new PhotoObjectValidationError(
      'reservation_conflict',
      'The post-intake photo validation request does not match its private reservation set.',
    );
  }

  for (const reservation of reservations) {
    const consumedAt =
      reservation.consumedAt === null ? Number.NaN : Date.parse(reservation.consumedAt);
    const expiresAt = Date.parse(reservation.expiresAt);
    if (
      reservation.intakeRequestId !== request.intakeRequestId ||
      reservation.purpose !== 'public_gallery_candidate' ||
      reservation.consumedBySubmissionId !== submissionId ||
      !Number.isFinite(consumedAt) ||
      !Number.isFinite(expiresAt) ||
      consumedAt > validatedAt.getTime() ||
      consumedAt > expiresAt
    ) {
      throw new PhotoObjectValidationError(
        'reservation_unavailable',
        'The private upload reservation is not consumed by the expected Photos Submission.',
      );
    }
  }
}

function mapInspectionError(error: PhotoImageInspectionError): PhotoObjectValidationError {
  if (error.code === 'unsafe_dimensions') {
    return new PhotoObjectValidationError(
      'unsafe_dimensions',
      'The uploaded photo dimensions are not safe to process.',
      { cause: error },
    );
  }
  if (
    error.code === 'unsupported_format' ||
    error.code === 'unsafe_file_type' ||
    error.code === 'animated_media'
  ) {
    return new PhotoObjectValidationError(
      'unsupported_file',
      'The uploaded object is not a supported still-image file.',
      { cause: error },
    );
  }
  return new PhotoObjectValidationError(
    'decode_failed',
    'The uploaded photo could not be decoded safely.',
    { cause: error },
  );
}

export function createPhotoPostIntakeObjectValidationService(
  dependencies: PhotoPostIntakeObjectValidationDependencies,
) {
  const decoder: PhotoImageDecoder = dependencies.decoder ?? { decode: inspectPhotoImage };

  return {
    async validateForSubmission(
      rawInput: unknown,
      rawSubmissionId: unknown,
      validatedAt = new Date(),
    ): Promise<{
      receipt: PhotoObjectValidationReceipt;
      objects: ValidatedPhotoObject[];
    }> {
      if (!(validatedAt instanceof Date) || Number.isNaN(validatedAt.getTime())) {
        throw new PhotoObjectValidationError(
          'invalid_request',
          'Post-intake private photo validation time is invalid.',
        );
      }

      let request: z.infer<typeof photoObjectValidationRequestSchema>;
      let submissionId: string;
      try {
        request = photoObjectValidationRequestSchema.parse(rawInput);
        submissionId = submissionIdSchema.parse(rawSubmissionId);
      } catch (error) {
        throw new PhotoObjectValidationError(
          'invalid_request',
          'Post-intake private photo validation request failed validation.',
          { cause: error },
        );
      }

      let targetExists: boolean;
      let reservations: PhotoUploadReservationRecord[];
      try {
        [targetExists, reservations] = await Promise.all([
          dependencies.targets.targetExists(request.targetType, request.targetId),
          dependencies.reservations.readByIntakeRequestId(request.intakeRequestId),
        ]);
      } catch (error) {
        throw new PhotoObjectValidationError(
          'storage_failed',
          'Post-intake private photo validation context could not be read.',
          { cause: error },
        );
      }
      if (!targetExists) {
        throw new PhotoObjectValidationError(
          'target_unavailable',
          'The requested photo target is unavailable.',
        );
      }
      assertConsumedReservationSet(reservations, request, submissionId, validatedAt);

      const validatedObjects: ValidatedPhotoObject[] = [];
      for (const item of request.media) {
        const privateObjectKey = photoQuarantineObjectKey(item.quarantineUploadId);
        let object: PhotoQuarantineObject | null;
        try {
          object = await dependencies.objects.readPrivateObject(
            privateObjectKey,
            item.declaredByteSize,
          );
        } catch (error) {
          if (
            error instanceof PhotoQuarantineObjectStoreError &&
            error.code === 'object_too_large'
          ) {
            throw new PhotoObjectValidationError(
              'byte_size_mismatch',
              'The uploaded photo exceeds its declared byte size.',
              { cause: error },
            );
          }
          throw new PhotoObjectValidationError(
            'storage_failed',
            'The private photo object could not be read.',
            { cause: error },
          );
        }
        if (object === null) {
          throw new PhotoObjectValidationError(
            'object_missing',
            'A required private photo object was not found.',
          );
        }
        if (
          object.key !== privateObjectKey ||
          object.contentType !== item.declaredMimeType ||
          !exactMetadataMatches(object.customMetadata, expectedMetadata(request, item))
        ) {
          throw new PhotoObjectValidationError(
            'object_metadata_mismatch',
            'The uploaded photo does not match its private authorization metadata.',
          );
        }
        if (
          object.byteSize !== item.declaredByteSize ||
          object.body.byteLength !== item.declaredByteSize ||
          object.byteSize !== object.body.byteLength
        ) {
          throw new PhotoObjectValidationError(
            'byte_size_mismatch',
            'The uploaded photo byte size does not match its declaration.',
          );
        }

        let decoded: DecodedPhotoImage;
        try {
          decoded = await decoder.decode(object.body);
        } catch (error) {
          if (error instanceof PhotoImageInspectionError) throw mapInspectionError(error);
          throw new PhotoObjectValidationError(
            'decode_failed',
            'The uploaded photo could not be decoded safely.',
            { cause: error },
          );
        }
        if (decoded.mimeType !== item.declaredMimeType) {
          throw new PhotoObjectValidationError(
            'object_metadata_mismatch',
            'The uploaded photo signature does not match its declared content type.',
          );
        }

        validatedObjects.push({
          quarantineUploadId: item.quarantineUploadId,
          privateObjectKey,
          body: object.body,
          mimeType: decoded.mimeType,
          byteSize: object.byteSize,
          width: decoded.width,
          height: decoded.height,
          contentHash: await sha256(object.body),
        });
      }

      const receipt = photoObjectValidationReceiptSchema.parse({
        schemaVersion: 'photo-object-validation-receipt-v1',
        intakeRequestId: request.intakeRequestId,
        targetType: request.targetType,
        targetId: request.targetId,
        validatedAt: validatedAt.toISOString(),
        media: validatedObjects.map((object) => ({
          quarantineUploadId: object.quarantineUploadId,
          mimeType: object.mimeType,
          byteSize: object.byteSize,
          width: object.width,
          height: object.height,
          contentHash: object.contentHash,
        })),
      });
      return { receipt, objects: validatedObjects };
    },
  };
}
