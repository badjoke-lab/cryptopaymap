import { z } from 'zod';
import { privateMediaDerivativeKey } from '../admin/media-review/storage-plan';
import {
  inspectPhotoImage,
  PhotoImageInspectionError,
  type DecodedPhotoImage,
} from './photo-image-inspection';
import {
  photosReviewProjectionSchema,
  publicGalleryMediaRoleSchema,
  submissionMediaMimeTypeSchema,
  type PhotosReviewProjection,
} from './photo-media-contract';
import {
  photoObjectValidationReceiptSchema,
  type ValidatedPhotoObject,
} from './photo-object-validation';
import { photoQuarantineObjectKey } from './photo-upload-authorization';

const MAX_ITEMS = 8;
const MAX_DISPLAY_BYTES = 5_000_000;
const MAX_THUMBNAIL_BYTES = 1_000_000;
const MAX_DISPLAY_DIMENSION = 2_048;
const MAX_THUMBNAIL_DIMENSION = 512;

const processingWorkflowStatusSchema = z.enum([
  'received',
  'triage',
  'in_review',
  'needs_information',
  'on_hold',
]);

const processorVersionSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/);

const validatedPhotoObjectSchema = z
  .object({
    quarantineUploadId: z.uuid(),
    privateObjectKey: z.string().min(1).max(512),
    body: z.instanceof(Uint8Array),
    mimeType: submissionMediaMimeTypeSchema,
    byteSize: z.number().int().min(1).max(5_000_000),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const photoPrivateProcessingRequestSchema = z
  .object({
    schemaVersion: z.literal('photo-private-processing-v1'),
    processingRequestId: z.uuid(),
    submissionId: z.uuid(),
    processorVersion: processorVersionSchema,
    validation: z
      .object({
        receipt: photoObjectValidationReceiptSchema,
        objects: z.array(validatedPhotoObjectSchema).min(1).max(MAX_ITEMS),
      })
      .strict(),
  })
  .strict();

export const photoProcessedDerivativeSchema = z
  .object({
    variant: z.enum(['display', 'thumbnail']),
    body: z.instanceof(Uint8Array),
    mimeType: z.enum(['image/jpeg', 'image/webp']),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    metadataStripped: z.literal(true),
    orientationNormalized: z.literal(true),
  })
  .strict();

const handoffReviewContextSchema = z
  .object({
    role: publicGalleryMediaRoleSchema,
    capturedAt: z.string().nullable(),
    description: z.string().nullable(),
    suggestedAltText: z.string().nullable(),
    photographerPresent: z.boolean(),
    rightsStatus: z.enum(['submitted_with_permission', 'licensed', 'public_domain']),
    rightsHolderPresent: z.boolean(),
    permissionReferencePresent: z.boolean(),
    licenseName: z.string().nullable(),
    licenseUrl: z.string().nullable(),
    publicDisplayPermission: z.literal(true),
  })
  .strict();

export const photoMediaHandoffEventPayloadSchema = z
  .object({
    schemaVersion: z.literal('photo-media-handoff-event-v1'),
    processingRequestId: z.uuid(),
    requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    submissionId: z.uuid(),
    processorVersion: processorVersionSchema,
    processedAt: z.iso.datetime({ offset: true }),
    targetType: z.enum(['entity', 'location']),
    targetId: z.uuid(),
    media: z
      .array(
        z
          .object({
            quarantineUploadId: z.uuid(),
            mediaAssetId: z.uuid(),
            originalFileId: z.uuid(),
            displayFileId: z.uuid(),
            thumbnailFileId: z.uuid(),
            originalContentHash: z.string().regex(/^[a-f0-9]{64}$/),
            displayContentHash: z.string().regex(/^[a-f0-9]{64}$/),
            thumbnailContentHash: z.string().regex(/^[a-f0-9]{64}$/),
            reviewContext: handoffReviewContextSchema,
          })
          .strict(),
      )
      .min(1)
      .max(MAX_ITEMS),
  })
  .strict();

export const photoPrivateProcessingReceiptSchema = z
  .object({
    schemaVersion: z.literal('photo-private-processing-receipt-v1'),
    state: z.enum(['committed', 'replayed']),
    processingRequestId: z.uuid(),
    submissionId: z.uuid(),
    processedAt: z.iso.datetime({ offset: true }),
    media: z
      .array(
        z
          .object({
            quarantineUploadId: z.uuid(),
            mediaAssetId: z.uuid(),
            originalContentHash: z.string().regex(/^[a-f0-9]{64}$/),
            displayFileId: z.uuid(),
            displayContentHash: z.string().regex(/^[a-f0-9]{64}$/),
            thumbnailFileId: z.uuid(),
            thumbnailContentHash: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_ITEMS),
  })
  .strict();

export type PhotoPrivateProcessingRequest = z.infer<typeof photoPrivateProcessingRequestSchema>;
export type PhotoProcessedDerivative = z.infer<typeof photoProcessedDerivativeSchema>;
export type PhotoMediaHandoffEventPayload = z.infer<typeof photoMediaHandoffEventPayloadSchema>;
export type PhotoPrivateProcessingReceipt = z.infer<typeof photoPrivateProcessingReceiptSchema>;

export interface PhotoProcessingReservationSnapshot {
  id: string;
  intakeRequestId: string;
  purpose: 'evidence_image' | 'owner_verification_proof' | 'public_gallery_candidate';
  expiresAt: string;
  consumedBySubmissionId: string | null;
  consumedAt: string | null;
}

export interface PhotoProcessingSubmissionContext {
  id: string;
  intakeRequestId: string;
  submissionType: 'photos';
  targetType: 'entity' | 'location';
  targetId: string;
  workflowStatus: z.infer<typeof processingWorkflowStatusSchema>;
  updatedAt: string;
  normalizedPayload: unknown;
  reservations: PhotoProcessingReservationSnapshot[];
}

export interface PhotoPrivateProcessorCommand {
  source: ValidatedPhotoObject;
  role: z.infer<typeof publicGalleryMediaRoleSchema>;
  processorVersion: string;
}

export interface PhotoPrivateProcessor {
  process(command: PhotoPrivateProcessorCommand): Promise<PhotoProcessedDerivative[]>;
}

export interface PrivatePhotoDerivativeWriteCommand {
  key: string;
  body: Uint8Array;
  mimeType: 'image/jpeg' | 'image/webp';
  contentHash: string;
  mediaAssetId: string;
  variant: 'display' | 'thumbnail';
  sourceContentHash: string;
}

export interface PrivatePhotoDerivativeStore {
  writePrivateDerivative(
    command: PrivatePhotoDerivativeWriteCommand,
  ): Promise<{ state: 'created' | 'replayed' }>;
  deletePrivateDerivative(key: string): Promise<void>;
}

export interface PhotoMediaAssetInsert {
  id: string;
  purpose: 'public_gallery_candidate';
  role: z.infer<typeof publicGalleryMediaRoleSchema>;
  reviewStatus: 'pending';
  rightsStatus: 'unknown';
  visibility: 'private';
  entityId: string | null;
  locationId: string | null;
  displayOrder: number;
  capturedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PhotoMediaFileInsert {
  id: string;
  mediaAssetId: string;
  variant: 'original' | 'display' | 'thumbnail';
  storageScope: 'quarantine' | 'private';
  storageKey: string;
  originalFilename: null;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  contentHash: string;
  createdAt: Date;
}

export interface PhotoMediaHandoffCommitCommand {
  eventId: string;
  eventPayload: PhotoMediaHandoffEventPayload;
  submissionId: string;
  expectedSubmissionUpdatedAt: Date;
  expectedWorkflowStatus: z.infer<typeof processingWorkflowStatusSchema>;
  assets: PhotoMediaAssetInsert[];
  files: PhotoMediaFileInsert[];
}

export interface PhotoMediaHandoffPersistence {
  loadSubmissionContext(submissionId: string): Promise<PhotoProcessingSubmissionContext | null>;
  readHandoffEvent(eventId: string): Promise<PhotoMediaHandoffEventPayload | null>;
  commitHandoff(command: PhotoMediaHandoffCommitCommand): Promise<void>;
}

export class PhotoPrivateProcessingError extends Error {
  constructor(
    readonly code:
      | 'invalid_request'
      | 'idempotency_conflict'
      | 'submission_unavailable'
      | 'validation_conflict'
      | 'processing_failed'
      | 'derivative_invalid'
      | 'storage_conflict'
      | 'persistence_conflict',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PhotoPrivateProcessingError';
  }
}

export interface PhotoPrivateProcessingServiceDependencies {
  persistence: PhotoMediaHandoffPersistence;
  processor: PhotoPrivateProcessor;
  derivatives: PrivatePhotoDerivativeStore;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return bytesToHex(new Uint8Array(digest));
}

async function sha256Text(value: string): Promise<string> {
  return sha256(new TextEncoder().encode(value));
}

function uuidFromDigest(digest: Uint8Array): string {
  const bytes = Uint8Array.from(digest.slice(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return z
    .uuid()
    .parse(
      `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`,
    );
}

async function deterministicUuid(namespace: string, value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`cryptopaymap:${namespace}:${value}`),
    ),
  );
  return uuidFromDigest(digest);
}

function validateDate(value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new PhotoPrivateProcessingError(
      'invalid_request',
      'Photo processing timestamp is invalid.',
    );
  }
}

function receiptFromEvent(
  payload: PhotoMediaHandoffEventPayload,
  state: 'committed' | 'replayed',
): PhotoPrivateProcessingReceipt {
  return photoPrivateProcessingReceiptSchema.parse({
    schemaVersion: 'photo-private-processing-receipt-v1',
    state,
    processingRequestId: payload.processingRequestId,
    submissionId: payload.submissionId,
    processedAt: payload.processedAt,
    media: payload.media.map((item) => ({
      quarantineUploadId: item.quarantineUploadId,
      mediaAssetId: item.mediaAssetId,
      originalContentHash: item.originalContentHash,
      displayFileId: item.displayFileId,
      displayContentHash: item.displayContentHash,
      thumbnailFileId: item.thumbnailFileId,
      thumbnailContentHash: item.thumbnailContentHash,
    })),
  });
}

function assertReplay(
  existing: PhotoMediaHandoffEventPayload,
  request: PhotoPrivateProcessingRequest,
  fingerprint: string,
): PhotoPrivateProcessingReceipt {
  if (
    existing.processingRequestId !== request.processingRequestId ||
    existing.submissionId !== request.submissionId ||
    existing.processorVersion !== request.processorVersion ||
    existing.requestFingerprint !== fingerprint
  ) {
    throw new PhotoPrivateProcessingError(
      'idempotency_conflict',
      'The photo processing request identity was reused with different content.',
    );
  }
  return receiptFromEvent(existing, 'replayed');
}

async function requestFingerprint(request: PhotoPrivateProcessingRequest): Promise<string> {
  return sha256Text(
    JSON.stringify({
      schemaVersion: request.schemaVersion,
      processingRequestId: request.processingRequestId,
      submissionId: request.submissionId,
      processorVersion: request.processorVersion,
      receipt: request.validation.receipt,
      objects: request.validation.objects.map((object) => ({
        quarantineUploadId: object.quarantineUploadId,
        privateObjectKey: object.privateObjectKey,
        mimeType: object.mimeType,
        byteSize: object.byteSize,
        width: object.width,
        height: object.height,
        contentHash: object.contentHash,
      })),
    }),
  );
}

function parseNormalizedPayload(value: unknown): PhotosReviewProjection {
  const parsed = photosReviewProjectionSchema.safeParse(value);
  if (!parsed.success) {
    throw new PhotoPrivateProcessingError(
      'submission_unavailable',
      'The Photos Submission is unavailable for private processing.',
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

async function assertValidationMatches(
  request: PhotoPrivateProcessingRequest,
  context: PhotoProcessingSubmissionContext,
): Promise<{ normalized: PhotosReviewProjection; objects: Map<string, ValidatedPhotoObject> }> {
  const normalized = parseNormalizedPayload(context.normalizedPayload);
  const receipt = request.validation.receipt;
  const objects = request.validation.objects;

  if (
    context.id !== request.submissionId ||
    context.submissionType !== 'photos' ||
    context.intakeRequestId !== receipt.intakeRequestId ||
    context.targetType !== receipt.targetType ||
    context.targetId !== receipt.targetId ||
    !processingWorkflowStatusSchema.safeParse(context.workflowStatus).success
  ) {
    throw new PhotoPrivateProcessingError(
      'submission_unavailable',
      'The Photos Submission is unavailable for private processing.',
    );
  }

  if (
    normalized.targetType !== context.targetType ||
    normalized.targetId !== context.targetId ||
    normalized.media.length !== receipt.media.length ||
    normalized.media.length !== objects.length ||
    normalized.media.length !== context.reservations.length
  ) {
    throw new PhotoPrivateProcessingError(
      'validation_conflict',
      'The validated photo set does not match its private Submission context.',
    );
  }

  const validationTime = Date.parse(receipt.validatedAt);
  if (!Number.isFinite(validationTime)) {
    throw new PhotoPrivateProcessingError(
      'validation_conflict',
      'The photo validation receipt is invalid.',
    );
  }

  const receiptById = new Map(receipt.media.map((item) => [item.quarantineUploadId, item]));
  const objectById = new Map(objects.map((item) => [item.quarantineUploadId, item]));
  const reservationById = new Map(context.reservations.map((item) => [item.id, item]));
  if (
    receiptById.size !== receipt.media.length ||
    objectById.size !== objects.length ||
    reservationById.size !== context.reservations.length
  ) {
    throw new PhotoPrivateProcessingError(
      'validation_conflict',
      'The validated photo set contains duplicate private references.',
    );
  }

  for (const item of normalized.media) {
    const validated = receiptById.get(item.quarantineUploadId);
    const object = objectById.get(item.quarantineUploadId);
    const reservation = reservationById.get(item.quarantineUploadId);
    if (validated === undefined || object === undefined || reservation === undefined) {
      throw new PhotoPrivateProcessingError(
        'validation_conflict',
        'The validated photo set is incomplete.',
      );
    }
    if (
      item.purpose !== 'public_gallery_candidate' ||
      validated.mimeType !== item.declaredMimeType ||
      validated.byteSize !== item.declaredByteSize ||
      object.mimeType !== validated.mimeType ||
      object.byteSize !== validated.byteSize ||
      object.width !== validated.width ||
      object.height !== validated.height ||
      object.contentHash !== validated.contentHash ||
      object.privateObjectKey !== photoQuarantineObjectKey(item.quarantineUploadId) ||
      object.body.byteLength !== object.byteSize ||
      reservation.intakeRequestId !== context.intakeRequestId ||
      reservation.purpose !== 'public_gallery_candidate' ||
      reservation.consumedBySubmissionId !== context.id ||
      reservation.consumedAt === null ||
      validationTime > Date.parse(reservation.expiresAt) ||
      validationTime > Date.parse(reservation.consumedAt)
    ) {
      throw new PhotoPrivateProcessingError(
        'validation_conflict',
        'The validated photo does not match its consumed private reservation.',
      );
    }
    if ((await sha256(object.body)) !== object.contentHash) {
      throw new PhotoPrivateProcessingError(
        'validation_conflict',
        'The validated photo bytes changed before processing.',
      );
    }
  }

  return { normalized, objects: objectById };
}

function mapInspectionError(error: unknown): PhotoPrivateProcessingError {
  if (error instanceof PhotoImageInspectionError) {
    return new PhotoPrivateProcessingError(
      'derivative_invalid',
      'The private photo processor returned an invalid derivative.',
      { cause: error },
    );
  }
  return new PhotoPrivateProcessingError(
    'derivative_invalid',
    'The private photo derivative could not be inspected.',
    { cause: error },
  );
}

async function validateDerivative(
  derivative: PhotoProcessedDerivative,
  source: ValidatedPhotoObject,
): Promise<PhotoProcessedDerivative & { contentHash: string }> {
  const result = photoProcessedDerivativeSchema.safeParse(derivative);
  if (!result.success) {
    throw new PhotoPrivateProcessingError(
      'derivative_invalid',
      'The private photo processor returned an invalid derivative contract.',
      { cause: result.error },
    );
  }
  const parsed = result.data;
  const maximumBytes = parsed.variant === 'display' ? MAX_DISPLAY_BYTES : MAX_THUMBNAIL_BYTES;
  const maximumDimension =
    parsed.variant === 'display' ? MAX_DISPLAY_DIMENSION : MAX_THUMBNAIL_DIMENSION;
  if (
    parsed.body.byteLength === 0 ||
    parsed.body.byteLength > maximumBytes ||
    parsed.width > maximumDimension ||
    parsed.height > maximumDimension ||
    parsed.width * parsed.height > source.width * source.height
  ) {
    throw new PhotoPrivateProcessingError(
      'derivative_invalid',
      'The private photo derivative exceeds its processing boundary.',
    );
  }

  let inspected: DecodedPhotoImage;
  try {
    inspected = inspectPhotoImage(parsed.body);
  } catch (error) {
    throw mapInspectionError(error);
  }
  if (
    inspected.animated ||
    inspected.mimeType !== parsed.mimeType ||
    inspected.width !== parsed.width ||
    inspected.height !== parsed.height
  ) {
    throw new PhotoPrivateProcessingError(
      'derivative_invalid',
      'The private photo derivative does not match its declared result.',
    );
  }
  return { ...parsed, contentHash: await sha256(parsed.body) };
}

async function cleanupCreated(store: PrivatePhotoDerivativeStore, keys: string[]): Promise<void> {
  await Promise.allSettled(keys.map((key) => store.deletePrivateDerivative(key)));
}

export function createPhotoPrivateProcessingService(
  dependencies: PhotoPrivateProcessingServiceDependencies,
) {
  return {
    async process(
      rawInput: unknown,
      processedAt = new Date(),
    ): Promise<PhotoPrivateProcessingReceipt> {
      validateDate(processedAt);
      let request: PhotoPrivateProcessingRequest;
      try {
        request = photoPrivateProcessingRequestSchema.parse(rawInput);
      } catch (error) {
        throw new PhotoPrivateProcessingError(
          'invalid_request',
          'Private photo processing request failed validation.',
          { cause: error },
        );
      }

      const eventId = await deterministicUuid(
        'photo-media-handoff-event-v1',
        request.processingRequestId,
      );
      const fingerprint = await requestFingerprint(request);
      let existing: PhotoMediaHandoffEventPayload | null;
      try {
        existing = await dependencies.persistence.readHandoffEvent(eventId);
      } catch (error) {
        throw new PhotoPrivateProcessingError(
          'persistence_conflict',
          'The private photo processing replay state could not be loaded.',
          { cause: error },
        );
      }
      if (existing !== null) return assertReplay(existing, request, fingerprint);

      let context: PhotoProcessingSubmissionContext | null;
      try {
        context = await dependencies.persistence.loadSubmissionContext(request.submissionId);
      } catch (error) {
        throw new PhotoPrivateProcessingError(
          'persistence_conflict',
          'The private photo processing context could not be loaded.',
          { cause: error },
        );
      }
      if (context === null) {
        throw new PhotoPrivateProcessingError(
          'submission_unavailable',
          'The Photos Submission is unavailable for private processing.',
        );
      }

      const validated = await assertValidationMatches(request, context);
      const normalized = validated.normalized;
      const objectById = validated.objects;
      const createdKeys: string[] = [];
      const assets: PhotoMediaAssetInsert[] = [];
      const files: PhotoMediaFileInsert[] = [];
      const eventMedia: PhotoMediaHandoffEventPayload['media'] = [];

      try {
        for (const [index, item] of normalized.media.entries()) {
          const source = objectById.get(item.quarantineUploadId);
          if (source === undefined) {
            throw new PhotoPrivateProcessingError(
              'validation_conflict',
              'The validated photo set is incomplete.',
            );
          }
          let processorOutput: PhotoProcessedDerivative[];
          try {
            processorOutput = await dependencies.processor.process({
              source,
              role: item.role,
              processorVersion: request.processorVersion,
            });
          } catch (error) {
            throw new PhotoPrivateProcessingError(
              'processing_failed',
              'The private photo processor failed.',
              { cause: error },
            );
          }
          const outputResult = z
            .array(photoProcessedDerivativeSchema)
            .length(2)
            .safeParse(processorOutput);
          if (!outputResult.success) {
            throw new PhotoPrivateProcessingError(
              'derivative_invalid',
              'The private photo processor must return exactly two valid derivatives.',
              { cause: outputResult.error },
            );
          }
          const variants = new Map(
            outputResult.data.map((candidate) => [candidate.variant, candidate]),
          );
          if (variants.size !== 2 || !variants.has('display') || !variants.has('thumbnail')) {
            throw new PhotoPrivateProcessingError(
              'derivative_invalid',
              'The private photo processor must return one display and one thumbnail derivative.',
            );
          }
          const display = await validateDerivative(
            variants.get('display') as PhotoProcessedDerivative,
            source,
          );
          const thumbnail = await validateDerivative(
            variants.get('thumbnail') as PhotoProcessedDerivative,
            source,
          );
          if (display.width * display.height < thumbnail.width * thumbnail.height) {
            throw new PhotoPrivateProcessingError(
              'derivative_invalid',
              'The display derivative cannot be smaller than the thumbnail derivative.',
            );
          }

          const mediaAssetId = await deterministicUuid(
            'photo-media-asset-v1',
            `${context.id}:${item.quarantineUploadId}`,
          );
          const originalFileId = await deterministicUuid(
            'photo-media-file-original-v1',
            mediaAssetId,
          );
          const displayFileId = await deterministicUuid(
            'photo-media-file-display-v1',
            mediaAssetId,
          );
          const thumbnailFileId = await deterministicUuid(
            'photo-media-file-thumbnail-v1',
            mediaAssetId,
          );
          const displayKey = privateMediaDerivativeKey(mediaAssetId, {
            id: displayFileId,
            contentHash: display.contentHash,
            mimeType: display.mimeType,
          });
          const thumbnailKey = privateMediaDerivativeKey(mediaAssetId, {
            id: thumbnailFileId,
            contentHash: thumbnail.contentHash,
            mimeType: thumbnail.mimeType,
          });

          for (const command of [
            {
              key: displayKey,
              body: display.body,
              mimeType: display.mimeType,
              contentHash: display.contentHash,
              mediaAssetId,
              variant: 'display' as const,
              sourceContentHash: source.contentHash,
            },
            {
              key: thumbnailKey,
              body: thumbnail.body,
              mimeType: thumbnail.mimeType,
              contentHash: thumbnail.contentHash,
              mediaAssetId,
              variant: 'thumbnail' as const,
              sourceContentHash: source.contentHash,
            },
          ]) {
            const written = await dependencies.derivatives.writePrivateDerivative(command);
            if (written.state === 'created') createdKeys.push(command.key);
          }

          const capturedAt =
            item.capturedAt === null ? null : new Date(`${item.capturedAt}T00:00:00.000Z`);
          assets.push({
            id: mediaAssetId,
            purpose: 'public_gallery_candidate',
            role: item.role,
            reviewStatus: 'pending',
            rightsStatus: 'unknown',
            visibility: 'private',
            entityId: context.targetType === 'entity' ? context.targetId : null,
            locationId: context.targetType === 'location' ? context.targetId : null,
            displayOrder: index,
            capturedAt,
            createdAt: processedAt,
            updatedAt: processedAt,
          });
          files.push(
            {
              id: originalFileId,
              mediaAssetId,
              variant: 'original',
              storageScope: 'quarantine',
              storageKey: source.privateObjectKey,
              originalFilename: null,
              mimeType: source.mimeType,
              byteSize: source.byteSize,
              width: source.width,
              height: source.height,
              contentHash: source.contentHash,
              createdAt: processedAt,
            },
            {
              id: displayFileId,
              mediaAssetId,
              variant: 'display',
              storageScope: 'private',
              storageKey: displayKey,
              originalFilename: null,
              mimeType: display.mimeType,
              byteSize: display.body.byteLength,
              width: display.width,
              height: display.height,
              contentHash: display.contentHash,
              createdAt: processedAt,
            },
            {
              id: thumbnailFileId,
              mediaAssetId,
              variant: 'thumbnail',
              storageScope: 'private',
              storageKey: thumbnailKey,
              originalFilename: null,
              mimeType: thumbnail.mimeType,
              byteSize: thumbnail.body.byteLength,
              width: thumbnail.width,
              height: thumbnail.height,
              contentHash: thumbnail.contentHash,
              createdAt: processedAt,
            },
          );
          eventMedia.push({
            quarantineUploadId: item.quarantineUploadId,
            mediaAssetId,
            originalFileId,
            displayFileId,
            thumbnailFileId,
            originalContentHash: source.contentHash,
            displayContentHash: display.contentHash,
            thumbnailContentHash: thumbnail.contentHash,
            reviewContext: {
              role: item.role,
              capturedAt: item.capturedAt,
              description: item.description,
              suggestedAltText: item.suggestedAltText,
              photographerPresent: item.photographerPresent,
              rightsStatus: item.rightsStatus,
              rightsHolderPresent: item.rightsHolderPresent,
              permissionReferencePresent: item.permissionReferencePresent,
              licenseName: item.licenseName,
              licenseUrl: item.licenseUrl,
              publicDisplayPermission: item.publicDisplayPermission,
            },
          });
        }
      } catch (error) {
        await cleanupCreated(dependencies.derivatives, createdKeys);
        if (error instanceof PhotoPrivateProcessingError) throw error;
        throw new PhotoPrivateProcessingError(
          'storage_conflict',
          'Private photo derivatives could not be staged.',
          { cause: error },
        );
      }

      const eventPayload = photoMediaHandoffEventPayloadSchema.parse({
        schemaVersion: 'photo-media-handoff-event-v1',
        processingRequestId: request.processingRequestId,
        requestFingerprint: fingerprint,
        submissionId: context.id,
        processorVersion: request.processorVersion,
        processedAt: processedAt.toISOString(),
        targetType: context.targetType,
        targetId: context.targetId,
        media: eventMedia,
      });

      try {
        await dependencies.persistence.commitHandoff({
          eventId,
          eventPayload,
          submissionId: context.id,
          expectedSubmissionUpdatedAt: new Date(context.updatedAt),
          expectedWorkflowStatus: context.workflowStatus,
          assets,
          files,
        });
      } catch (error) {
        const raced = await dependencies.persistence.readHandoffEvent(eventId);
        if (raced !== null) return assertReplay(raced, request, fingerprint);
        await cleanupCreated(dependencies.derivatives, createdKeys);
        throw new PhotoPrivateProcessingError(
          'persistence_conflict',
          'Private photo Media handoff could not be committed.',
          { cause: error },
        );
      }

      return receiptFromEvent(eventPayload, 'committed');
    },
  };
}
