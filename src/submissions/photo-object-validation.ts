import { z } from 'zod';
import {
  inspectPhotoImage,
  PhotoImageInspectionError,
  type DecodedPhotoImage,
} from './photo-image-inspection';
import {
  photoQuarantineObjectKey,
  type PhotoUploadReservationPersistence,
  type PhotoUploadReservationRecord,
} from './photo-upload-authorization';
import { submissionMediaMimeTypeSchema } from './photo-media-contract';

const MAX_UPLOAD_ITEMS = 8;
const MAX_UPLOAD_BYTES = 5_000_000;
const MAX_TOTAL_BYTES = 40_000_000;

export const photoObjectValidationItemSchema = z
  .object({
    quarantineUploadId: z.uuid(),
    purpose: z.literal('public_gallery_candidate'),
    declaredMimeType: submissionMediaMimeTypeSchema,
    declaredByteSize: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  })
  .strict();

export const photoObjectValidationRequestSchema = z
  .object({
    schemaVersion: z.literal('photo-object-validation-v1'),
    intakeRequestId: z.uuid(),
    targetType: z.enum(['entity', 'location']),
    targetId: z.uuid(),
    media: z.array(photoObjectValidationItemSchema).min(1).max(MAX_UPLOAD_ITEMS),
  })
  .strict()
  .superRefine((request, context) => {
    const ids = new Set<string>();
    request.media.forEach((item, index) => {
      if (ids.has(item.quarantineUploadId)) {
        context.addIssue({
          code: 'custom',
          path: ['media', index, 'quarantineUploadId'],
          message: 'A quarantine upload may be validated only once in a request.',
        });
      }
      ids.add(item.quarantineUploadId);
    });
    const total = request.media.reduce((sum, item) => sum + item.declaredByteSize, 0);
    if (total > MAX_TOTAL_BYTES) {
      context.addIssue({
        code: 'custom',
        path: ['media'],
        message: 'Photo object validation exceeds the 40 MB total limit.',
      });
    }
  });

export const photoObjectValidationReceiptSchema = z
  .object({
    schemaVersion: z.literal('photo-object-validation-receipt-v1'),
    intakeRequestId: z.uuid(),
    targetType: z.enum(['entity', 'location']),
    targetId: z.uuid(),
    validatedAt: z.iso.datetime({ offset: true }),
    media: z
      .array(
        z
          .object({
            quarantineUploadId: z.uuid(),
            mimeType: submissionMediaMimeTypeSchema,
            byteSize: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
            width: z.number().int().positive(),
            height: z.number().int().positive(),
            contentHash: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_UPLOAD_ITEMS),
  })
  .strict();

export type PhotoObjectValidationRequest = z.infer<typeof photoObjectValidationRequestSchema>;
export type PhotoObjectValidationItem = z.infer<typeof photoObjectValidationItemSchema>;
export type PhotoObjectValidationReceipt = z.infer<typeof photoObjectValidationReceiptSchema>;

export interface PhotoQuarantineObject {
  key: string;
  body: Uint8Array;
  byteSize: number;
  contentType: string | null;
  customMetadata: Record<string, string>;
}

export interface PhotoQuarantineObjectStore {
  readPrivateObject(key: string, maximumBytes: number): Promise<PhotoQuarantineObject | null>;
}

export interface PhotoUploadTargetReader {
  targetExists(targetType: 'entity' | 'location', targetId: string): Promise<boolean>;
}

export interface PhotoImageDecoder {
  decode(bytes: Uint8Array): Promise<DecodedPhotoImage> | DecodedPhotoImage;
}

export interface ValidatedPhotoObject {
  quarantineUploadId: string;
  privateObjectKey: string;
  body: Uint8Array;
  mimeType: z.infer<typeof submissionMediaMimeTypeSchema>;
  byteSize: number;
  width: number;
  height: number;
  contentHash: string;
}

export interface PhotoObjectValidationResult {
  receipt: PhotoObjectValidationReceipt;
  objects: ValidatedPhotoObject[];
}

export class PhotoQuarantineObjectStoreError extends Error {
  constructor(
    readonly code: 'object_too_large' | 'read_failed',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PhotoQuarantineObjectStoreError';
  }
}

export class PhotoObjectValidationError extends Error {
  constructor(
    readonly code:
      | 'invalid_request'
      | 'target_unavailable'
      | 'reservation_conflict'
      | 'reservation_unavailable'
      | 'object_missing'
      | 'object_metadata_mismatch'
      | 'byte_size_mismatch'
      | 'unsupported_file'
      | 'decode_failed'
      | 'unsafe_dimensions'
      | 'storage_failed',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PhotoObjectValidationError';
  }
}

export interface PhotoObjectValidationServiceDependencies {
  reservations: Pick<PhotoUploadReservationPersistence, 'readByIntakeRequestId'>;
  targets: PhotoUploadTargetReader;
  objects: PhotoQuarantineObjectStore;
  decoder?: PhotoImageDecoder;
}

function validateDate(value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new PhotoObjectValidationError(
      'invalid_request',
      'Photo object validation timestamp is invalid.',
    );
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToHex(new Uint8Array(digest));
}

function expectedMetadata(
  request: PhotoObjectValidationRequest,
  item: PhotoObjectValidationItem,
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

function assertMetadata(
  object: PhotoQuarantineObject,
  request: PhotoObjectValidationRequest,
  item: PhotoObjectValidationItem,
): void {
  if (
    object.key !== photoQuarantineObjectKey(item.quarantineUploadId) ||
    object.contentType !== item.declaredMimeType
  ) {
    throw new PhotoObjectValidationError(
      'object_metadata_mismatch',
      'The uploaded photo does not match its private authorization metadata.',
    );
  }
  for (const [key, value] of Object.entries(expectedMetadata(request, item))) {
    if (object.customMetadata[key] !== value) {
      throw new PhotoObjectValidationError(
        'object_metadata_mismatch',
        'The uploaded photo does not match its private authorization metadata.',
      );
    }
  }
}

function assertByteSize(object: PhotoQuarantineObject, item: PhotoObjectValidationItem): void {
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
}

function assertReservationSet(
  reservations: PhotoUploadReservationRecord[],
  request: PhotoObjectValidationRequest,
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
      'The photo validation request does not match its private reservation set.',
    );
  }
  if (
    reservations.some(
      (reservation) =>
        reservation.intakeRequestId !== request.intakeRequestId ||
        reservation.purpose !== 'public_gallery_candidate' ||
        reservation.consumedBySubmissionId !== null ||
        reservation.consumedAt !== null ||
        Date.parse(reservation.expiresAt) <= validatedAt.getTime(),
    )
  ) {
    throw new PhotoObjectValidationError(
      'reservation_unavailable',
      'The photo validation reservation is unavailable.',
    );
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

function assertDeclaredMime(
  decoded: DecodedPhotoImage,
  item: PhotoObjectValidationItem,
): asserts decoded is DecodedPhotoImage & {
  mimeType: z.infer<typeof submissionMediaMimeTypeSchema>;
} {
  if (decoded.mimeType !== item.declaredMimeType) {
    throw new PhotoObjectValidationError(
      'object_metadata_mismatch',
      'The uploaded photo signature does not match its declared content type.',
    );
  }
}

export function createPhotoObjectValidationService(
  dependencies: PhotoObjectValidationServiceDependencies,
) {
  const decoder: PhotoImageDecoder = dependencies.decoder ?? {
    decode: inspectPhotoImage,
  };

  return {
    async validate(
      rawInput: unknown,
      validatedAt = new Date(),
    ): Promise<PhotoObjectValidationResult> {
      validateDate(validatedAt);

      let request: PhotoObjectValidationRequest;
      try {
        request = photoObjectValidationRequestSchema.parse(rawInput);
      } catch (error) {
        throw new PhotoObjectValidationError(
          'invalid_request',
          'Photo object validation request failed validation.',
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
          'Private photo validation context could not be read.',
          { cause: error },
        );
      }

      if (!targetExists) {
        throw new PhotoObjectValidationError(
          'target_unavailable',
          'The requested photo target is unavailable.',
        );
      }
      assertReservationSet(reservations, request, validatedAt);

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

        assertMetadata(object, request, item);
        assertByteSize(object, item);

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
        assertDeclaredMime(decoded, item);

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

      return {
        receipt,
        objects: validatedObjects,
      };
    },
  };
}
