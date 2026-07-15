import { z } from 'zod';
import {
  inspectPhotoImage,
  PhotoImageInspectionError,
} from './photo-image-inspection';
import {
  photoObjectValidationReceiptSchema,
  photoObjectValidationRequestSchema,
  photoQuarantineObjectKey,
  PhotoObjectValidationError,
  PhotoQuarantineObjectStoreError,
  type PhotoObjectValidationDependencies,
  type PhotoObjectValidationReceipt,
  type ValidatedPhotoObject,
} from './photo-object-validation';

const maximumObjectBytes = 5_000_000;
const maximumDimension = 20_000;
const maximumPixels = 100_000_000;
const submissionIdSchema = z.string().uuid();

function parseDate(value: string, code: 'reservation_conflict' | 'invalid_request'): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new PhotoObjectValidationError(code, 'Private photo chronology is invalid.');
  }
  return parsed;
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', copyArrayBuffer(bytes));
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function expectedMetadata(
  intakeRequestId: string,
  targetType: 'entity' | 'location',
  targetId: string,
  item: {
    quarantineUploadId: string;
    purpose: 'public_gallery_candidate';
    declaredByteSize: number;
  },
): Record<string, string> {
  return {
    'cpm-schema-version': 'photo-upload-v1',
    'cpm-reservation-id': item.quarantineUploadId,
    'cpm-intake-request-id': intakeRequestId,
    'cpm-target-type': targetType,
    'cpm-target-id': targetId,
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

function mapObjectStoreError(error: unknown): PhotoObjectValidationError {
  if (error instanceof PhotoQuarantineObjectStoreError) {
    return new PhotoObjectValidationError(
      error.code === 'object_too_large' ? 'object_too_large' : 'object_conflict',
      'The private photo object could not be read safely.',
      { cause: error },
    );
  }
  return new PhotoObjectValidationError(
    'object_conflict',
    'The private photo object could not be read safely.',
    { cause: error },
  );
}

function mapInspectionError(error: unknown): PhotoObjectValidationError {
  if (error instanceof PhotoImageInspectionError) {
    const code =
      error.code === 'unsupported_media'
        ? 'unsupported_media'
        : error.code === 'dimension_limit'
          ? 'dimension_limit'
          : 'malformed_image';
    return new PhotoObjectValidationError(code, 'The private photo bytes failed inspection.', {
      cause: error,
    });
  }
  return new PhotoObjectValidationError(
    'malformed_image',
    'The private photo bytes failed inspection.',
    { cause: error },
  );
}

export function createPhotoPostIntakeObjectValidationService(
  dependencies: PhotoObjectValidationDependencies,
) {
  return {
    async validateForSubmission(
      rawInput: unknown,
      rawSubmissionId: unknown,
      validatedAt = new Date(),
    ): Promise<{
      receipt: PhotoObjectValidationReceipt;
      objects: ValidatedPhotoObject[];
    }> {
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
      if (!(validatedAt instanceof Date) || Number.isNaN(validatedAt.getTime())) {
        throw new PhotoObjectValidationError(
          'invalid_request',
          'Post-intake private photo validation time is invalid.',
        );
      }

      let targetExists: boolean;
      try {
        targetExists = await dependencies.targetReader.targetExists(
          request.targetType,
          request.targetId,
        );
      } catch (error) {
        throw new PhotoObjectValidationError(
          'target_unavailable',
          'The private photo target could not be checked.',
          { cause: error },
        );
      }
      if (!targetExists) {
        throw new PhotoObjectValidationError(
          'target_unavailable',
          'The private photo target is unavailable.',
        );
      }

      let reservations;
      try {
        reservations = await Promise.all(
          request.media.map((item) =>
            dependencies.persistence.readReservation(item.quarantineUploadId),
          ),
        );
      } catch (error) {
        throw new PhotoObjectValidationError(
          'reservation_conflict',
          'The consumed private upload reservations could not be loaded.',
          { cause: error },
        );
      }
      if (reservations.some((reservation) => reservation === null)) {
        throw new PhotoObjectValidationError(
          'reservation_conflict',
          'A consumed private upload reservation is unavailable.',
        );
      }

      const objects: ValidatedPhotoObject[] = [];
      for (const [index, item] of request.media.entries()) {
        const reservation = reservations[index];
        if (reservation === null || reservation === undefined) {
          throw new PhotoObjectValidationError(
            'reservation_conflict',
            'A consumed private upload reservation is unavailable.',
          );
        }
        const consumedAt =
          reservation.consumedAt === null
            ? null
            : parseDate(reservation.consumedAt.toISOString(), 'reservation_conflict');
        const expiresAt = parseDate(reservation.expiresAt.toISOString(), 'reservation_conflict');
        if (
          reservation.id !== item.quarantineUploadId ||
          reservation.intakeRequestId !== request.intakeRequestId ||
          reservation.purpose !== item.purpose ||
          reservation.consumedBySubmissionId !== submissionId ||
          consumedAt === null ||
          consumedAt.getTime() > validatedAt.getTime() ||
          consumedAt.getTime() > expiresAt.getTime()
        ) {
          throw new PhotoObjectValidationError(
            'reservation_conflict',
            'The private upload reservation is not consumed by the expected Photos Submission.',
          );
        }

        const privateObjectKey = photoQuarantineObjectKey(item.quarantineUploadId);
        let object;
        try {
          object = await dependencies.objectStore.readPrivateObject(
            privateObjectKey,
            Math.min(maximumObjectBytes, item.declaredByteSize + 1),
          );
        } catch (error) {
          throw mapObjectStoreError(error);
        }
        if (object === null) {
          throw new PhotoObjectValidationError(
            'object_missing',
            'The private photo object is unavailable.',
          );
        }
        if (
          object.key !== privateObjectKey ||
          object.byteSize !== item.declaredByteSize ||
          object.body.byteLength !== item.declaredByteSize ||
          object.contentType !== item.declaredMimeType ||
          !exactMetadataMatches(
            object.customMetadata,
            expectedMetadata(request.intakeRequestId, request.targetType, request.targetId, item),
          )
        ) {
          throw new PhotoObjectValidationError(
            'object_conflict',
            'The private photo object does not match its consumed reservation.',
          );
        }

        let inspected;
        try {
          inspected = inspectPhotoImage(object.body);
        } catch (error) {
          throw mapInspectionError(error);
        }
        if (
          inspected.mimeType !== item.declaredMimeType ||
          inspected.animated ||
          inspected.width > maximumDimension ||
          inspected.height > maximumDimension ||
          inspected.width * inspected.height > maximumPixels
        ) {
          throw new PhotoObjectValidationError(
            inspected.width > maximumDimension ||
              inspected.height > maximumDimension ||
              inspected.width * inspected.height > maximumPixels
              ? 'dimension_limit'
              : 'object_conflict',
            'The private photo object exceeds its post-intake validation boundary.',
          );
        }

        objects.push({
          quarantineUploadId: item.quarantineUploadId,
          privateObjectKey,
          mimeType: inspected.mimeType,
          byteSize: object.byteSize,
          width: inspected.width,
          height: inspected.height,
          contentHash: await sha256(object.body),
          body: object.body,
        });
      }

      const receipt = photoObjectValidationReceiptSchema.parse({
        schemaVersion: 'photo-object-validation-receipt-v1',
        state: 'validated',
        intakeRequestId: request.intakeRequestId,
        targetType: request.targetType,
        targetId: request.targetId,
        validatedAt: validatedAt.toISOString(),
        media: objects.map((object) => ({
          quarantineUploadId: object.quarantineUploadId,
          mimeType: object.mimeType,
          byteSize: object.byteSize,
          width: object.width,
          height: object.height,
          contentHash: object.contentHash,
        })),
      });
      return { receipt, objects };
    },
  };
}
