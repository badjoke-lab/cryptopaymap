import type { CryptoPayMapDatabase } from '../../db/client';
import {
  MediaReviewDecisionError,
  type MediaReviewDecisionCommand,
  type MediaReviewDecisionReceipt,
} from './decision';
import { buildMediaReviewBatch } from './drizzle-batch';
import { isMediaReviewConflictCode, postgresMediaReviewErrorCode } from './drizzle-errors';
import {
  projectMediaReviewDecision,
  readMediaReviewDecision,
  replayMediaReviewDecision,
} from './drizzle-state';
import { runMediaReviewBatch } from './run-batch';

type DurableMediaReviewDecision = NonNullable<Awaited<ReturnType<typeof readMediaReviewDecision>>>;

export function replayMatchingMediaReviewDecision(
  existing: DurableMediaReviewDecision | null,
  command: Pick<MediaReviewDecisionCommand, 'requestFingerprint'>,
): MediaReviewDecisionReceipt | null {
  if (existing === null) return null;
  if (existing.requestFingerprint !== command.requestFingerprint) {
    throw new MediaReviewDecisionError(
      'conflict',
      'The Media review request ID was reused with different content.',
    );
  }
  return replayMediaReviewDecision(existing);
}

async function readMatchingReplay(
  database: CryptoPayMapDatabase,
  command: MediaReviewDecisionCommand,
): Promise<MediaReviewDecisionReceipt | null> {
  return replayMatchingMediaReviewDecision(
    await readMediaReviewDecision(database, command.requestId),
    command,
  );
}

export async function executeMediaReviewWrite(
  database: CryptoPayMapDatabase,
  command: MediaReviewDecisionCommand,
): Promise<MediaReviewDecisionReceipt> {
  const existing = await readMatchingReplay(database, command);
  if (existing !== null) return existing;

  try {
    const projected = await projectMediaReviewDecision(database, command);
    await runMediaReviewBatch(database, buildMediaReviewBatch(database, command, projected));
    return projected.receipt;
  } catch (error) {
    const code = postgresMediaReviewErrorCode(error);
    const recoverableConflict =
      code === '23505' ||
      isMediaReviewConflictCode(code) ||
      (error instanceof MediaReviewDecisionError && error.code === 'conflict');
    if (recoverableConflict) {
      const replay = await readMatchingReplay(database, command);
      if (replay !== null) return replay;
    }
    if (error instanceof MediaReviewDecisionError) throw error;
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
}
