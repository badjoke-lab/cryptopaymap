import type { CryptoPayMapDatabase } from '../../db/client';
import { createAggregatedAuditHistoryBackend } from './aggregation';
import type { AuditHistoryBackend } from './contract';
import { createDrizzleAuditHistorySources } from './drizzle-sources';

export function createDrizzleAuditHistoryBackend(
  database: CryptoPayMapDatabase,
): AuditHistoryBackend {
  return createAggregatedAuditHistoryBackend(createDrizzleAuditHistorySources(database));
}
