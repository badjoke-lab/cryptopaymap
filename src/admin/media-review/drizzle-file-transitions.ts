import { and, eq } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { mediaFiles } from '../../db/schema';
import type { MediaReviewDecisionCommand } from './decision';
import type { StoragePreparedMediaReviewCommand } from './storage-contract';

export function buildMediaFileTransitionStatements(
  _database: CryptoPayMapDatabase,
  command: MediaReviewDecisionCommand,
): unknown[] {
  const prepared = command as StoragePreparedMediaReviewCommand;
  return prepared.fileTransitions ?? [];
}
