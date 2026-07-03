import type { CryptoPayMapDatabase } from '../../db/client';
import {
  MediaReviewDecisionError,
  type MediaReviewDecisionCommand,
  type MediaReviewDecisionReceipt,
} from './decision';
import { buildMediaReviewBatch } from './drizzle-batch';
import {
  isMediaReviewConflictCode,
  postgresMediaReviewErrorCode,
} from './drizzle-errors';
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
  try {
    await runMediaReviewBatch(database, buildMediaReviewBatch(database, command, projected));
  } catch (error) {
    const code = postgresMediaReviewErrorCode(error);
    if (code === '23505') {
      const replay = await readMediaReviewDecision(database, command.requestId);
      if (replay?.requestFingerprint === command.requestFingerprint) {
        return replayMediaReviewDecision(replay);
      }
    }
    if (isMediaReviewConflictCode(code)) {
      throw new MediaReviewDecisionError(
        'conflict',
        'The Media review conflicted with current private state.',
        code === null ? [] : [`The database rejected the atomic batch with code ${code}.`],
        { cause: error },
      );
    }
    throw error;
  }
  return projected.receipt;
}
