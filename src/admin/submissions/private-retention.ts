import { SubmissionPersistenceError } from '../../submissions/persistence';
import type { PhotoPrivateCleanupReceipt } from '../../submissions/photo-private-lifecycle';
import type { PrivateMediaRetentionReceipt } from '../../submissions/private-media-retention';
import {
  PrivateRetentionError,
  privateRetentionContextSchema,
  privateRetentionDatabaseBatchSchema,
  privateRetentionInputSchema,
  privateRetentionRunReceiptSchema,
  type PrivateRetentionBackend,
  type PrivateRetentionContext,
  type PrivateRetentionInput,
  type PrivateRetentionOutcome,
  type PrivateRetentionRunReceipt,
} from './private-retention-contract';
import { privateRetentionItemId } from './private-retention-request-id';

interface CleanupRunner<T> {
  run(input: unknown): Promise<T>;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

async function sha256(value: unknown): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(canonicalize(value))),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function photoPolicy(
  reason: PhotoPrivateCleanupReceipt['candidates'][number]['reason'],
): PrivateRetentionOutcome['policy'] {
  switch (reason) {
    case 'expired_authorization':
      return 'expired_authorization';
    case 'closed_submission_without_handof':
      return 'closed_submission_without_handoff';
    case 'rejected_media':
      return 'rejected_media_30d';
    case 'superseded_media':
      return 'superseded_media_30d';
  }
}

function outcomeCounts(outcomes: PrivateRetentionOutcome[]) {
  const count = (state: PrivateRetentionOutcome['state']) =>
    outcomes.filter((outcome) => outcome.state === state).length;
  return {
    committedCount: count('committed'),
    replayedCount: count('replayed'),
    conflictCount: count('conflict'),
    failedCount: count('failed'),
  };
}

export function createPrivateRetentionService(dependencies: {
  backend: PrivateRetentionBackend;
  photoCleanup: CleanupRunner<PhotoPrivateCleanupReceipt>;
  privateMediaCleanup: CleanupRunner<PrivateMediaRetentionReceipt>;
  itemIdFactory?: typeof privateRetentionItemId;
}) {
  const itemIdFactory = dependencies.itemIdFactory ?? privateRetentionItemId;

  return {
    async run(
      context: PrivateRetentionContext,
      input: PrivateRetentionInput,
      startedAt = new Date(),
    ): Promise<PrivateRetentionRunReceipt> {
      const contextResult = privateRetentionContextSchema.safeParse(context);
      if (
        !contextResult.success ||
        !contextResult.data.capabilities.includes('submission:retention:execute')
      ) {
        throw new PrivateRetentionError(
          'unauthorized',
          'The actor is not authorized to execute private retention.',
        );
      }
      const inputResult = privateRetentionInputSchema.safeParse(input);
      if (!inputResult.success || Number.isNaN(startedAt.getTime()) {
        throw new PrivateRetentionError('invalid_run', 'The private retention run is invalid.');
      }
      const validContext = contextResult.data;
      const validInput = inputResult.data;
      const effectiveAt = new Date(validInput.effectiveAt);
      const requestFingerprint = await sha256({
        runId: validContext.runId,
      actorId: validContext.actorId,
        ...validInput,
      });

      let begin: Awaited<ReturnType<PrivateRetentionBackend['beginRun']>>;
      try {
        begin = await dependencies.backend.beginRun({
          runId: validContext.runId,
          effectiveAt,
          actorId: validContext.actorId,
          requestFingerprint,
          startedAt,
        });
      } catch (error) {
        if (error instanceof PrivateRetentionError) throw error;
        throw new PrivateRetentionError(
          'backend_failure',
          'The private retention run could not be started.',
          { cause: error },
        );
      }
      if (begin.state === 'replayed') {
        const parsed = privateRetentionRunReceiptSchema.safeParse(begin.receipt);
        if (!parsed.success) {
          throw new PrivateRetentionError(
            'backend_failure',
            'The stored private retention receipt is invalid.',
          );
        }
        return privateRetentionRunReceiptSchema.parse({ ...parsed.data, state: 'replayed' });
      }

      const outcomes: PrivateRetentionOutcome[] = [];
      const phaseFailures: PrivateRetentionRunReceipt['phaseFailures'] = [];
      let databaseHasMore = false;
      try {
        const loaded = privateRetentionDatabaseBatchSchema.parse(
          await dependencies.backend.loadDatabaseCandidates(
            effectiveAt,
            validInput.databaseLimit,
          ),
        );
        if (loaded.candidates.length > validInput.databaseLimit) {
          throw new Error('The database retention batch exceeded its requested limit.');
        }
        databaseHasMore = loaded.hasMore;
        for (const candidate of loaded.candidates) {
          if (Date.parse(candidate.eligibleAt) > effectiveAt.getTime()) {
            outcomes.push({
              material: candidate.material,
              policy: candidate.policy,
              referenceType: candidate.referenceType,
              referenceId: candidate.referenceId,
              state: 'failed',
            });
            continue;
          }
          try {
            const itemId = await itemIdFactory(
              candidate.policy,
              candidate.referenceType,
              candidate.referenceId,
            );
            const state = await dependencies.backend.applyDatabaseCandidate({
              itemId,
              runId: validContext.runId,
              actorId: validContext.actorId,
              effectiveAt,
              candidate,
            });
            outcomes.push({
              material: candidate.material,
              policy: candidate.policy,
              referenceType: candidate.referenceType,
              referenceId: candidate.referenceId,
              state,
            });
          } catch (error) {
            outcomes.push({
              material: candidate.material,
              policy: candidate.policy,
              referenceType: candidate.referenceType,
              referenceId: candidate.referenceId,
              state:
                error instanceof SubmissionPersistenceError && error.code === 'conflict'
                  ? 'conflict'
                  : 'failed',
            });
          }
        }
      } catch {
        phaseFailures.push('database_candidates');
      }

      let deletedObjectCount = 0;
      let missingObjectCount = 0;
      let failedObjectCount = 0;
      let photoHasMore = false;
      try {
        const receipt = await dependencies.photoCleanup.run({
          schemaVersion: 'photo-private-cleanup-v1',
          runId: validContext.runId,
          asOf: validInput.effectiveAt,
          limit: validInput.photoLimit,
        });
        deletedObjectCount += receipt.deletedObjectCount;
        missingObjectCount += receipt.missingObjectCount;
        failedObjectCount += receipt.failedObjectCount;
        photoHasMore = receipt.candidateCount >= validInput.photoLimit;
        for (const candidate of receipt.candidates) {
          const policy = photoPolicy(candidate.reason);
          if (candidate.outcome === 'partial') {
            outcomes.push({
              material: 'media_object_set',
              policy,
              referenceType: candidate.referenceType,
              referenceId: candidate.referenceId,
              state: 'failed',
            });
            continue;
          }
          try {
            const itemId = await itemIdFactory(
              policy,
              candidate.referenceType,
              candidate.referenceId,
            );
            const state = await dependencies.backend.completeMediaCandidate({
              itemId,
              runId: validContext.runId,
              actorId: validContext.actorId,
              effectiveAt,
              policy,
              referenceType: candidate.referenceType,
              referenceId: candidate.referenceId,
              submissionId:
                candidate.referenceType === 'submission' ? candidate.referenceId : null,
              deletedObjectCount: candidate.deletedObjectCount,
              missingObjectCount: candidate.missingObjectCount,
            });
            outcomes.push({
              material: 'media_object_set',
              policy,
              referenceType: candidate.referenceType,
              referenceId: candidate.referenceId,
              state,
            });
          } catch (error) {
            outcomes.push({
              material: 'media_object_set',
              policy,
              referenceType: candidate.referenceType,
              referenceId: candidate.referenceId,
              state:
                error instanceof SubmissionPersistenceError && error.code === 'conflict'
                  ? 'conflict'
                  : 'failed',
            });
          }
        }
      } catch {
        phaseFailures.push('photo_cleanup');
      }

      let privateMediaHasMore = false;
      try {
        const receipt = await dependencies.privateMediaCleanup.run({
          schemaVersion: 'private-media-retention-v1',
          runId: validContext.runId,
          asOf: validInput.effectiveAt,
          limit: validInput.privateMediaLimit,
        });
        deletedObjectCount += receipt.deletedObjectCount;
        missingObjectCount += receipt.missingObjectCount;
        failedObjectCount += receipt.failedObjectCount;
        privateMediaHasMore = receipt.hasMore;
        for (const candidate of receipt.candidates) {
          if (candidate.outcome === 'partial') {
            outcomes.push({
              material: 'media_object_set',
              policy: candidate.reason,
              referenceType: 'media_asset',
              referenceId: candidate.referenceId,
              state: 'failed',
            });
            continue;
          }
          try {
            const itemId = await itemIdFactory(
              candidate.reason,
              'media_asset',
              candidate.referenceId,
            );
            const state = await dependencies.backend.completeMediaCandidate({
              itemId,
              runId: validContext.runId,
              actorId: validContext.actorId,
              effectiveAt,
              policy: candidate.reason,
              referenceType: 'media_asset',
              referenceId: candidate.referenceId,
              submissionId: candidate.submissionId,
              deletedObjectCount: candidate.deletedObjectCount,
              missingObjectCount: candidate.missingObjectCount,
            });
            outcomes.push({
              material: 'media_object_set',
              policy: candidate.reason,
              referenceType: 'media_asset',
              referenceId: candidate.referenceId,
              state,
            });
          } catch (error) {
            outcomes.push({
              material: 'media_object_set',
              policy: candidate.reason,
              referenceType: 'media_asset',
              referenceId: candidate.referenceId,
              state:
                error instanceof SubmissionPersistenceError && error.code === 'conflict'
                  ? 'conflict'
                  : 'failed',
            });
          }
        }
      } catch {
        phaseFailures.push('private_media_cleanup');
      }

      const counts = outcomeCounts(outcomes);
      const state =
        counts.failedCount > 0 || failedObjectCount > 0 || phaseFailures.length > 0
          ? 'partial'
          : 'completed';
      const receipt = privateRetentionRunReceiptSchema.parse({
        schemaVersion: 'private-retention-run-receipt-v1',
        runId: validContext.runId,
        effectiveAt: validInput.effectiveAt,
        state,
        scannedCount: outcomes.length,
        ...counts,
        deletedObjectCount,
        missingObjectCount,
        failedObjectCount,
        hasMore: databaseHasMore || photoHasMore || privateMediaHasMore,
        phaseFailures,
        outcomes,
      });

      try {
        await dependencies.backend.finalizeRun({
          runId: validContext.runId,
          requestFingerprint,
          state,
          receipt,
          completedAt: new Date(),
        });
      } catch (error) {
        throw new PrivateRetentionError(
          'backend_failure',
          'The private retention run receipt could not be finalized.',
          { cause: error },
        );
      }
      return receipt;
    },
  };
}
