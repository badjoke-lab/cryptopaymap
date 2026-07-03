import {
  authorizeExportRelease,
  exportReleaseActorPolicySchema,
  readExportReleaseAuthorizationPolicy,
} from '../src/admin/export-release/authorization';
import {
  createExportReleaseDecisionService,
  exportReleaseCandidateSchema,
  exportReleaseDecisionInputSchema,
  exportReleaseMutationContextSchema,
  prepareExportReleaseCandidate,
  type ExportReleaseDecisionBackend,
  type ExportReleaseDecisionReceipt,
} from '../src/admin/export-release/decision';

for (const schema of [
  exportReleaseActorPolicySchema,
  exportReleaseMutationContextSchema,
  exportReleaseCandidateSchema,
  exportReleaseDecisionInputSchema,
]) {
  if (schema === undefined) throw new Error('Export release schema is missing.');
}

for (const runtimeExport of [
  authorizeExportRelease,
  readExportReleaseAuthorizationPolicy,
  prepareExportReleaseCandidate,
  createExportReleaseDecisionService,
]) {
  if (typeof runtimeExport !== 'function') {
    throw new Error('Export release runtime export is missing.');
  }
}

const generatedAt = '2026-07-04T00:00:00.000Z';
const digest = 'a'.repeat(64);
const candidate = {
  status: 'eligible' as const,
  snapshotDigest: digest,
  artifactCount: 12,
  metadata: {
    datasetVersion: '2026.07.04.1',
    schemaVersion: '1.0.0',
    generatedAt,
  },
  validationIssues: [],
};

let receipt: ExportReleaseDecisionReceipt | null = null;
const backend: ExportReleaseDecisionBackend = {
  async commitDecision(command) {
    if (receipt !== null) return { ...receipt, state: 'replayed' };
    receipt = {
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
    return receipt;
  },
};

const service = createExportReleaseDecisionService(backend, async () => candidate);
const context = {
  requestId: '10000000-0000-4000-8000-000000000001',
  actorId: 'system:export-release-check',
  actorType: 'system' as const,
  capabilities: ['export:release' as const],
};
const input = {
  action: 'approve' as const,
  expectedSnapshotDigest: digest,
  expectedArtifactCount: 12,
  expectedDatasetVersion: candidate.metadata.datasetVersion,
  expectedSchemaVersion: candidate.metadata.schemaVersion,
  expectedGeneratedAt: generatedAt,
  decidedAt: '2026-07-04T01:00:00.000Z',
  reasonCode: 'release_approved',
  publicSummary: 'Validated public export snapshot approved.',
  internalNote: null,
};

const committed = await service.decide(context, input, {});
const replayed = await service.decide(context, input, {});
const blocked = await prepareExportReleaseCandidate({
  '/version.json': {
    projectId: 'cryptopaymap',
    siteName: 'CryptoPayMap',
    registryType: 'crypto_payment_acceptance',
    datasetVersion: candidate.metadata.datasetVersion,
    schemaVersion: candidate.metadata.schemaVersion,
    generatedAt,
    canonicalOnly: true,
    verificationMarker: 'reviewed_public_records_only',
  },
});

if (
  committed.releaseStatus !== 'approved' ||
  committed.state !== 'committed' ||
  replayed.state !== 'replayed' ||
  blocked.status !== 'blocked' ||
  blocked.validationIssues.length === 0
) {
  throw new Error('Export release runtime checks produced an invalid result.');
}

console.log('Export release contract checks passed.');
