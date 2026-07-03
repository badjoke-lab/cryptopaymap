import type { NewExportReleaseDecision } from '../../db/schema';
import type {
  ExportReleaseDecisionCommand,
  ExportReleaseDecisionReceipt,
} from './decision';

export function exportReleaseDecisionValues(
  command: ExportReleaseDecisionCommand,
): NewExportReleaseDecision {
  return {
    id: crypto.randomUUID(),
    requestId: command.requestId,
    action: command.action,
    releaseStatus: command.action === 'approve' ? 'approved' : 'rejected',
    snapshotDigest: command.snapshotDigest,
    artifactCount: command.artifactCount,
    datasetVersion: command.datasetVersion,
    schemaVersion: command.schemaVersion,
    generatedAt: command.generatedAt,
    candidateStatus: command.candidateStatus,
    validationIssues: [...command.validationIssues],
    actorId: command.actorId,
    actorType: command.actorType,
    reasonCode: command.reasonCode,
    publicSummary: command.publicSummary,
    internalNote: command.internalNote,
    decidedAt: command.decidedAt,
    requestFingerprint: command.requestFingerprint,
  };
}

export function committedExportReleaseReceipt(
  command: ExportReleaseDecisionCommand,
): ExportReleaseDecisionReceipt {
  return {
    requestId: command.requestId,
    action: command.action,
    releaseStatus: command.action === 'approve' ? 'approved' : 'rejected',
    snapshotDigest: command.snapshotDigest,
    artifactCount: command.artifactCount,
    datasetVersion: command.datasetVersion,
    schemaVersion: command.schemaVersion,
    generatedAt: command.generatedAt.toISOString(),
    decidedAt: command.decidedAt.toISOString(),
    state: 'committed',
  };
}
