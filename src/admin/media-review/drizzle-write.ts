import type { CryptoPayMapDatabase } from '../../db/client';
import type {
  MediaReviewDecisionCommand,
  MediaReviewDecisionReceipt,
} from './decision';

export async function executeMediaReviewWrite(
  _database: CryptoPayMapDatabase,
  _command: MediaReviewDecisionCommand,
): Promise<MediaReviewDecisionReceipt> {
  throw new Error('Not implemented.');
}
