import {
  createExportReleaseDecisionService,
  ExportReleaseDecisionError,
  type ExportReleaseDecisionInput,
  type ExportReleaseDecisionReceipt,
  type ExportReleaseMutationContext,
} from './decision';
import { createDrizzleExportReleaseBackend } from './drizzle-backend';
import {
  exportArtifactSourceFromEnvironment,
  exportReleaseDatabase,
  type ExportReleaseEnvironment,
} from './http-environment';

export async function writeExportReleaseDecision(
  context: ExportReleaseMutationContext,
  body: unknown,
  environment: ExportReleaseEnvironment,
  decidedAt: Date,
): Promise<ExportReleaseDecisionReceipt> {
  const input = {
    ...(body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {}),
    decidedAt: decidedAt.toISOString(),
  } as ExportReleaseDecisionInput;

  const artifacts = await exportArtifactSourceFromEnvironment(environment).loadArtifacts();
  if (artifacts === null) {
    throw new ExportReleaseDecisionError(
      'validation_failed',
      'No private export release candidate is available.',
      ['candidate_missing'],
    );
  }

  return createExportReleaseDecisionService(
    createDrizzleExportReleaseBackend(exportReleaseDatabase(environment)),
  ).decide(context, input, artifacts);
}
