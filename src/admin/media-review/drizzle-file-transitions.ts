import type { CryptoPayMapDatabase } from '../../db/client';
import type { MediaReviewDecisionCommand } from './decision';

export function buildMediaFileTransitionStatements(
  _database: CryptoPayMapDatabase,
  _command: MediaReviewDecisionCommand,
): unknown[] {
  return [];
}
