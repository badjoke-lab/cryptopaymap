import { createR2ExportPublicationTarget } from '../src/admin/export-release/activation-r2';
import { InMemoryExportPublicationTarget } from '../src/admin/export-release/in-memory-activation';
import {
  authorizeExportPublication,
  exportPublicationActorPolicySchema,
  readExportPublicationAuthorizationPolicy,
} from '../src/admin/export-release/publication-authorization';
import {
  activeExportReleasePointerSchema,
  createExportPublicationService,
  exportPublicationInputSchema,
  exportPublicationMutationContextSchema,
  type ExportPublicationPlan,
} from '../src/admin/export-release/publication-contract';
import { createDrizzleApprovedExportReleaseBackend } from '../src/admin/export-release/publication-db';

for (const schema of [
  exportPublicationActorPolicySchema,
  exportPublicationMutationContextSchema,
  exportPublicationInputSchema,
  activeExportReleasePointerSchema,
]) {
  if (schema === undefined) throw new Error('Export activation schema is missing.');
}
for (const runtimeExport of [
  authorizeExportPublication,
  readExportPublicationAuthorizationPolicy,
  createExportPublicationService,
  createR2ExportPublicationTarget,
  createDrizzleApprovedExportReleaseBackend,
]) {
  if (typeof runtimeExport !== 'function') {
    throw new Error('Export activation runtime export is missing.');
  }
}

const requestId = '10000000-0000-4000-8000-000000000001';
const approvalRequestId = '10000000-0000-4000-8000-000000000002';
const snapshotDigest = 'a'.repeat(64);
const generatedAt = '2026-07-04T00:00:00.000Z';
const publishedAt = '2026-07-04T02:00:00.000Z';
const releasePrefix = `export-releases/by-snapshot/${snapshotDigest}/`;
const plan: ExportPublicationPlan = {
  pointerKey: 'export-releases/active.json',
  releasePrefix,
  pointer: {
    formatVersion: '1',
    snapshotDigest,
    datasetVersion: '2026.07.04.1',
    schemaVersion: '1.0.0',
    generatedAt,
    publishedAt,
    releasePrefix,
    files: [
      {
        path: '/version.json',
        objectKey: `${releasePrefix}version.json`,
        mediaType: 'application/json',
        sha256: 'b'.repeat(64),
        canonicalByteSize: 12,
      },
    ],
  },
  objects: [
    {
      path: '/version.json',
      objectKey: `${releasePrefix}version.json`,
      mediaType: 'application/json',
      sha256: 'b'.repeat(64),
      canonicalByteSize: 12,
      body: '{"ok":true}\n',
    },
  ],
};
const target = new InMemoryExportPublicationTarget();
const service = createExportPublicationService(
  {
    loadApprovedRelease: async () => ({
      requestId: approvalRequestId,
      action: 'approve',
      releaseStatus: 'approved',
      snapshotDigest,
      artifactCount: 1,
      datasetVersion: '2026.07.04.1',
      schemaVersion: '1.0.0',
      generatedAt,
      decidedAt: '2026-07-04T01:00:00.000Z',
    }),
  },
  target,
  async () => plan,
);
const receipt = await service.publish(
  {
    requestId,
    actorId: 'system:export-activation-check',
    actorType: 'system',
    capabilities: ['export:publish'],
  },
  {
    approvalRequestId,
    expectedSnapshotDigest: snapshotDigest,
    expectedArtifactCount: 1,
    expectedDatasetVersion: '2026.07.04.1',
    expectedSchemaVersion: '1.0.0',
    expectedGeneratedAt: generatedAt,
    expectedActiveSnapshotDigest: null,
    publishedAt,
    reasonCode: 'activate_approved_release',
    internalNote: null,
  },
  {},
);
if (
  receipt.state !== 'published' ||
  target.snapshot().pointer?.pointer.snapshotDigest !== snapshotDigest
) {
  throw new Error('Export activation runtime checks produced an invalid result.');
}
console.log('Export activation checks passed.');
