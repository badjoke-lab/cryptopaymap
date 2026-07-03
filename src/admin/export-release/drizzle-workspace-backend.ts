import { and, desc, eq } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { exportReleaseDecisions } from '../../db/schema';
import type {
  ExportReleaseDecisionSummary,
  ExportReleaseQueueQuery,
  ExportReleaseWorkspaceBackend,
} from './workspace';

const decisionSelection = {
  requestId: exportReleaseDecisions.requestId,
  action: exportReleaseDecisions.action,
  releaseStatus: exportReleaseDecisions.releaseStatus,
  snapshotDigest: exportReleaseDecisions.snapshotDigest,
  artifactCount: exportReleaseDecisions.artifactCount,
  datasetVersion: exportReleaseDecisions.datasetVersion,
  schemaVersion: exportReleaseDecisions.schemaVersion,
  generatedAt: exportReleaseDecisions.generatedAt,
  candidateStatus: exportReleaseDecisions.candidateStatus,
  validationIssues: exportReleaseDecisions.validationIssues,
  actorId: exportReleaseDecisions.actorId,
  actorType: exportReleaseDecisions.actorType,
  reasonCode: exportReleaseDecisions.reasonCode,
  publicSummary: exportReleaseDecisions.publicSummary,
  decidedAt: exportReleaseDecisions.decidedAt,
};

function summary(row: {
  requestId: string;
  action: 'approve' | 'reject';
  releaseStatus: 'approved' | 'rejected';
  snapshotDigest: string;
  artifactCount: number;
  datasetVersion: string;
  schemaVersion: string;
  generatedAt: Date;
  candidateStatus: 'eligible' | 'blocked';
  validationIssues: string[];
  actorId: string;
  actorType: 'human' | 'system';
  reasonCode: string;
  publicSummary: string | null;
  decidedAt: Date;
}): ExportReleaseDecisionSummary {
  return {
    requestId: row.requestId,
    action: row.action,
    releaseStatus: row.releaseStatus,
    snapshotDigest: row.snapshotDigest,
    artifactCount: row.artifactCount,
    datasetVersion: row.datasetVersion,
    schemaVersion: row.schemaVersion,
    generatedAt: row.generatedAt.toISOString(),
    candidateStatus: row.candidateStatus,
    validationIssueCount: row.validationIssues.length,
    actorId: row.actorId,
    actorType: row.actorType,
    reasonCode: row.reasonCode,
    publicSummary: row.publicSummary,
    decidedAt: row.decidedAt.toISOString(),
  };
}

export function createDrizzleExportReleaseWorkspaceBackend(
  database: CryptoPayMapDatabase,
): ExportReleaseWorkspaceBackend {
  return {
    async loadRecentDecisions(query: ExportReleaseQueueQuery) {
      const conditions = [];
      if (query.releaseStatus !== undefined) {
        conditions.push(eq(exportReleaseDecisions.releaseStatus, query.releaseStatus));
      }
      const rows = await database
        .select(decisionSelection)
        .from(exportReleaseDecisions)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(exportReleaseDecisions.decidedAt), desc(exportReleaseDecisions.createdAt))
        .limit(query.limit + 1);
      return {
        items: rows.slice(0, query.limit).map(summary),
        hasMore: rows.length > query.limit,
      };
    },

    async loadDecisionsForSnapshot(snapshotDigest: string, limit: number) {
      const rows = await database
        .select(decisionSelection)
        .from(exportReleaseDecisions)
        .where(eq(exportReleaseDecisions.snapshotDigest, snapshotDigest))
        .orderBy(desc(exportReleaseDecisions.decidedAt), desc(exportReleaseDecisions.createdAt))
        .limit(limit);
      return rows.map(summary);
    },
  };
}
