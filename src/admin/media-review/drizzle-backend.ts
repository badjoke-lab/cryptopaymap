import type { CryptoPayMapDatabase } from '../../db/client';
import type { MediaReviewDecisionBackend } from './decision';
import { executeMediaReviewWrite } from './drizzle-write';

export function createDrizzleMediaReviewBackend(
  database: CryptoPayMapDatabase,
): MediaReviewDecisionBackend {
  return {
    commitDecision: (command) => executeMediaReviewWrite(database, command),
  };
}
