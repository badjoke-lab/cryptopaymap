import { eq } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { exportActivationRecords } from '../../db/schema';
import type { ExportPublicationReceipt } from './publication-contract';

export interface StoredExportActivationRecord {
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
  requestFingerprint: string;
}

export async function readExportActivationRecord(
  database: CryptoPayMapDatabase,
  requestId: string,
): Promise<StoredExportActivationRecord | null> {
  const rows = await database
    .select({
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
      requestFingerprint: exportActivationRecords.requestFingerprint,
    })
    .from(exportActivationRecords)
    .where(eq(exportActivationRecords.requestId, requestId))
    .limit(1);
  return rows[0] ?? null;
}

export function replayExportActivationRecord(
  stored: StoredExportActivationRecord,
): ExportPublicationReceipt {
  return {
    requestId: stored.requestId,
    approvalRequestId: stored.approvalRequestId,
    snapshotDigest: stored.snapshotDigest,
    datasetVersion: stored.datasetVersion,
    schemaVersion: stored.schemaVersion,
    generatedAt: stored.generatedAt.toISOString(),
    publishedAt: stored.publishedAt.toISOString(),
    previousSnapshotDigest: stored.previousSnapshotDigest,
    pointerKey: stored.pointerKey,
    releasePrefix: stored.releasePrefix,
    artifactCount: stored.artifactCount,
    state: 'replayed',
  };
}
