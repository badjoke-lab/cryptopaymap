import { z } from 'zod';
import { privateMediaDerivativeKey } from '../admin/media-review/storage-plan';
import { photoQuarantineObjectKey } from './photo-upload-authorization';

const MILLISECONDS_PER_DAY = 86_400_000;
export const PHOTO_TERMINAL_RETENTION_DAYS = 30;
export const MAX_PHOTO_CLEANUP_CANDIDATES = 100;

export const photoPrivateCleanupReasonValues = [
  'expired_authorization',
  'closed_submission_without_handoff',
  'rejected_media',
  'superseded_media',
] as const;
export const photoPrivateCleanupReasonSchema = z.enum(photoPrivateCleanupReasonValues);

export const photoPrivateCleanupObjectSchema = z
  .object({
    objectRefId: z.uuid(),
    reservationId: z.uuid().nullable(),
    mediaAssetId: z.uuid().nullable(),
    mediaFileId: z.uuid().nullable(),
    variant: z.enum(['original', 'display', 'thumbnail']),
    storageScope: z.enum(['quarantine', 'private']),
    storageKey: z.string().trim().min(1).max(1_024),
    mimeType: z.string().trim().min(1).max(127),
    contentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
  })
  .strict()
  .superRefine((object, context) => {
    if (object.storageScope === 'quarantine') {
      if (
        object.variant !== 'original' ||
        object.reservationId === null ||
        object.storageKey !== photoQuarantineObjectKey(object.reservationId)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['storageKey'],
          message: 'Quarantine cleanup requires the canonical opaque reservation object key.',
        });
      }
      return;
    }

    if (
      object.variant === 'original' ||
      object.mediaAssetId === null ||
      object.mediaFileId === null ||
      object.contentHash === null ||
      (object.mimeType !== 'image/jpeg' && object.mimeType !== 'image/webp')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['variant'],
        message: 'Private derivative cleanup requires a canonical display or thumbnail file.',
      });
      return;
    }

    const expectedKey = privateMediaDerivativeKey(object.mediaAssetId, {
      id: object.mediaFileId,
      contentHash: object.contentHash,
      mimeType: object.mimeType,
    });
    if (object.storageKey !== expectedKey) {
      context.addIssue({
        code: 'custom',
        path: ['storageKey'],
        message: 'Private derivative cleanup requires the canonical Media storage key.',
      });
    }
  });

export const photoPrivateCleanupCandidateSchema = z
  .object({
    referenceType: z.enum(['reservation', 'submission', 'media_asset']),
    referenceId: z.uuid(),
    reason: photoPrivateCleanupReasonSchema,
    eligibleAt: z.iso.datetime({ offset: true }),
    submissionId: z.uuid().nullable(),
    mediaAssetId: z.uuid().nullable(),
    objects: z.array(photoPrivateCleanupObjectSchema).min(1).max(24),
  })
  .strict()
  .superRefine((candidate, context) => {
    if (
      candidate.reason === 'expired_authorization' &&
      (candidate.referenceType !== 'reservation' ||
        candidate.submissionId !== null ||
        candidate.mediaAssetId !== null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['referenceType'],
        message: 'Expired authorization cleanup must reference only one reservation.',
      });
    }
    if (
      candidate.reason === 'closed_submission_without_handoff' &&
      (candidate.referenceType !== 'submission' ||
        candidate.submissionId !== candidate.referenceId ||
        candidate.mediaAssetId !== null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['referenceType'],
        message: 'Closed Submission cleanup must reference its exact Photos Submission.',
      });
    }
    if (
      (candidate.reason === 'rejected_media' || candidate.reason === 'superseded_media') &&
      (candidate.referenceType !== 'media_asset' ||
        candidate.mediaAssetId !== candidate.referenceId ||
        candidate.submissionId === null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['referenceType'],
        message:
          'Terminal Media cleanup must reference its exact photo Media Asset and Submission.',
      });
    }

    const keys = candidate.objects.map((object) => `${object.storageScope}:${object.storageKey}`);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: 'custom',
        path: ['objects'],
        message: 'A cleanup candidate cannot contain duplicate private object keys.',
      });
    }
  });

export const photoPrivateCleanupRequestSchema = z
  .object({
    schemaVersion: z.literal('photo-private-cleanup-v1'),
    runId: z.uuid(),
    asOf: z.iso.datetime({ offset: true }),
    limit: z.number().int().min(1).max(MAX_PHOTO_CLEANUP_CANDIDATES).default(50),
  })
  .strict();

export const photoPrivateCleanupReceiptSchema = z
  .object({
    schemaVersion: z.literal('photo-private-cleanup-receipt-v1'),
    runId: z.uuid(),
    asOf: z.iso.datetime({ offset: true }),
    state: z.enum(['completed', 'partial']),
    candidateCount: z.number().int().min(0).max(MAX_PHOTO_CLEANUP_CANDIDATES),
    deletedObjectCount: z.number().int().min(0),
    missingObjectCount: z.number().int().min(0),
    failedObjectCount: z.number().int().min(0),
    candidates: z
      .array(
        z
          .object({
            referenceType: z.enum(['reservation', 'submission', 'media_asset']),
            referenceId: z.uuid(),
            reason: photoPrivateCleanupReasonSchema,
            outcome: z.enum(['deleted', 'replayed', 'partial']),
            deletedObjectCount: z.number().int().min(0),
            missingObjectCount: z.number().int().min(0),
            failedObjectCount: z.number().int().min(0),
          })
          .strict(),
      )
      .max(MAX_PHOTO_CLEANUP_CANDIDATES),
  })
  .strict();

export type PhotoPrivateCleanupReason = z.infer<typeof photoPrivateCleanupReasonSchema>;
export type PhotoPrivateCleanupObject = z.infer<typeof photoPrivateCleanupObjectSchema>;
export type PhotoPrivateCleanupCandidate = z.infer<typeof photoPrivateCleanupCandidateSchema>;
export type PhotoPrivateCleanupRequest = z.infer<typeof photoPrivateCleanupRequestSchema>;
export type PhotoPrivateCleanupReceipt = z.infer<typeof photoPrivateCleanupReceiptSchema>;

export interface PhotoPrivateCleanupCutoffs {
  expiredAuthorizationBefore: Date;
  terminalStateBefore: Date;
}

export interface PhotoPrivateCleanupCandidateReader {
  loadCleanupCandidates(
    cutoffs: PhotoPrivateCleanupCutoffs,
    limit: number,
  ): Promise<PhotoPrivateCleanupCandidate[]>;
}

export interface PhotoPrivateObjectLifecycleStore {
  deletePrivateObject(
    storageScope: 'quarantine' | 'private',
    storageKey: string,
  ): Promise<'deleted' | 'missing'>;
}

export class PhotoPrivateCleanupError extends Error {
  constructor(
    readonly code: 'invalid_request' | 'backend_failure' | 'candidate_invalid',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PhotoPrivateCleanupError';
  }
}

function cutoffs(asOf: Date): PhotoPrivateCleanupCutoffs {
  return {
    expiredAuthorizationBefore: asOf,
    terminalStateBefore: new Date(
      asOf.getTime() - PHOTO_TERMINAL_RETENTION_DAYS * MILLISECONDS_PER_DAY,
    ),
  };
}

function assertEligible(
  candidate: PhotoPrivateCleanupCandidate,
  limits: PhotoPrivateCleanupCutoffs,
): void {
  const eligibleAt = Date.parse(candidate.eligibleAt);
  const threshold =
    candidate.reason === 'expired_authorization'
      ? limits.expiredAuthorizationBefore.getTime()
      : limits.terminalStateBefore.getTime();
  if (!Number.isFinite(eligibleAt) || eligibleAt > threshold) {
    throw new PhotoPrivateCleanupError(
      'candidate_invalid',
      'A private photo cleanup candidate has not reached its retention boundary.',
    );
  }
}

export function createPhotoPrivateCleanupService(dependencies: {
  candidates: PhotoPrivateCleanupCandidateReader;
  objects: PhotoPrivateObjectLifecycleStore;
}) {
  return {
    async run(rawInput: unknown): Promise<PhotoPrivateCleanupReceipt> {
      let request: PhotoPrivateCleanupRequest;
      try {
        request = photoPrivateCleanupRequestSchema.parse(rawInput);
      } catch (error) {
        throw new PhotoPrivateCleanupError(
          'invalid_request',
          'Private photo cleanup request failed validation.',
          { cause: error },
        );
      }

      const asOf = new Date(request.asOf);
      const retentionCutoffs = cutoffs(asOf);
      let loaded: PhotoPrivateCleanupCandidate[];
      try {
        loaded = await dependencies.candidates.loadCleanupCandidates(
          retentionCutoffs,
          request.limit,
        );
      } catch (error) {
        throw new PhotoPrivateCleanupError(
          'backend_failure',
          'Private photo cleanup candidates could not be loaded.',
          { cause: error },
        );
      }
      if (loaded.length > request.limit) {
        throw new PhotoPrivateCleanupError(
          'candidate_invalid',
          'Private photo cleanup returned more candidates than requested.',
        );
      }

      const candidates = loaded.map((candidate) => {
        const parsed = photoPrivateCleanupCandidateSchema.safeParse(candidate);
        if (!parsed.success) {
          throw new PhotoPrivateCleanupError(
            'candidate_invalid',
            'A private photo cleanup candidate is invalid.',
            { cause: parsed.error },
          );
        }
        assertEligible(parsed.data, retentionCutoffs);
        return parsed.data;
      });
      const referenceKeys = candidates.map(
        (candidate) => `${candidate.referenceType}:${candidate.referenceId}`,
      );
      if (new Set(referenceKeys).size !== referenceKeys.length) {
        throw new PhotoPrivateCleanupError(
          'candidate_invalid',
          'Private photo cleanup candidates contain duplicate references.',
        );
      }

      const objectResults = new Map<string, 'deleted' | 'missing' | 'failed'>();
      const candidateReceipts: PhotoPrivateCleanupReceipt['candidates'] = [];
      for (const candidate of candidates) {
        let deletedObjectCount = 0;
        let missingObjectCount = 0;
        let failedObjectCount = 0;
        for (const object of candidate.objects) {
          const key = `${object.storageScope}:${object.storageKey}`;
          let result = objectResults.get(key);
          if (result === undefined) {
            try {
              result = await dependencies.objects.deletePrivateObject(
                object.storageScope,
                object.storageKey,
              );
            } catch {
              result = 'failed';
            }
            objectResults.set(key, result);
          }
          if (result === 'deleted') deletedObjectCount += 1;
          else if (result === 'missing') missingObjectCount += 1;
          else failedObjectCount += 1;
        }
        candidateReceipts.push({
          referenceType: candidate.referenceType,
          referenceId: candidate.referenceId,
          reason: candidate.reason,
          outcome: failedObjectCount > 0 ? 'partial' : deletedObjectCount > 0 ? 'deleted' : 'replayed',
          deletedObjectCount,
          missingObjectCount,
          failedObjectCount,
        });
      }

      const deletedObjectCount = candidateReceipts.reduce(
        (sum, candidate) => sum + candidate.deletedObjectCount,
        0,
      );
      const missingObjectCount = candidateReceipts.reduce(
        (sum, candidate) => sum + candidate.missingObjectCount,
        0,
      );
      const failedObjectCount = candidateReceipts.reduce(
        (sum, candidate) => sum + candidate.failedObjectCount,
        0,
      );

      return photoPrivateCleanupReceiptSchema.parse({
        schemaVersion: 'photo-private-cleanup-receipt-v1',
        runId: request.runId,
        asOf: request.asOf,
        state: failedObjectCount > 0 ? 'partial' : 'completed',
        candidateCount: candidates.length,
        deletedObjectCount,
        missingObjectCount,
        failedObjectCount,
        candidates: candidateReceipts,
      });
    },
  };
}
