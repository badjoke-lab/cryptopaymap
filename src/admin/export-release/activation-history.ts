import { hashPublicArtifact } from '../../publication/export-boundary';
import type {
  ExportPublicationInput,
  ExportPublicationMutationContext,
  ExportPublicationReceipt,
} from './publication-contract';
import { ExportPublicationError } from './publication-contract';

export interface ExportActivationHistoryCommand {
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
  internalNote: string | null;
  requestFingerprint: string;
}

export interface ExportActivationHistoryBackend {
  commitActivation(command: ExportActivationHistoryCommand): Promise<ExportPublicationReceipt>;
}

export interface ExportPublicationRunner {
  publish(
    context: ExportPublicationMutationContext,
    input: ExportPublicationInput,
    artifacts: Record<string, unknown>,
  ): Promise<ExportPublicationReceipt>;
}

export async function exportActivationRequestFingerprint(
  context: ExportPublicationMutationContext,
  input: ExportPublicationInput,
): Promise<string> {
  return hashPublicArtifact({
    requestId: context.requestId,
    actorId: context.actorId,
    actorType: context.actorType,
    input,
  });
}

export function activationHistoryCommand(
  context: ExportPublicationMutationContext,
  input: ExportPublicationInput,
  receipt: ExportPublicationReceipt,
  requestFingerprint: string,
): ExportActivationHistoryCommand {
  return {
    requestId: context.requestId,
    approvalRequestId: receipt.approvalRequestId,
    snapshotDigest: receipt.snapshotDigest,
    datasetVersion: receipt.datasetVersion,
    schemaVersion: receipt.schemaVersion,
    generatedAt: new Date(receipt.generatedAt),
    publishedAt: new Date(receipt.publishedAt),
    previousSnapshotDigest: receipt.previousSnapshotDigest,
    pointerKey: receipt.pointerKey,
    releasePrefix: receipt.releasePrefix,
    artifactCount: receipt.artifactCount,
    actorId: context.actorId,
    actorType: context.actorType,
    reasonCode: input.reasonCode,
    internalNote: input.internalNote,
    requestFingerprint,
  };
}

export function createDurableExportPublicationService(
  history: ExportActivationHistoryBackend,
  runner: ExportPublicationRunner,
) {
  return {
    async publish(
      context: ExportPublicationMutationContext,
      input: ExportPublicationInput,
      artifacts: Record<string, unknown>,
    ): Promise<ExportPublicationReceipt> {
      const requestFingerprint = await exportActivationRequestFingerprint(context, input);
      let receipt: ExportPublicationReceipt;
      try {
        receipt = await runner.publish(context, input, artifacts);
      } catch (error) {
        if (error instanceof ExportPublicationError) throw error;
        throw new ExportPublicationError(
          'target_failure',
          'The export activation runner failed before durable history was written.',
          [],
          { cause: error },
        );
      }
      return history.commitActivation(
        activationHistoryCommand(context, input, receipt, requestFingerprint),
      );
    },
  };
}
