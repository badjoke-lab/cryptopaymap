import type { MediaReviewDecisionCommand, MediaReviewDecisionReceipt } from './decision';
import {
  MediaStorageError,
  type MediaStorageAdapter,
  type MediaStorageAwareDecisionBackend,
  type MediaStorageOperation,
  type StoragePreparedMediaReviewCommand,
} from './storage-contract';
import { buildMediaStoragePlan } from './storage-plan';

function assertSourceMatches(
  operation: MediaStorageOperation,
  source: Awaited<ReturnType<MediaStorageAdapter['inspectPrivateObject']>>,
) {
  if (source === null) {
    throw new MediaStorageError(
      'source_missing',
      'A private Media derivative required for publication was not found.',
      [operation.source.key],
    );
  }
  if (
    source.key !== operation.source.key ||
    source.mimeType !== operation.source.mimeType ||
    source.contentHash !== operation.source.contentHash
  ) {
    throw new MediaStorageError(
      'source_mismatch',
      'A private Media derivative changed before publication.',
      [operation.source.key],
    );
  }
}

async function cleanupPublishedObjects(
  storage: MediaStorageAdapter,
  keys: readonly string[],
): Promise<void> {
  const failures: string[] = [];
  for (const key of [...keys].reverse()) {
    try {
      await storage.revokePublicObject(key);
    } catch {
      failures.push(key);
    }
  }
  if (failures.length > 0) {
    throw new MediaStorageError(
      'cleanup_failed',
      'Published Media objects could not be fully cleaned up.',
      failures,
    );
  }
}

async function publishObjects(
  storage: MediaStorageAdapter,
  operations: readonly MediaStorageOperation[],
): Promise<void> {
  const published: string[] = [];
  try {
    for (const operation of operations) {
      const source = await storage.inspectPrivateObject(operation.source.key);
      assertSourceMatches(operation, source);
      await storage.publishObject(operation.source.key, operation.destination);
      published.push(operation.destination.key);
    }
  } catch (error) {
    try {
      await cleanupPublishedObjects(storage, published);
    } catch (cleanupError) {
      throw cleanupError;
    }
    if (error instanceof MediaStorageError) throw error;
    throw new MediaStorageError(
      'publish_failed',
      'A Media derivative could not be published.',
      [],
      { cause: error },
    );
  }
}

async function revokeObjects(
  storage: MediaStorageAdapter,
  operations: readonly MediaStorageOperation[],
): Promise<void> {
  const failures: string[] = [];
  for (const operation of operations) {
    try {
      await storage.revokePublicObject(operation.source.key);
    } catch {
      failures.push(operation.source.key);
    }
  }
  if (failures.length > 0) {
    throw new MediaStorageError(
      'revoke_failed',
      'Public Media objects could not be fully revoked.',
      failures,
    );
  }
}

export function createStorageAwareMediaReviewBackend(
  decisionBackend: MediaStorageAwareDecisionBackend,
  storage: MediaStorageAdapter,
): MediaStorageAwareDecisionBackend {
  return {
    async commitDecision(command: MediaReviewDecisionCommand): Promise<MediaReviewDecisionReceipt> {
      const plan = buildMediaStoragePlan(command);
      const prepared: StoragePreparedMediaReviewCommand = {
        ...command,
        fileTransitions: plan.transitions,
      };

      if (command.action === 'approve_public') {
        const receipt = await decisionBackend.commitDecision(prepared);
        await publishObjects(storage, plan.operations);
        return receipt;
      }

      if (command.action === 'restrict' || command.action === 'supersede') {
        await revokeObjects(storage, plan.operations);
      }
      return decisionBackend.commitDecision(prepared);
    },
  };
}
