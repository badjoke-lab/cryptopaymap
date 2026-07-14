import { z } from 'zod';
import { submissionMediaMimeTypeSchema } from './photo-media-contract';

const MAX_UPLOAD_ITEMS = 8;
const MAX_UPLOAD_BYTES = 5_000_000;
const MAX_TOTAL_BYTES = 40_000_000;
const DEFAULT_AUTHORIZATION_TTL_MS = 10 * 60 * 1_000;
const MAX_AUTHORIZATION_TTL_MS = 15 * 60 * 1_000;

export const photoUploadAuthorizationItemSchema = z
  .object({
    purpose: z.literal('public_gallery_candidate'),
    declaredMimeType: submissionMediaMimeTypeSchema,
    declaredByteSize: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  })
  .strict();

export const photoUploadAuthorizationRequestSchema = z
  .object({
    schemaVersion: z.literal('photo-upload-authorization-v1'),
    intakeRequestId: z.uuid(),
    targetType: z.enum(['entity', 'location']),
    targetId: z.uuid(),
    media: z.array(photoUploadAuthorizationItemSchema).min(1).max(MAX_UPLOAD_ITEMS),
  })
  .strict()
  .superRefine((request, context) => {
    const totalBytes = request.media.reduce((total, item) => total + item.declaredByteSize, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      context.addIssue({
        code: 'custom',
        path: ['media'],
        message: 'Photos upload authorization exceeds the 40 MB total limit.',
      });
    }
  });

export const photoUploadRequiredHeadersSchema = z.record(z.string().min(1), z.string().min(1));

export const photoUploadAuthorizationReceiptSchema = z
  .object({
    schemaVersion: z.literal('photo-upload-authorization-receipt-v1'),
    state: z.enum(['committed', 'replayed']),
    intakeRequestId: z.uuid(),
    expiresAt: z.iso.datetime({ offset: true }),
    uploads: z
      .array(
        z
          .object({
            quarantineUploadId: z.uuid(),
            method: z.literal('PUT'),
            uploadUrl: z.url().refine((value) => value.startsWith('https://'), {
              message: 'Upload authorization URLs must use HTTPS.',
            }),
            requiredHeaders: photoUploadRequiredHeadersSchema,
            declaredByteSize: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_UPLOAD_ITEMS),
  })
  .strict();

export type PhotoUploadAuthorizationRequest = z.infer<typeof photoUploadAuthorizationRequestSchema>;
export type PhotoUploadAuthorizationReceipt = z.infer<typeof photoUploadAuthorizationReceiptSchema>;
export type PhotoUploadAuthorizationItem = z.infer<typeof photoUploadAuthorizationItemSchema>;

export interface PhotoUploadReservationRecord {
  id: string;
  intakeRequestId: string;
  purpose: 'evidence_image' | 'owner_verification_proof' | 'public_gallery_candidate';
  expiresAt: string;
  consumedBySubmissionId: string | null;
  consumedAt: string | null;
  createdAt: string;
}

export interface CreatePhotoUploadReservationCommand {
  reservations: Array<{
    id: string;
    intakeRequestId: string;
    purpose: 'public_gallery_candidate';
    expiresAt: Date;
    createdAt: Date;
  }>;
}

export interface CreatePhotoUploadReservationReceipt {
  insertedCount: number;
  reservations: PhotoUploadReservationRecord[];
}

export interface PhotoUploadReservationPersistence {
  readByIntakeRequestId(intakeRequestId: string): Promise<PhotoUploadReservationRecord[]>;
  createReservations(
    command: CreatePhotoUploadReservationCommand,
  ): Promise<CreatePhotoUploadReservationReceipt>;
}

export interface QuarantineUploadAuthorizationCommand {
  objectKey: string;
  expiresAt: Date;
  declaredMimeType: z.infer<typeof submissionMediaMimeTypeSchema>;
  metadata: Record<string, string>;
}

export interface QuarantineUploadAuthorization {
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
}

export interface QuarantineUploadAuthorizer {
  authorizeUpload(
    command: QuarantineUploadAuthorizationCommand,
  ): Promise<QuarantineUploadAuthorization>;
}

export class PhotoUploadAuthorizationError extends Error {
  constructor(
    readonly code:
      | 'invalid_request'
      | 'idempotency_conflict'
      | 'reservation_unavailable'
      | 'persistence_conflict'
      | 'authorization_failed',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PhotoUploadAuthorizationError';
  }
}

export interface PhotoUploadAuthorizationServiceDependencies {
  persistence: PhotoUploadReservationPersistence;
  authorizer: QuarantineUploadAuthorizer;
  authorizationTtlMs?: number;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonicalRequestString(request: PhotoUploadAuthorizationRequest): string {
  return JSON.stringify({
    schemaVersion: request.schemaVersion,
    intakeRequestId: request.intakeRequestId,
    targetType: request.targetType,
    targetId: request.targetId,
    media: request.media.map((item) => ({
      purpose: item.purpose,
      declaredMimeType: item.declaredMimeType,
      declaredByteSize: item.declaredByteSize,
    })),
  });
}

async function fingerprintRequest(request: PhotoUploadAuthorizationRequest): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalRequestString(request)),
  );
  return bytesToHex(new Uint8Array(digest));
}

function formatUuid(bytes: Uint8Array): string {
  const hex = bytesToHex(bytes.slice(0, 16));
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function deterministicReservationId(fingerprint: string, index: number): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`photo-upload-reservation-v1:${fingerprint}:${index}`),
    ),
  );
  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x80;
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80;
  return z.uuid().parse(formatUuid(digest));
}

export function photoQuarantineObjectKey(reservationId: string): string {
  return `quarantine/photos/v1/${z.uuid().parse(reservationId)}`;
}

function validateDate(value: Date, label: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new PhotoUploadAuthorizationError('invalid_request', `${label} is invalid.`);
  }
}

function validateTtl(ttlMs: number): number {
  if (!Number.isInteger(ttlMs) || ttlMs < 60_000 || ttlMs > MAX_AUTHORIZATION_TTL_MS) {
    throw new Error('Photo upload authorization TTL must be between 60 seconds and 15 minutes.');
  }
  return ttlMs;
}

function assertExactReservationSet(
  existing: PhotoUploadReservationRecord[],
  expectedIds: string[],
  requestedAt: Date,
): void {
  const expected = [...expectedIds].sort();
  const actual = existing.map((reservation) => reservation.id).sort();
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new PhotoUploadAuthorizationError(
      'idempotency_conflict',
      'The upload authorization request ID was reused with different content.',
    );
  }
  if (
    existing.some(
      (reservation) =>
        reservation.purpose !== 'public_gallery_candidate' ||
        reservation.consumedBySubmissionId !== null ||
        reservation.consumedAt !== null ||
        Date.parse(reservation.expiresAt) <= requestedAt.getTime(),
    )
  ) {
    throw new PhotoUploadAuthorizationError(
      'reservation_unavailable',
      'The upload authorization reservation is unavailable.',
    );
  }
}

function metadataFor(
  request: PhotoUploadAuthorizationRequest,
  reservationId: string,
  item: PhotoUploadAuthorizationItem,
): Record<string, string> {
  return {
    'cpm-schema-version': 'photo-upload-v1',
    'cpm-reservation-id': reservationId,
    'cpm-intake-request-id': request.intakeRequestId,
    'cpm-target-type': request.targetType,
    'cpm-target-id': request.targetId,
    'cpm-purpose': item.purpose,
    'cpm-declared-byte-size': item.declaredByteSize.toString(),
  };
}

function assertAuthorizationHeaders(
  authorization: QuarantineUploadAuthorization,
  command: QuarantineUploadAuthorizationCommand,
): void {
  const parsedUrl = z.url().parse(authorization.uploadUrl);
  if (!parsedUrl.startsWith('https://')) {
    throw new PhotoUploadAuthorizationError(
      'authorization_failed',
      'The upload authorizer returned a non-HTTPS URL.',
    );
  }
  const headers = photoUploadRequiredHeadersSchema.parse(authorization.requiredHeaders);
  if (headers['content-type'] !== command.declaredMimeType) {
    throw new PhotoUploadAuthorizationError(
      'authorization_failed',
      'The upload authorizer did not bind the declared content type.',
    );
  }
  for (const [key, value] of Object.entries(command.metadata)) {
    if (headers[`x-amz-meta-${key}`] !== value) {
      throw new PhotoUploadAuthorizationError(
        'authorization_failed',
        'The upload authorizer did not bind required private metadata.',
      );
    }
  }
}

export function createPhotoUploadAuthorizationService(
  dependencies: PhotoUploadAuthorizationServiceDependencies,
) {
  const authorizationTtlMs = validateTtl(
    dependencies.authorizationTtlMs ?? DEFAULT_AUTHORIZATION_TTL_MS,
  );

  return {
    async authorize(
      rawInput: unknown,
      requestedAt = new Date(),
    ): Promise<PhotoUploadAuthorizationReceipt> {
      validateDate(requestedAt, 'Photo upload authorization requestedAt');

      let request: PhotoUploadAuthorizationRequest;
      try {
        request = photoUploadAuthorizationRequestSchema.parse(rawInput);
      } catch (error) {
        throw new PhotoUploadAuthorizationError(
          'invalid_request',
          'Photo upload authorization request failed validation.',
          { cause: error },
        );
      }

      const fingerprint = await fingerprintRequest(request);
      const reservationIds = await Promise.all(
        request.media.map((_, index) => deterministicReservationId(fingerprint, index)),
      );
      let state: 'committed' | 'replayed' = 'replayed';
      let reservations = await dependencies.persistence.readByIntakeRequestId(
        request.intakeRequestId,
      );

      if (reservations.length === 0) {
        const expiresAt = new Date(requestedAt.getTime() + authorizationTtlMs);
        try {
          const receipt = await dependencies.persistence.createReservations({
            reservations: reservationIds.map((id) => ({
              id,
              intakeRequestId: request.intakeRequestId,
              purpose: 'public_gallery_candidate',
              expiresAt,
              createdAt: requestedAt,
            })),
          });
          reservations = receipt.reservations;
          state = receipt.insertedCount === reservationIds.length ? 'committed' : 'replayed';
        } catch (error) {
          const raced = await dependencies.persistence.readByIntakeRequestId(
            request.intakeRequestId,
          );
          if (raced.length > 0) {
            assertExactReservationSet(raced, reservationIds, requestedAt);
            reservations = raced;
            state = 'replayed';
          } else {
            throw new PhotoUploadAuthorizationError(
              'persistence_conflict',
              'Photo upload reservations could not be persisted.',
              { cause: error },
            );
          }
        }
      }

      assertExactReservationSet(reservations, reservationIds, requestedAt);
      const reservationById = new Map(
        reservations.map((reservation) => [reservation.id, reservation]),
      );
      const expiresAt = reservations[0]?.expiresAt;
      if (
        expiresAt === undefined ||
        reservations.some((reservation) => reservation.expiresAt !== expiresAt)
      ) {
        throw new PhotoUploadAuthorizationError(
          'persistence_conflict',
          'Photo upload reservations have inconsistent expiry.',
        );
      }

      try {
        const uploads = await Promise.all(
          request.media.map(async (item, index) => {
            const reservationId = reservationIds[index];
            if (reservationId === undefined || reservationById.get(reservationId) === undefined) {
              throw new PhotoUploadAuthorizationError(
                'persistence_conflict',
                'Photo upload reservation mapping is incomplete.',
              );
            }
            const command: QuarantineUploadAuthorizationCommand = {
              objectKey: photoQuarantineObjectKey(reservationId),
              expiresAt: new Date(expiresAt),
              declaredMimeType: item.declaredMimeType,
              metadata: metadataFor(request, reservationId, item),
            };
            const authorization = await dependencies.authorizer.authorizeUpload(command);
            assertAuthorizationHeaders(authorization, command);
            return {
              quarantineUploadId: reservationId,
              method: 'PUT' as const,
              uploadUrl: authorization.uploadUrl,
              requiredHeaders: authorization.requiredHeaders,
              declaredByteSize: item.declaredByteSize,
            };
          }),
        );

        return photoUploadAuthorizationReceiptSchema.parse({
          schemaVersion: 'photo-upload-authorization-receipt-v1',
          state,
          intakeRequestId: request.intakeRequestId,
          expiresAt,
          uploads,
        });
      } catch (error) {
        if (error instanceof PhotoUploadAuthorizationError) throw error;
        throw new PhotoUploadAuthorizationError(
          'authorization_failed',
          'Photo upload authorization could not be issued.',
          { cause: error },
        );
      }
    },
  };
}
