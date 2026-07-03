import { and, eq } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { mediaFiles } from '../../db/schema';
import type { MediaReviewDecisionCommand } from './decision';
import type { StoragePreparedMediaReviewCommand } from './storage-contract';

export function buildMediaFileTransitionStatements(
  database: CryptoPayMapDatabase,
  command: MediaReviewDecisionCommand,
): unknown[] {
  const prepared = command as StoragePreparedMediaReviewCommand;
  return (prepared.fileTransitions ?? []).map((transition) =>
    database
      .update(mediaFiles)
      .set({ storageScope: transition.toScope, storageKey: transition.toKey })
      .where(
        and(
          eq(mediaFiles.id, transition.fileId),
          eq(mediaFiles.mediaAssetId, command.mediaAssetId),
          eq(mediaFiles.storageScope, transition.fromScope),
          eq(mediaFiles.storageKey, transition.fromKey),
        ),
      ),
  );
}
