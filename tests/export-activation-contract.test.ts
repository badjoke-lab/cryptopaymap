import { describe, expect, it } from 'vitest';
import { InMemoryExportPublicationTarget } from '../src/admin/export-release/in-memory-activation';
import {
  createExportPublicationService,
  ExportPublicationError,
  type ActiveExportReleasePointer,
  type ApprovedExportRelease,
  type ExportPublicationInput,
  type ExportPublicationMutationContext,
  type ExportPublicationPlan,
} from '../src/admin/export-release/publication-contract';

const requestId = '10000000-0000-4000-8000-000000000001';
const approvalRequestId = '10000000-0000-4000-8000-000000000002';
const snapshotDigest = 'a'.repeat(64);
const generatedAt = '2026-07-04T00:00:00.000Z';
const publishedAt = '2026-07-04T02:00:00.000Z';

const context: ExportPublicationMutationContext = {
  requestId,
  actorId: 'cloudflare-access:export-publisher',
  actorType: 'human',
  capabilities: ['export:publish'],
};

const input: ExportPublicationInput = {
  approvalRequestId,
  expectedSnapshotDigest: snapshotDigest,
  expectedArtifactCount: 2,
  expectedDatasetVersion: '2026.07.04.1',
  expectedSchemaVersion: '1.0.0',
  expectedGeneratedAt: generatedAt,
  expectedActiveSnapshotDigest: null,
  publishedAt,
  reasonCode: 'activate_approved_release',
  internalNote: null,
};

const approval: ApprovedExportRelease = {
  requestId: approvalRequestId,
  action: 'approve',
  releaseStatus: 'approved',
  snapshotDigest,
  artifactCount: 2,
  datasetVersion: input.expectedDatasetVersion,
  schemaVersion: input.expectedSchemaVersion,
  generatedAt,
  decidedAt: '2026-07-04T01:00:00.000Z',
};

function pointer(digest = snapshotDigest): ActiveExportReleasePointer {
  const releasePrefix = `export-releases/by-snapshot/${digest}/`;
  return {
    formatVersion: '1',
    snapshotDigest: digest,
    datasetVersion: input.expectedDatasetVersion,
    schemaVersion: input.expectedSchemaVersion,
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
      {
        path: '/data/places.geojson',
        objectKey: `${releasePrefix}data/places.geojson`,
        mediaType: 'application/geo+json',
        sha256: 'c'.repeat(64),
        canonicalByteSize: 15,
      },
    ],
  };
}

function plan(): ExportPublicationPlan {
  const activePointer = pointer();
  return {
    pointerKey: 'export-releases/active.json',
    releasePrefix: activePointer.releasePrefix,
    pointer: activePointer,
    objects: [
      { ...activePointer.files[0]!, body: '{"ok":true}\n' },
      { ...activePointer.files[1]!, body: '{"type":"x"}\n' },
    ],
  };
}

function approvals(value: ApprovedExportRelease | null = approval) {
  return { loadApprovedRelease: async () => value };
}

describe('controlled export activation contract', () => {
  it('stages immutable artifacts before atomically activating the pointer', async () => {
    const target = new InMemoryExportPublicationTarget();
    const receipt = await createExportPublicationService(
      approvals(),
      target,
      async () => plan(),
    ).publish(context, input, {});

    expect(receipt).toMatchObject({
      approvalRequestId,
      snapshotDigest,
      previousSnapshotDigest: null,
      artifactCount: 2,
      state: 'published',
    });
    expect(target.events).toEqual([
      'read_pointer',
      `stage:${plan().objects[0]?.objectKey}`,
      `stage:${plan().objects[1]?.objectKey}`,
      'activate_pointer',
    ]);
    expect(target.snapshot().pointer?.pointer.snapshotDigest).toBe(snapshotDigest);
  });

  it('replays an already active exact snapshot without staging again', async () => {
    const target = new InMemoryExportPublicationTarget({ activePointer: pointer() });
    const receipt = await createExportPublicationService(
      approvals(),
      target,
      async () => plan(),
    ).publish(context, input, {});

    expect(receipt.state).toBe('replayed');
    expect(target.events).toEqual(['read_pointer']);
  });

  it('rejects publication when the active pointer changed', async () => {
    const currentDigest = 'd'.repeat(64);
    const target = new InMemoryExportPublicationTarget({ activePointer: pointer(currentDigest) });
    await expect(
      createExportPublicationService(approvals(), target, async () => plan()).publish(
        context,
        input,
        {},
      ),
    ).rejects.toMatchObject({
      code: 'pointer_conflict',
      issues: ['expectedActiveSnapshotDigest'],
    });
    expect(target.events).toEqual(['read_pointer']);
  });

  it('requires an exact durable approval before reading the active pointer', async () => {
    const target = new InMemoryExportPublicationTarget();
    await expect(
      createExportPublicationService(approvals(null), target, async () => plan()).publish(
        context,
        input,
        {},
      ),
    ).rejects.toMatchObject({ code: 'approval_not_found' });
    expect(target.events).toEqual([]);
  });

  it('rejects a changed approved snapshot or private candidate', async () => {
    const target = new InMemoryExportPublicationTarget();
    await expect(
      createExportPublicationService(
        approvals({ ...approval, snapshotDigest: 'e'.repeat(64) }),
        target,
        async () => plan(),
      ).publish(context, input, {}),
    ).rejects.toMatchObject({ code: 'approval_mismatch' });
    await expect(
      createExportPublicationService(approvals(), target, async () => ({
        ...plan(),
        pointer: pointer('f'.repeat(64)),
      })).publish(context, input, {}),
    ).rejects.toMatchObject({ code: 'candidate_mismatch' });
  });

  it('does not activate the pointer when staging fails', async () => {
    const failedKey = plan().objects[1]!.objectKey;
    const target = new InMemoryExportPublicationTarget({ failObjectKey: failedKey });
    await expect(
      createExportPublicationService(approvals(), target, async () => plan()).publish(
        context,
        input,
        {},
      ),
    ).rejects.toBeInstanceOf(ExportPublicationError);
    expect(target.events).not.toContain('activate_pointer');
    expect(target.snapshot().pointer).toBeNull();
  });

  it('requires the isolated export publication capability', async () => {
    const target = new InMemoryExportPublicationTarget();
    await expect(
      createExportPublicationService(approvals(), target, async () => plan()).publish(
        { ...context, capabilities: [] } as ExportPublicationMutationContext,
        input,
        {},
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(target.events).toEqual([]);
  });
});
