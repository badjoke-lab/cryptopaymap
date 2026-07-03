import { z } from 'zod';
import {
  ReconfirmationExpirationError,
  createReconfirmationExpirationService,
} from './expiration';
import {
  ScheduledReconfirmationError,
  scheduledReconfirmationContextSchema,
  scheduledReconfirmationInputSchema,
  scheduledReconfirmationRunReceiptSchema,
  type ScheduledReconfirmationBackend,
  type ScheduledReconfirmationContext,
  type ScheduledReconfirmationInput,
  type ScheduledReconfirmationRunReceipt,
} from './scheduled-contract';
import { scheduledReconfirmationRequestId } from './scheduled-request-id';

export function createScheduledReconfirmationService(
  backend: ScheduledReconfirmationBackend,
  requestIdFactory = scheduledReconfirmationRequestId,
) {
  const expiration = createReconfirmationExpirationService(backend);

  return {
    async run(
      context: ScheduledReconfirmationContext,
      input: ScheduledReconfirmationInput,
    ): Promise<ScheduledReconfirmationRunReceipt> {
      const contextResult = scheduledReconfirmationContextSchema.safeParse(context);
      if (!contextResult.success || !context.capabilities.includes('claim:expire')) {
        throw new ScheduledReconfirmationError(
          'unauthorized',
          'The actor is not authorized to run scheduled reconfirmation.',
          contextResult.success
            ? []
            : contextResult.error.issues.map(
                (issue) => `${issue.path.join('.')}: ${issue.message}`,
              ),
        );
      }
      const inputResult = scheduledReconfirmationInputSchema.safeParse(input);
      if (!inputResult.success) {
        throw new ScheduledReconfirmationError(
          'invalid_run',
          'The scheduled reconfirmation run is invalid.',
          inputResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        );
      }

      const effectiveAt = new Date(inputResult.data.effectiveAt);
      let batch: Awaited<ReturnType<ScheduledReconfirmationBackend['loadExpiredClaims']>>;
      try {
        batch = await backend.loadExpiredClaims(effectiveAt, inputResult.data.limit);
      } catch (error) {
        throw new ScheduledReconfirmationError(
          'backend_failure',
          'Expired Claims could not be loaded.',
          [],
          { cause: error },
        );
      }

      const outcomes: z.infer<
        typeof import('./scheduled-contract').scheduledReconfirmationOutcomeSchema
      >[] = [];
      for (const claim of batch.claims) {
        const requestId = await requestIdFactory(contextResult.data.runId, claim.id);
        try {
          const receipt = await expiration.expire(
            {
              requestId,
              actorId: contextResult.data.actorId,
              actorType: 'system',
              capabilities: ['claim:expire'],
            },
            {
              claimId: claim.id,
              expectedClaimUpdatedAt: claim.updatedAt,
              expectedClaimStatus: 'confirmed',
              expectedClaimVisibility: claim.visibility,
              expectedNextReviewAt: claim.nextReviewAt,
              effectiveAt: inputResult.data.effectiveAt,
              reasonCode: 'review_window_expired',
              publicSummary: inputResult.data.publicSummary,
              internalNote: inputResult.data.internalNote,
            },
          );
          outcomes.push({ claimId: claim.id, requestId, state: receipt.state });
        } catch (error) {
          if (error instanceof ReconfirmationExpirationError) {
            if (error.code === 'conflict' || error.code === 'not_found') {
              outcomes.push({ claimId: claim.id, requestId, state: error.code });
              continue;
            }
          }
          outcomes.push({ claimId: claim.id, requestId, state: 'failed' });
        }
      }

      const count = (state: (typeof outcomes)[number]['state']) =>
        outcomes.filter((outcome) => outcome.state === state).length;
      return scheduledReconfirmationRunReceiptSchema.parse({
        runId: contextResult.data.runId,
        effectiveAt: inputResult.data.effectiveAt,
        scannedCount: outcomes.length,
        committedCount: count('committed'),
        replayedCount: count('replayed'),
        conflictCount: count('conflict'),
        notFoundCount: count('not_found'),
        failedCount: count('failed'),
        hasMore: batch.hasMore,
        outcomes,
      });
    },
  };
}
