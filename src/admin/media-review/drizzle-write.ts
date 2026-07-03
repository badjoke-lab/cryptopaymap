import type { CryptoPayMapDatabase } from '../../db/client';
import {
  MediaReviewDecisionError,
  type MediaReviewDecisionCommand,
  type MediaReviewDecisionReceipt,
} from './decision';
import {
  readMediaReviewDecision,
  replayMediaReviewDecision,
} from './drizzle-state';

export async function executeMediaReviewWrite(
  database: CryptoPayMapDatabase,
  command: MediaReviewDecisionCommand,
): Promise<MediaReviewDecisionReceipt> {
  const existing = await readMediaReviewDecision(database, command.requestId);
  if (existing !== null) {
    if (existing.requestFingerprint !== command.requestFingerprint) {
      throw new MediaReviewDecisionError(
        'conflict',
        'The Media review request ID was reused with different content.',
      );
    }
    return replayMediaReviewDecision(existing);
  }
  throw new Error('Not implemented.');
}
