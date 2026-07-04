import { desc } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { exportActivationRecords } from '../../db/schema';
import type {
  ExportReleaseHistoryBackend,
  ExportReleaseHistoryItem,
  ExportReleaseHistoryQuery,
} from './history';

const selection = {
  requestId: exportActivationRecords.requestId,
  approvalRequestId: exportActivationRecords.approvalRequestId,
  snapshotDigest: exportActivationRecords.snapshotDigest,
  datasetVersion: exportActivationRecords.datasetVersion,
  schemaVersion: exportActivationRecords.schemaVersion,
  generatedAt: exportActivationRecords.generatedAt,
  publishedAt: exportActivationRecords.publishedAt,
  previousSnapshotDigest: exportActivationRecords.previousSnapshotDigest,
  pointerKey: exportActivationRecords.pointerKey,
  releasePrefix: exportActivationRecords.releasePrefix,
  artifactCount: exportActivationRecords.artifactCount,
  actorId: exportActivationRecords.actorId,
  actorType: exportActivationRecords.actorType,
  reasonCode: exportActivationRecords.reasonCode,
};

interface HistoryRow {
  requestId: string;
  approvalRequestId: string;
  snapshotDigest: string;
  datasetVersion: string;
  schemaVersion: string;
  generatedAt: Date;
  publishedAt: Date;
  previousSnapshotDigest: string | null;
  pointerKey: string;
  releasePrefix: string;
  artifactCount: number;
  actorId: string;
  actorType: 'human' | 'system';
  reasonCode: string;
}

function toHistoryItem(row: HistoryRow): ExportReleaseHistoryItem {
  return {
    ...row,
    generatedAt: row.generatedAt.toISOString(),
    publishedAt: row.publishedAt.toISOString(),
    isCurrent: false,
  };
}

export function createDrizzleExportReleaseHistoryBackend(
  database: CryptoPayMapDatabase,
): ExportReleaseHistoryBackend {
  return {
    async loadReleaseHistory(query: ExportReleaseHistoryQuery) {
      const rows = await database
        .select(selection)
        .from(exportActivationRecords)
        .orderBy(desc(exportActivationRecords.publishedAt), desc(exportActivationRecords.createdAt))
        .limit(query.limit + 1);
      return {
        items: rows.slice(0, query.limit).map(toHistoryItem),
        hasMore: rows.length > query.limit,
      };
    },
  };
}
