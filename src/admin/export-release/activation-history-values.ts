import type { NewExportActivationRecord } from '../../db/schema';
import type { ExportPublicationReceipt } from './publication-contract';
import type { ExportActivationHistoryCommand } from './activation-history';

export function exportActivationRecordValues(
  command: ExportActivationHistoryCommand,
): NewExportActivationRecord {
  return {
    id: crypto.randomUUID(),
    requestId: command.requestId,
    approvalRequestId: command.approvalRequestId,
    activationStatus: 'active',
    snapshotDigest: command.snapshotDigest,
    datasetVersion: command.datasetVersion,
    schemaVersion: command.schemaVersion,
    generatedAt: command.generatedAt,
    publishedAt: command.publishedAt,
    previousSnapshotDigest: command.previousSnapshotDigest,
    pointerKey: command.pointerKey,
    releasePrefix: command.releasePrefix,
    artifactCount: command.artifactCount,
    actorId: command.actorId,
    actorType: command.actorType,
    reasonCode: command.reasonCode,
    internalNote: command.internalNote,
    requestFingerprint: command.requestFingerprint,
  };
}

export function publishedActivationReceipt(
  command: ExportActivationHistoryCommand,
): ExportPublicationReceipt {
  return {
    requestId: command.requestId,
    approvalRequestId: command.approvalRequestId,
    snapshotDigest: command.snapshotDigest,
    datasetVersion: command.datasetVersion,
    schemaVersion: command.schemaVersion,
    generatedAt: command.generatedAt.toISOString(),
    publishedAt: command.publishedAt.toISOString(),
    previousSnapshotDigest: command.previousSnapshotDigest,
    pointerKey: command.pointerKey,
    releasePrefix: command.releasePrefix,
    artifactCount: command.artifactCount,
    state: 'published',
  };
}
