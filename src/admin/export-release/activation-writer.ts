import { exportArtifactSourceFromEnvironment, exportReleaseDatabase } from './http-environment';
import {
  createExportPublicationService,
  ExportPublicationError,
  type ExportPublicationInput,
  type ExportPublicationMutationContext,
  type ExportPublicationReceipt,
} from './publication-contract';
import { createDrizzleApprovedExportReleaseBackend } from './publication-db';
import {
  exportPublicationTargetFromEnvironment,
  type ExportActivationEnvironment,
} from './activation-environment';

export async function activateExportRelease(
  context: ExportPublicationMutationContext,
  body: unknown,
  environment: ExportActivationEnvironment,
  publishedAt: Date,
): Promise<ExportPublicationReceipt> {
  const input = {
    ...(body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {}),
    publishedAt: publishedAt.toISOString(),
  } as ExportPublicationInput;

  const artifacts = await exportArtifactSourceFromEnvironment(environment).loadArtifacts();
  if (artifacts === null) {
    throw new ExportPublicationError(
      'candidate_mismatch',
      'No private export release candidate is available.',
      ['candidate_missing'],
    );
  }

  const database = exportReleaseDatabase(environment);
  return createExportPublicationService(
    createDrizzleApprovedExportReleaseBackend(database),
    exportPublicationTargetFromEnvironment(environment),
  ).publish(context, input, artifacts);
}
