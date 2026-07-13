import { z } from 'zod';

export const reconfirmationQueueReasonValues = [
  'overdue',
  'negative_evidence',
  'missing_deadline',
  'stale_review',
  'due_soon',
] as const;
export const reconfirmationRecommendedActionValues = ['mark_stale', 'review'] as const;

export const reconfirmationClaimSnapshotSchema = z
  .object({
    id: z.uuid(),
    claimStatus: z.enum(['candidate', 'confirmed', 'stale', 'ended', 'rejected']),
    visibility: z.enum(['public', 'hidden', 'temporarily_hidden']),
    lastConfirmedAt: z.iso.datetime({ offset: true }).nullable(),
    nextReviewAt: z.iso.datetime({ offset: true }).nullable(),
    updatedAt: z.iso.datetime({ offset: true }),
    deletedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

export const reconfirmationQueueItemSchema = reconfirmationClaimSnapshotSchema
  .omit({ deletedAt: true })
  .extend({
    queueReason: z.enum(reconfirmationQueueReasonValues),
    recommendedAction: z.enum(reconfirmationRecommendedActionValues),
    dueAt: z.iso.datetime({ offset: true }).nullable(),
    daysUntilReview: z.number().int().nullable(),
    priority: z.number().int().min(0).max(999),
  })
  .strict();

export const reconfirmationQueueOptionsSchema = z
  .object({
    dueSoonDays: z.number().int().min(1).max(90).default(30),
  })
  .strict();

export type ReconfirmationClaimSnapshot = z.infer<typeof reconfirmationClaimSnapshotSchema>;
export type ReconfirmationQueueItem = z.infer<typeof reconfirmationQueueItemSchema>;
export type ReconfirmationQueueReason = ReconfirmationQueueItem['queueReason'];
export type ReconfirmationRecommendedAction = ReconfirmationQueueItem['recommendedAction'];
export type ReconfirmationQueueOptions = z.infer<typeof reconfirmationQueueOptionsSchema>;

const millisecondsPerDay = 86_400_000;

function dayDelta(dueAt: Date, asOf: Date): number {
  return Math.ceil((dueAt.getTime() - asOf.getTime()) / millisecondsPerDay);
}

function item(
  claim: ReconfirmationClaimSnapshot,
  queueReason: ReconfirmationQueueReason,
  recommendedAction: ReconfirmationRecommendedAction,
  dueAt: Date | null,
  daysUntilReview: number | null,
  priority: number,
): ReconfirmationQueueItem {
  return reconfirmationQueueItemSchema.parse({
    id: claim.id,
    claimStatus: claim.claimStatus,
    visibility: claim.visibility,
    lastConfirmedAt: claim.lastConfirmedAt,
    nextReviewAt: claim.nextReviewAt,
    updatedAt: claim.updatedAt,
    queueReason,
    recommendedAction,
    dueAt: dueAt?.toISOString() ?? null,
    daysUntilReview,
    priority,
  });
}

export function evaluateReconfirmationClaim(
  input: ReconfirmationClaimSnapshot,
  asOf: Date,
  options: ReconfirmationQueueOptions = { dueSoonDays: 30 },
  negativeEvidenceAt: string | null = null,
): ReconfirmationQueueItem | null {
  const claim = reconfirmationClaimSnapshotSchema.parse(input);
  const parsedOptions = reconfirmationQueueOptionsSchema.parse(options);
  const signalAt = z.iso.datetime({ offset: true }).nullable().parse(negativeEvidenceAt);
  if (claim.deletedAt !== null) return null;

  if (claim.claimStatus === 'confirmed' && claim.nextReviewAt !== null) {
    const dueAt = new Date(claim.nextReviewAt);
    const daysUntilReview = dayDelta(dueAt, asOf);
    if (dueAt.getTime() <= asOf.getTime()) {
      return item(claim, 'overdue', 'mark_stale', dueAt, daysUntilReview, 0);
    }
  }

  if (
    signalAt !== null &&
    (claim.claimStatus === 'confirmed' || claim.claimStatus === 'stale')
  ) {
    const dueAt = new Date(signalAt);
    return item(
      claim,
      'negative_evidence',
      'review',
      dueAt,
      dayDelta(dueAt, asOf),
      5,
    );
  }

  if (claim.claimStatus === 'stale') {
    const dueAt = claim.nextReviewAt === null ? null : new Date(claim.nextReviewAt);
    return item(
      claim,
      'stale_review',
      'review',
      dueAt,
      dueAt === null ? null : dayDelta(dueAt, asOf),
      100,
    );
  }
  if (claim.claimStatus !== 'confirmed') return null;

  if (claim.nextReviewAt === null) {
    return item(claim, 'missing_deadline', 'review', null, null, 10);
  }

  const dueAt = new Date(claim.nextReviewAt);
  const daysUntilReview = dayDelta(dueAt, asOf);
  if (daysUntilReview <= parsedOptions.dueSoonDays) {
    return item(claim, 'due_soon', 'review', dueAt, daysUntilReview, 200 + daysUntilReview);
  }
  return null;
}

export function buildReconfirmationQueue(
  claims: readonly ReconfirmationClaimSnapshot[],
  asOf: Date,
  options: ReconfirmationQueueOptions = { dueSoonDays: 30 },
): ReconfirmationQueueItem[] {
  return claims
    .map((claim) => evaluateReconfirmationClaim(claim, asOf, options))
    .filter((entry): entry is ReconfirmationQueueItem => entry !== null)
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        (left.dueAt ?? '9999').localeCompare(right.dueAt ?? '9999') ||
        left.id.localeCompare(right.id),
    );
}
