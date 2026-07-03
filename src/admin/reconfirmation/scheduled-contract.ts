import { z } from 'zod';
import type { ReconfirmationExpirationBackend } from './expiration';

export const scheduledReconfirmationContextSchema = z
  .object({
    runId: z.uuid(),
    actorId: z.string().trim().min(1).max(200),
    actorType: z.literal('system'),
    capabilities: z.array(z.literal('claim:expire')).min(1),
  })
  .strict();

export const scheduledReconfirmationInputSchema = z
  .object({
    effectiveAt: z.iso.datetime({ offset: true }),
    limit: z.number().int().min(1).max(50).default(50),
    publicSummary: z.string().trim().min(1).max(1000).nullable(),
    internalNote: z.string().trim().min(1).max(2000).nullable(),
  })
  .strict();

export const scheduledReconfirmationClaimSchema = z
  .object({
    id: z.uuid(),
    claimStatus: z.literal('confirmed'),
    visibility: z.enum(['public', 'hidden', 'temporarily_hidden']),
    updatedAt: z.iso.datetime({ offset: true }),
    nextReviewAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const scheduledReconfirmationBatchSchema = z
  .object({
    claims: z.array(scheduledReconfirmationClaimSchema).max(50),
    hasMore: z.boolean(),
  })
  .strict();

export const scheduledReconfirmationOutcomeSchema = z
  .object({
    claimId: z.uuid(),
    requestId: z.uuid(),
    state: z.enum(['committed', 'replayed', 'conflict', 'not_found', 'failed']),
  })
  .strict();

export const scheduledReconfirmationRunReceiptSchema = z
  .object({
    runId: z.uuid(),
    effectiveAt: z.iso.datetime({ offset: true }),
    scannedCount: z.number().int().min(0).max(50),
    committedCount: z.number().int().min(0).max(50),
    replayedCount: z.number().int().min(0).max(50),
    conflictCount: z.number().int().min(0).max(50),
    notFoundCount: z.number().int().min(0).max(50),
    failedCount: z.number().int().min(0).max(50),
    hasMore: z.boolean(),
    outcomes: z.array(scheduledReconfirmationOutcomeSchema).max(50),
  })
  .strict();

export type ScheduledReconfirmationContext = z.infer<
  typeof scheduledReconfirmationContextSchema
>;
export type ScheduledReconfirmationInput = z.infer<typeof scheduledReconfirmationInputSchema>;
export type ScheduledReconfirmationClaim = z.infer<typeof scheduledReconfirmationClaimSchema>;
export type ScheduledReconfirmationBatch = z.infer<typeof scheduledReconfirmationBatchSchema>;
export type ScheduledReconfirmationOutcome = z.infer<
  typeof scheduledReconfirmationOutcomeSchema
>;
export type ScheduledReconfirmationRunReceipt = z.infer<
  typeof scheduledReconfirmationRunReceiptSchema
>;

export interface ScheduledReconfirmationBackend extends ReconfirmationExpirationBackend {
  loadExpiredClaims(effectiveAt: Date, limit: number): Promise<ScheduledReconfirmationBatch>;
}

export type ScheduledReconfirmationErrorCode =
  | 'unauthorized'
  | 'invalid_run'
  | 'backend_failure';

export class ScheduledReconfirmationError extends Error {
  readonly code: ScheduledReconfirmationErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: ScheduledReconfirmationErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ScheduledReconfirmationError';
    this.code = code;
    this.issues = issues;
  }
}
