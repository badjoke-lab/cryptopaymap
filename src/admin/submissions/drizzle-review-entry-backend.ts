import type { CryptoPayMapDatabase } from '../../db/client';
import { createDrizzleSuggestReviewTransitionBackend } from './drizzle-suggest-review-transition-backend';
import type { SuggestReviewTransitionBackend } from './transitions';

export function createDrizzleReviewEntryBackend(
  database: CryptoPayMapDatabase,
): SuggestReviewTransitionBackend {
  return createDrizzleSuggestReviewTransitionBackend(database);
}
