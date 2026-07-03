import { eq } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { exportReleaseDecisions } from '../../db/schema';
import type { ExportReleaseDecisionReceipt } from './decision';

export interface StoredExportReleaseDecision {
  requestId: string;
  action: 'approve' | 'reject';
  releaseStatus: 'approved' | 'rejected';
  snapshotDigest: string;
  artifactCount: number;
  datasetVersion: string;
  schemaVersion: string;
  generatedAt: Date;
  decidedAt: Date;
  requestFingerprint: string;
}

export async function readExportReleaseDecision(
  database: CryptoPayMapDatabase,
  requestId: string,
): Promise<StoredExportReleaseDecision | null> {
  const rows = await database
    .select({
      requestId: exportReleaseDecisions.requestId,
      action: exportReleaseDecisions.action,
      releaseStatus: exportReleaseDecisions.releaseStatus,
      snapshotDigest: exportReleaseDecisions.snapshotDigest,
      artifactCount: exportReleaseDecisions.artifactCount,
      datasetVersion: exportReleaseDecisions.datasetVersion,
      schemaVersion: exportReleaseDecisions.schemaVersion,
      generatedAt: exportReleaseDecisions.generatedAt,
      decidedAt: exportReleaseDecisions.decidedAt,
      requestFingerprint: exportReleaseDecisions.requestFingerprint,
    })
    .from(exportReleaseDecisions)
    .where(eq(exportReleaseDecisions.requestId, requestId))
    .limit(1);

  return rows[0] ?? null;
}

export function replayExportReleaseDecision(
  stored: StoredExportReleaseDecision,
): ExportReleaseDecisionReceipt {
  return {
    requestId: stored.requestId,
    action: stored.action,
    releaseStatus: stored.releaseStatus,
    snapshotDigest: stored.snapshotDigest,
    artifactCount: stored.artifactCount,
    datasetVersion: stored.datasetVersion,
    schemaVersion: stored.schemaVersion,
    generatedAt: stored.generatedAt.toISOString(),
    decidedAt: stored.decidedAt.toISOString(),
    state: 'replayed',
  };
}
