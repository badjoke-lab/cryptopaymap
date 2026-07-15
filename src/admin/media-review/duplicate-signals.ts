import { z } from 'zod';
import {
  mediaReviewStatusValues,
  mediaVisibilityValues,
} from '../../db/schema';
import {
  mediaReviewSubjectSchema,
  type MediaReviewSubject,
} from './decision';

export const MAX_MEDIA_DUPLICATE_MATCHES = 25;

export const mediaDuplicateMatchSchema = z
  .object({
    mediaAssetId: z.uuid(),
    subject: mediaReviewSubjectSchema,
    reviewStatus: z.enum(mediaReviewStatusValues),
    visibility: z.enum(mediaVisibilityValues),
    sameTarget: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const mediaDuplicateSignalsSchema = z
  .object({
    sourceOriginalContentHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    matches: z.array(mediaDuplicateMatchSchema).max(MAX_MEDIA_DUPLICATE_MATCHES),
    hasMore: z.boolean(),
    automaticDecision: z.literal(false),
    manualReviewRequired: z.boolean(),
  })
  .strict();

export type MediaDuplicateMatch = z.infer<typeof mediaDuplicateMatchSchema>;
export type MediaDuplicateSignals = z.infer<typeof mediaDuplicateSignalsSchema>;

export interface MediaDuplicateCandidate {
  mediaAssetId: string;
  subject: MediaReviewSubject;
  reviewStatus: (typeof mediaReviewStatusValues)[number];
  visibility: (typeof mediaVisibilityValues)[number];
  createdAt: string;
}

function sameSubject(left: MediaReviewSubject, right: MediaReviewSubject): boolean {
  return left.type === right.type && left.id === right.id;
}

export function projectMediaDuplicateSignals(
  currentSubject: MediaReviewSubject,
  sourceOriginalContentHash: string | null,
  candidates: readonly MediaDuplicateCandidate[],
  limit = MAX_MEDIA_DUPLICATE_MATCHES,
): MediaDuplicateSignals {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_MEDIA_DUPLICATE_MATCHES) {
    throw new Error('Media duplicate signal limit is invalid.');
  }

  if (sourceOriginalContentHash === null) {
    return mediaDuplicateSignalsSchema.parse({
      sourceOriginalContentHash: null,
      matches: [],
      hasMore: false,
      automaticDecision: false,
      manualReviewRequired: false,
    });
  }

  const unique = new Map<string, MediaDuplicateCandidate>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.mediaAssetId)) unique.set(candidate.mediaAssetId, candidate);
  }
  const sorted = [...unique.values()].sort((left, right) => {
    const byTime = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    return byTime !== 0 ? byTime : left.mediaAssetId.localeCompare(right.mediaAssetId);
  });
  const selected = sorted.slice(0, limit).map((candidate) => ({
    mediaAssetId: candidate.mediaAssetId,
    subject: candidate.subject,
    reviewStatus: candidate.reviewStatus,
    visibility: candidate.visibility,
    sameTarget: sameSubject(currentSubject, candidate.subject),
    createdAt: candidate.createdAt,
  }));

  return mediaDuplicateSignalsSchema.parse({
    sourceOriginalContentHash,
    matches: selected,
    hasMore: sorted.length > limit,
    automaticDecision: false,
    manualReviewRequired: selected.length > 0,
  });
}
