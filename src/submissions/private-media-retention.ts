import { z } from 'zod';
import {
  photoPrivateCleanupObjectSchema,
  type PhotoPrivateCleanupObject,
  type PhotoPrivateObjectLifecycleStore,
} from './photo-private-lifecycle';

const MILLISECONDS_PER_DAY = 86_400_000;
export const PRIVATE_EVIDENCE_MEDIA_RETENTION_DAYS = 180;
export const OWNER_VERIFICATION_MEDIA_RETENTION_DAYS = 90;
export const MAX_PRIVATE_MEDIA_RETENTION_CANDIDATES = 50;

export const privateMediaRetentionReasonValues = [
  'private_evidence_media_180d',
  'owner_verification_media_90d',
] as const;
export const privateMediaRetentionReasonSchema = z.enum(privateMediaRetentionReasonValues);

export const privateMediaRetentionCandidateSchema = z
  .object({
    referenceType: z.literal('media_asset'),
    referenceId: z.uuid(),
    reason: privateMediaRetentionReasonSchema,
    eligibleAt: z.iso.datetime({ offset: true }),
    submissionId: z.uuid().nullable(),
    mediaAssetId: z.uuid(),
    objects: z.array(photoPrivateCleanupObjectSchema).min(1).max(24),
  })
  .strict()
  .superRefine((candidate, context) => {
    if (
      candidate.referenceId !== candidate.mediaAssetId ||
      candidate.objects.some((object) => object.mediaAssetId !== candidate.mediaAssetId)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['mediaAssetId'],
        message: 'Private Media retention must bind every object to one exact Media Asset.',
      });
    }
    const keys = candidate.objects.map((object) => `${object.storageScope}:${object.storageKey}`);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: 'custom',
        path: ['objects'],
        message: 'Private Media retention cannot contain duplicate object keys.',
      });
    }
  });

export const privateMediaRetentionRequestSchema = z
  .object({
    schemaVersion: z.literal('private-media-retention-v1'),
    runId: z.uuid(),
    asOf: z.iso.datetime({ offset: true }),
    limit: z.number().int().min(1).max(MAX_PRIVATE_MEDIA_RETENTION_CANDIDATES).default(50),
  })
  .strict();

export const privateMediaRetentionReceiptSchema = z
  .object({
    schemaVersion: z.literal('private-media-retention-receipt-v1'),
    runId: z.uuid(),
    asOf: z.iso.datetime({ offset: true }),
    state: z.enum(['completed', 'partial']),
    candidateCount: z.number().int().min(0).max(MAX_PRIVATE_MEDIA_RETENTION_CANDIDATES),
    deletedObjectCount: z.number().int().min(0),
    missingObjectCount: z.number().int().min(0),
    failedObjectCount: z.number().int().min(0),
    hasMore: z.boolean(),
    candidates: z
      .array(
        z
          .object({
            referenceType: z.literal('media_asset'),
            referenceId: z.uuid(),
            submissionId: z.uuid().nullable(),
            reason: privateMediaRetentionReasonSchema,
            outcome: z.enum(['deleted', 'replayed', 'partial']),
            deletedObjectCount: x.number().int().min(0),
            missingObjectCount: x.number().int().min(0),
            failedObjectCount: z.number().int().min(0),
          })
          .strict(),
      )
      .max(MAX_PRIVATE_MEDIA_RETENTION_CANDIDATES),
  })
  .strict();

export type PrivateMediaRetentionCandidate = z.infer<
  typeof privateMediaRetentionCandidateSchema
>;
export type PrivateMediaRetentionReceipt = z.infer<typeof privateMediaRetentionReceiptSchema>;

export interface PrivateMediaRetentionCandidateReader {
  loadCandidates(
    cutoffs: { evidenceBefore: Date; ownerVerificationBefore: Date },
    limit: number,
  ): Promise<{ candidates: PrivateMediaRetentionCandidate[]; hasMore: boolean }>;
}

export class PrivateMediaRetentionError extends Error {
  constructor(
    readonly code: 'invalid_request' | 'backend_failure' | 'candidate_invalid',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PrivateMediaRetentionError';
  }
}

function eligibleThreshold(
  reason: PrivateMediaRetentionCandidate['reason'],
  asOf: Date,
): number {
  const days =
    reason === 'private_evidence_media_180d'
      ? PRIVATE_EVIDENCE_MEDIA_RETENTION_DAYS
      : OWNER_VERIFICATION_MEDIA_RETENTION_DAYS;
  return asOf.getTime() - days * MILLISECONDS_PER_DAY;
}

export function createPrivateMediaRetentionService(dependencies: {
  candidates: PrivateMediaRetentionCandidateReader;
  objects: PhotoPrivateObjectLifecycleStore;
}) {
  return {
    async run(rawInput: unknown): Promise<PrivateMediaRetentionReceipt> {
      const result = privateMediaRetentionRequestSchema.safeParse(rawInput);
      if (!result.success) {
        throw new PrivateMediaRetentionError(
          'invalid_request',
          'Private Media retention request failed validation.',
          { cause: result.error },
        );
      }
      const request = result.data;
      const asOf = new Date(request.asOf);
      let loaded: { candidates: PrivateMediaRetentionCandidate[]; hasMore: boolean };
      try {
        loaded = await dependencies.candidates.loadCandidates(
          {
            evidenceBefore: new Date(
              asOf.getTime() - PRIVATE_EVIDENCE_MEDIA_RETENTION_DAYS * MILLISECONDS_PER_DAY,
            ),
            ownerVerificationBefore: new Date(
              asOf.getTime() - OWNER_VERIFICATION_MEDIA_RETENTION_DAYS * MILLISECONDS_PER_DAY,
            ),
          },
          request.limit,
        );
      } catch (error) {
        throw new PrivateMediaRetentionError(
          'backend_failure',
          'Private Media retention candidates could not be loaded.',
          { cause: error },
        );
      }
      if (loaded.candidates.length > request.limit) {
        throw new PrivateMediaRetentionError(
          'candidate_invalid',
          'Private Media retention returned more candidates than requested.',
        );
      }

      const candidates = loaded.candidates.map((candidate) => {
        const parsed = privateMediaRetentionCandidateSchema.safeParse(candidate);
        if (
          !parsed.success ||
          Date.parse(parsed.data.eligibleAt) > eligibleThreshold(parsed.data.reason, asOf)
        ) {
          throw new PrivateMediaRetentionError(
            'candidate_invalid',
            'A Private Media retention candidate is invalid or premature.',
            { cause: parsed.success ? undefined : parsed.error },
          );
        }
        return parsed.data;
      });
      if (new Set(candidates.map((candidate) => candidate.referenceId)).size !== candidates.length) {
        throw new PrivateMediaRetentionError(
          'candidate_invalid',
          'Private Media retention candidates repeat a Media Asset.',
        );
      }

      const objectResults = new Map<string, 'deleted' | 'missing' | 'failed'>();
      const candidateReceipts: PrivateMediaRetentionReceipt['candidates'] = [];
      for (const candidate of candidates) {
        let deletedObjectCount = 0;
        let missingObjectCount = 0;
        let failedObjectCount = 0;
        for (const object of candidate.objects as PhotoPrivateCleanupObject[]) {
          const key = `${object.storageScope}:${object.storageKey}`;
          let objectResult = objectResults.get(key);
          if (objectResult === undefined) {
            try {
              objectResult = await dependencies.objects.deletePrivateObject(
                object.storageScope,
                object.storageKey,
              );
            } catch {
              objectResult = 'failed';
            }
            objectResults.set(key, objectResult);
          }
          if (objectResult === 'deleted') deletedObjectCount += 1;
          else if (objectResult === 'missing') missingObjectCount += 1;
          else failedObjectCount += 1;
        }
        candidateReceipts.push({
          referenceType: 'media_asset',
          referenceId: candidate.referenceId,
          submissionId: candidate.submissionId,
          reason: candidate.reason,
          outcome:
            failedObjectCount > 0 ? 'partial' : deletedObjectCount > 0 ? 'deleted' : 'replayed',
          deletedObjectCount,
          missingObjectCount,
          failedObjectCount,
        });
      }

      const deletedObjectCount = candidateReceipts.reduce(
        (total, candidate) => total + candidate.deletedObjectCount,
        0,
      );
      const missingObjectCount = candidateReceipts.reduce(
        (total, candidate) => total + candidate.missingObjectCount,
        0,
      );
      const failedObjectCount = candidateReceipts.reduce(
        (total, candidate) => total + candidate.failedObjectCount,
        0,
      );
      return privateMediaRetentionReceiptSchema.parse({
        schemaVersion: 'private-media-retention-receipt-v1',
        runId: request.runId,
        asOf: request.asOf,
        state: failedObjectCount > 0 ? 'partial' : 'completed',
        candidateCount: candidates.length,
        deletedObjectCount,
        missingObjectCount,
        failedObjectCount,
        hasMore: loaded.hasMore,
        candidates: candidateReceipts,
      });
    },
  };
}
