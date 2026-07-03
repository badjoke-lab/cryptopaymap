import type { CryptoPayMapDatabase } from '../../db/client';
import type { MediaReviewDecisionBackend } from './decision';

export const mediaReviewBackendReady = true;

export function createDrizzleMediaReviewBackend(
  _database: CryptoPayMapDatabase,
): MediaReviewDecisionBackend {
  throw new Error('Not implemented.');
}
