import { describe, expect, it, vi } from 'vitest';
import {
  createExportReleaseDecisionService,
  ExportReleaseDecisionError,
  prepareExportReleaseCandidate,
  type ExportReleaseCandidate,
  type ExportReleaseDecisionBackend,
  type ExportReleaseDecisionCommand,
  type ExportReleaseDecisionInput,
  type ExportReleaseDecisionReceipt,
  type ExportReleaseMutationContext,
} from '../src/admin/export-release/decision';

const requestId = '10000000-0000-4000-8000-000000000001';
const digest = 'a'.repeat(64);
const generatedAt = '2026-07-04T00:00:00.000Z';
const decidedAt = '2026-07-04T01:00:00.000Z';

const context: ExportReleaseMutationContext = {
  requestId,
  actorId: 'cloudflare-access:export-reviewer',
  actorType: 'human',
  capabilities: ['export:release'],
};

const input: ExportReleaseDecisionInput = {
  action: 'approve',
  expectedSnapshotDigest: digest,
  expectedArtifactCount: 12,
  expectedDatasetVersion: '2026.07.04.1',
  expectedSchemaVersion: '1.0.0',
  expectedGeneratedAt: generatedAt,
  decidedAt,
  reasonCode: 'release_approved',
  publicSummary: 'Validated public export snapshot approved.',
  internalNote: null,
};

const eligibleCandidate: ExportReleaseCandidate = {
  status: 'eligible',
  snapshotDigest: digest,
  artifactCount: 12,
  metadata: {
    datasetVersion: input.expectedDatasetVersion,
    schemaVersion: input.expectedSchemaVersion,
    generatedAt,
  },
  validationIssues: [],
};

const blockedCandidate: ExportReleaseCandidate = {
  ...eligibleCandidate,
  status: 'blocked',
  validationIssues: ['/data/places.json: required public artifact is missing'],
};

class ReplayBackend implements ExportReleaseDecisionBackend {
  readonly commands: ExportReleaseDecisionCommand[] = [];
  private readonly receipts = new Map<
    string,
    { fingerprint: string; receipt: ExportReleaseDecisionReceipt }
  >();

  async commitDecision(command: ExportReleaseDecisionCommand) {
    this.commands.push(command);
    const existing = this.receipts.get(command.requestId);
    if (existing !== undefined) {
      if (existing.fingerprint !== command.requestFingerprint) {
        throw new ExportReleaseDecisionError(
          'conflict',
          'The request identity was reused with different release content.',
        );
      }
      return { ...existing.receipt, state: 'replayed' as const };
    }

    const receipt: ExportReleaseDecisionReceipt = {
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
    this.receipts.set(command.requestId, {
      fingerprint: command.requestFingerprint,
      receipt,
    });
    return receipt;
  }
}

describe('export release decision contract', () => {
  it('approves only the exact internally validated snapshot', async () => {
    const backend = new ReplayBackend();
    const prepare = vi.fn(async () => eligibleCandidate);
    const receipt = await createExportReleaseDecisionService(backend, prepare).decide(
      context,
      input,
      {},
    );

    expect(receipt).toMatchObject({
      action: 'approve',
      releaseStatus: 'approved',
      snapshotDigest: digest,
      state: 'committed',
    });
    expect(backend.commands).toHaveLength(1);
    expect(backend.commands[0]).toMatchObject({
      actorId: context.actorId,
      candidateStatus: 'eligible',
      validationIssues: [],
      datasetVersion: input.expectedDatasetVersion,
    });
  });

  it('records an explicit rejection of a pinned blocked snapshot', async () => {
    const backend = new ReplayBackend();
    const rejection = {
      ...input,
      action: 'reject' as const,
      reasonCode: 'release_validation_blocked',
      publicSummary: null,
      internalNote: 'The candidate failed the public export boundary.',
    };
    const receipt = await createExportReleaseDecisionService(
      backend,
      async () => blockedCandidate,
    ).decide(context, rejection, {});

    expect(receipt.releaseStatus).toBe('rejected');
    expect(backend.commands[0]?.validationIssues).toEqual(blockedCandidate.validationIssues);
  });

  it('blocks approval when the public export boundary reports issues', async () => {
    const backend = new ReplayBackend();
    await expect(
      createExportReleaseDecisionService(backend, async () => blockedCandidate).decide(
        context,
        input,
        {},
      ),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      issues: blockedCandidate.validationIssues,
    });
    expect(backend.commands).toHaveLength(0);
  });

  it('rejects a changed snapshot before persistence', async () => {
    const backend = new ReplayBackend();
    await expect(
      createExportReleaseDecisionService(backend, async () => ({
        ...eligibleCandidate,
        snapshotDigest: 'b'.repeat(64),
      })).decide(context, input, {}),
    ).rejects.toMatchObject({ code: 'conflict', issues: ['snapshotDigest'] });
    expect(backend.commands).toHaveLength(0);
  });

  it('replays an identical request and rejects request identity reuse', async () => {
    const backend = new ReplayBackend();
    const service = createExportReleaseDecisionService(backend, async () => eligibleCandidate);

    await expect(service.decide(context, input, {})).resolves.toMatchObject({ state: 'committed' });
    await expect(service.decide(context, input, {})).resolves.toMatchObject({ state: 'replayed' });
    await expect(
      service.decide(context, { ...input, reasonCode: 'different_reason' }, {}),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('requires the isolated export release capability', async () => {
    const backend = new ReplayBackend();
    await expect(
      createExportReleaseDecisionService(backend, async () => eligibleCandidate).decide(
        { ...context, capabilities: [] } as ExportReleaseMutationContext,
        input,
        {},
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(backend.commands).toHaveLength(0);
  });

  it('prepares a blocked candidate with stable metadata and validation issues', async () => {
    const candidate = await prepareExportReleaseCandidate({
      '/version.json': {
        projectId: 'cryptopaymap',
        siteName: 'CryptoPayMap',
        registryType: 'crypto_payment_acceptance',
        datasetVersion: input.expectedDatasetVersion,
        schemaVersion: input.expectedSchemaVersion,
        generatedAt,
        canonicalOnly: true,
        verificationMarker: 'reviewed_public_records_only',
      },
    });

    expect(candidate.status).toBe('blocked');
    expect(candidate.artifactCount).toBe(1);
    expect(candidate.metadata).toEqual({
      datasetVersion: input.expectedDatasetVersion,
      schemaVersion: input.expectedSchemaVersion,
      generatedAt,
    });
    expect(candidate.validationIssues.length).toBeGreaterThan(0);
    expect(candidate.snapshotDigest).toMatch(/^[a-f0-9]{64}$/);
  });
});
