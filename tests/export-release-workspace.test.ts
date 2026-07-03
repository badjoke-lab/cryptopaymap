import { describe, expect, it } from 'vitest';
import type { ExportArtifactSource } from '../src/admin/export-release/artifact-source';
import { prepareExportReleaseCandidate } from '../src/admin/export-release/decision';
import {
  ExportReleaseWorkspaceError,
  loadExportReleaseDetail,
  loadExportReleaseQueue,
  parseExportReleaseQueueQuery,
  type ExportReleaseDecisionSummary,
  type ExportReleaseReadContext,
  type ExportReleaseWorkspaceBackend,
} from '../src/admin/export-release/workspace';

const generatedAt = '2026-07-04T00:00:00.000Z';
const asOf = new Date('2026-07-04T01:00:00.000Z');
const requestId = '10000000-0000-4000-8000-000000000001';
const context: ExportReleaseReadContext = {
  actorId: 'cloudflare-access:export-reviewer',
  actorType: 'human',
  capabilities: ['export:release'],
};

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

function source(value: Record<string, unknown> | null = artifacts): ExportArtifactSource {
  return { loadArtifacts: async () => value };
}

function decision(snapshotDigest: string): ExportReleaseDecisionSummary {
  return {
    requestId,
    action: 'reject',
    releaseStatus: 'rejected',
    snapshotDigest,
    artifactCount: 1,
    datasetVersion: '2026.07.04.1',
    schemaVersion: '1.0.0',
    generatedAt,
    candidateStatus: 'blocked',
    validationIssueCount: 11,
    actorId: context.actorId,
    actorType: context.actorType,
    reasonCode: 'release_validation_blocked',
    publicSummary: null,
    decidedAt: asOf.toISOString(),
  };
}

function backend(snapshotDigest: string): ExportReleaseWorkspaceBackend {
  return {
    loadRecentDecisions: async () => ({
      items: [decision(snapshotDigest)],
      hasMore: false,
    }),
    loadDecisionsForSnapshot: async () => [decision(snapshotDigest)],
  };
}

describe('export release workspace', () => {
  it('parses bounded release history filters', () => {
    expect(
      parseExportReleaseQueueQuery(
        new URL('https://example.test/admin/api/exports?releaseStatus=rejected&limit=50'),
      ),
    ).toEqual({ releaseStatus: 'rejected', limit: 50 });
  });

  it('rejects an unbounded queue query', () => {
    expect(() =>
      parseExportReleaseQueueQuery(new URL('https://example.test/admin/api/exports?limit=101')),
    ).toThrow(ExportReleaseWorkspaceError);
  });

  it('loads the current internally validated candidate and durable decisions', async () => {
    const candidate = await prepareExportReleaseCandidate(artifacts);
    const result = await loadExportReleaseQueue(
      context,
      source(),
      backend(candidate.snapshotDigest),
      { limit: 25 },
      asOf,
    );

    expect(result.currentCandidate).toMatchObject({
      status: 'blocked',
      snapshotDigest: candidate.snapshotDigest,
      artifactCount: 1,
      validationIssueCount: candidate.validationIssues.length,
    });
    expect(result.recentDecisions).toEqual([decision(candidate.snapshotDigest)]);
  });

  it('returns a valid queue when no private candidate exists', async () => {
    const result = await loadExportReleaseQueue(
      context,
      source(null),
      backend('a'.repeat(64)),
      { limit: 25 },
      asOf,
    );
    expect(result.currentCandidate).toBeNull();
  });

  it('loads exact artifact summaries and matching release history', async () => {
    const candidate = await prepareExportReleaseCandidate(artifacts);
    const result = await loadExportReleaseDetail(
      context,
      source(),
      backend(candidate.snapshotDigest),
      candidate.snapshotDigest,
      asOf,
    );

    expect(result.candidate.snapshotDigest).toBe(candidate.snapshotDigest);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]).toMatchObject({
      path: '/version.json',
      mediaType: 'application/json',
      recordCount: null,
    });
    expect(result.artifacts[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.decisions).toEqual([decision(candidate.snapshotDigest)]);
  });

  it('rejects an invalid or stale snapshot identity', async () => {
    const candidate = await prepareExportReleaseCandidate(artifacts);
    await expect(
      loadExportReleaseDetail(
        context,
        source(),
        backend(candidate.snapshotDigest),
        'invalid',
        asOf,
      ),
    ).rejects.toMatchObject({ code: 'invalid_digest' });
    await expect(
      loadExportReleaseDetail(
        context,
        source(),
        backend(candidate.snapshotDigest),
        'b'.repeat(64),
        asOf,
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('requires the isolated export release capability', async () => {
    await expect(
      loadExportReleaseQueue(
        { ...context, capabilities: [] } as ExportReleaseReadContext,
        source(),
        backend('a'.repeat(64)),
        { limit: 25 },
        asOf,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });
});
