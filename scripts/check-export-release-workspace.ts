import { createR2ExportArtifactSource } from '../src/admin/export-release/artifact-source';
import { createDrizzleExportReleaseWorkspaceBackend } from '../src/admin/export-release/drizzle-workspace-backend';
import { authorizeExportReleaseRead } from '../src/admin/export-release/read-authorization';
import {
  exportReleaseDetailResponseSchema,
  exportReleaseQueueResponseSchema,
  loadExportReleaseDetail,
  loadExportReleaseQueue,
  parseExportReleaseQueueQuery,
  type ExportReleaseWorkspaceBackend,
} from '../src/admin/export-release/workspace';

for (const schema of [exportReleaseQueueResponseSchema, exportReleaseDetailResponseSchema]) {
  if (schema === undefined) throw new Error('Export release workspace schema is missing.');
}
for (const runtimeExport of [
  createR2ExportArtifactSource,
  createDrizzleExportReleaseWorkspaceBackend,
  authorizeExportReleaseRead,
  parseExportReleaseQueueQuery,
  loadExportReleaseQueue,
  loadExportReleaseDetail,
]) {
  if (typeof runtimeExport !== 'function') {
    throw new Error('Export release workspace runtime export is missing.');
  }
}

const generatedAt = '2026-07-04T00:00:00.000Z';
const asOf = new Date('2026-07-04T01:00:00.000Z');
const artifacts = {
  '/version.json': {
    projectId: 'cryptopaymap',
    siteName: 'CryptoPayMap',
    registryType: 'crypto_payment_acceptance',
    datasetVersion: '2026.07.04.1',
    schemaVersion: '1.0.0',
    generatedAt,
    canonicalOnly: true,
    verificationMarker: 'reviewed_public_records_only',
  },
};
const source = { loadArtifacts: async () => artifacts };
const backend: ExportReleaseWorkspaceBackend = {
  loadRecentDecisions: async () => ({ items: [], hasMore: false }),
  loadDecisionsForSnapshot: async () => [],
};
const context = {
  actorId: 'system:export-workspace-check',
  actorType: 'system' as const,
  capabilities: ['export:release' as const],
};
const queue = await loadExportReleaseQueue(context, source, backend, { limit: 25 }, asOf);
if (queue.currentCandidate === null) {
  throw new Error('Export release workspace did not prepare the current candidate.');
}
const detail = await loadExportReleaseDetail(
  context,
  source,
  backend,
  queue.currentCandidate.snapshotDigest,
  asOf,
);
if (detail.artifacts.length !== 1 || detail.candidate.status !== 'blocked') {
  throw new Error('Export release workspace detail is invalid.');
}

console.log('Export release workspace checks passed.');
