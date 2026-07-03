import type { CryptoPayMapDatabase } from '../../db/client';
import {
  MediaReviewDecisionError,
  type MediaReviewDecisionCommand,
  type MediaReviewDecisionReceipt,
} from './decision';
import { buildMediaReviewBatch } from './drizzle-batch';
import {
  projectMediaReviewDecision,
  readMediaReviewDecision,
  replayMediaReviewDecision,
} from './drizzle-state';
import { runMediaReviewBatch } from './run-batch';

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
  const projected = await projectMediaReviewDecision(database, command);
  const statements = buildMediaReviewBatch(database, command, projected);
  await runMediaReviewBatch(database, statements);
  return projected.receipt;
}
