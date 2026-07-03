import { eq } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { exportReleaseDecisions } from '../../db/schema';
import type { ApprovedExportReleaseBackend } from './publication-contract';

export function createDrizzleApprovedExportReleaseBackend(
  database: CryptoPayMapDatabase,
): ApprovedExportReleaseBackend {
  return {
    async loadApprovedRelease(requestId: string) {
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
        })
        .from(exportReleaseDecisions)
        .where(eq(exportReleaseDecisions.requestId, requestId))
        .limit(1);
      const row = rows[0];
      if (row === undefined || row.action !== 'approve' || row.releaseStatus !== 'approved') {
        return null;
      }
      return {
        requestId: row.requestId,
        action: row.action,
        releaseStatus: row.releaseStatus,
        snapshotDigest: row.snapshotDigest,
        artifactCount: row.artifactCount,
        datasetVersion: row.datasetVersion,
        schemaVersion: row.schemaVersion,
        generatedAt: row.generatedAt.toISOString(),
        decidedAt: row.decidedAt.toISOString(),
      };
    },
  };
}
