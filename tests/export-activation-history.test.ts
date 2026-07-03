import { describe, expect, it } from 'vitest';
import {
  activationHistoryCommand,
  createDurableExportPublicationService,
  exportActivationRequestFingerprint,
  type ExportActivationHistoryBackend,
  type ExportActivationHistoryCommand,
} from '../src/admin/export-release/activation-history';
import { ExportPublicationError } from '../src/admin/export-release/publication-contract';
import type {
  ExportPublicationInput,
  ExportPublicationMutationContext,
  ExportPublicationReceipt,
} from '../src/admin/export-release/publication-contract';

const requestId = '10000000-0000-4000-8000-000000000001';
const approvalRequestId = '10000000-0000-4000-8000-000000000002';
const generatedAt = '2026-07-04T00:00:00.000Z';
const publishedAt = '2026-07-04T02:00:00.000Z';
const snapshotDigest = 'a'.repeat(64);

const context: ExportPublicationMutationContext = {
  requestId,
  actorId: 'cloudflare-access:release-activator',
  actorType: 'human',
  capabilities: ['export:publish'],
};

const input: ExportPublicationInput = {
  approvalRequestId,
  expectedSnapshotDigest: snapshotDigest,
  expectedArtifactCount: 12,
  expectedDatasetVersion: '2026.07.04.1',
  expectedSchemaVersion: '1.0.0',
  expectedGeneratedAt: generatedAt,
  expectedActiveSnapshotDigest: null,
  publishedAt,
  reasonCode: 'activate_approved_release',
  internalNote: null,
};

function receipt(state: 'published' | 'replayed' = 'published'): ExportPublicationReceipt {
  return {
    requestId,
    approvalRequestId,
    snapshotDigest,
    datasetVersion: input.expectedDatasetVersion,
    schemaVersion: input.expectedSchemaVersion,
    generatedAt,
    publishedAt,
    previousSnapshotDigest: null,
    pointerKey: 'export-releases/active.json',
    releasePrefix: `export-releases/by-snapshot/${snapshotDigest}/`,
    artifactCount: 12,
    state,
  };
}

class MemoryHistory implements ExportActivationHistoryBackend {
  readonly commands: ExportActivationHistoryCommand[] = [];
  private readonly records = new Map<string, ExportActivationHistoryCommand>();

  async commitActivation(command: ExportActivationHistoryCommand) {
    this.commands.push(command);
    const existing = this.records.get(command.requestId);
    if (existing !== undefined) {
      if (existing.requestFingerprint !== command.requestFingerprint) {
        throw new ExportPublicationError('pointer_conflict', 'request reused', [
          'requestFingerprint',
        ]);
      }
      return { ...receipt('replayed'), publishedAt: existing.publishedAt.toISOString() };
    }
    this.records.set(command.requestId, command);
    return receipt('published');
  }
}

describe('activation history contract', () => {
  it('computes a stable fingerprint from actor, request, and exact activation input', async () => {
    const first = await exportActivationRequestFingerprint(context, input);
    const second = await exportActivationRequestFingerprint(context, input);
    const changed = await exportActivationRequestFingerprint(context, {
      ...input,
      expectedActiveSnapshotDigest: 'b'.repeat(64),
    });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(second);
    expect(first).not.toBe(changed);
  });

  it('records a successful activation after the runner returns a receipt', async () => {
    const history = new MemoryHistory();
    const runner = { publish: async () => receipt('published') };
    const result = await createDurableExportPublicationService(history, runner).publish(
      context,
      input,
      {},
    );

    expect(result.state).toBe('published');
    expect(history.commands).toHaveLength(1);
    expect(history.commands[0]).toMatchObject({
      requestId,
      approvalRequestId,
      snapshotDigest,
      reasonCode: input.reasonCode,
      internalNote: null,
    });
  });

  it('returns durable replay for the same request and fingerprint', async () => {
    const history = new MemoryHistory();
    const runner = { publish: async () => receipt('published') };
    const service = createDurableExportPublicationService(history, runner);

    await expect(service.publish(context, input, {})).resolves.toMatchObject({
      state: 'published',
    });
    await expect(service.publish(context, input, {})).resolves.toMatchObject({
      state: 'replayed',
    });
  });

  it('does not write activation history when the runner fails', async () => {
    const history = new MemoryHistory();
    const runner = {
      publish: async () => {
        throw new ExportPublicationError('pointer_conflict', 'active pointer changed');
      },
    };

    await expect(
      createDurableExportPublicationService(history, runner).publish(context, input, {}),
    ).rejects.toMatchObject({ code: 'pointer_conflict' });
    expect(history.commands).toHaveLength(0);
  });

  it('maps a receipt to an exact durable history command', async () => {
    const fingerprint = await exportActivationRequestFingerprint(context, input);
    expect(activationHistoryCommand(context, input, receipt(), fingerprint)).toMatchObject({
      requestId,
      actorId: context.actorId,
      actorType: context.actorType,
      requestFingerprint: fingerprint,
      artifactCount: 12,
    });
  });
});
