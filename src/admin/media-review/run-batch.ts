import type { CryptoPayMapDatabase } from '../../db/client';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

export function runMediaReviewBatch(database: CryptoPayMapDatabase, statements: unknown[]) {
  return database.batch(statements as unknown as DatabaseBatchInput);
}
