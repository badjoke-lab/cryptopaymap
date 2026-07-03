import { describe, expect, it, vi } from 'vitest';
import { createExportActivationPostHandler } from '../functions/admin/api/export-activate';
import {
  ExportPublicationError,
  type ExportPublicationReceipt,
} from '../src/admin/export-release/publication-contract';

const identity = {
  actorId: 'cloudflare-access:release-activator',
  actorType: 'human' as const,
  subject: 'release-activator',
  email: 'activator@example.test',
};
const requestId = '10000000-0000-4000-8000-000000000001';
const approvalRequestId = '10000000-0000-4000-8000-000000000002';
const snapshotDigest = 'a'.repeat(64);
const now = new Date('2026-07-04T02:00:00.000Z');

function receipt(): ExportPublicationReceipt {
  return {
    requestId,
    approvalRequestId,
    snapshotDigest,
    datasetVersion: '2026.07.04.1',
    schemaVersion: '1.0.0',
    generatedAt: '2026-07-04T00:00:00.000Z',
    publishedAt: now.toISOString(),
    previousSnapshotDigest: null,
    pointerKey: 'export-releases/active.json',
    releasePrefix: `export-releases/by-snapshot/${snapshotDigest}/`,
    artifactCount: 12,
    state: 'published',
  };
}

function context(
  overrides: {
    identity?: unknown;
    actorIds?: string;
    requestId?: string | null;
    body?: unknown;
  } = {},
) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const idempotencyKey = overrides.requestId === undefined ? requestId : overrides.requestId;
  if (idempotencyKey !== null) headers.set('Idempotency-Key', idempotencyKey);
  return {
    request: new Request('https://example.test/admin/api/export-activate', {
      method: 'POST',
      headers,
      body: JSON.stringify(
        overrides.body ?? {
          approvalRequestId,
          expectedSnapshotDigest: snapshotDigest,
          expectedArtifactCount: 12,
          expectedDatasetVersion: '2026.07.04.1',
          expectedSchemaVersion: '1.0.0',
          expectedGeneratedAt: '2026-07-04T00:00:00.000Z',
          expectedActiveSnapshotDigest: null,
          reasonCode: 'activate_approved_release',
          internalNote: null,
        },
      ),
    }),
    env: {
      CPM_ADMIN_EXPORT_PUBLISH_ACTOR_IDS: overrides.actorIds ?? JSON.stringify([identity.actorId]),
    },
    params: {},
    data: {
      adminIdentity: overrides.identity === undefined ? identity : overrides.identity,
    },
    waitUntil: vi.fn(),
  };
}

describe('controlled export activation endpoint', () => {
  it('activates an exact approved release with actor and request identity', async () => {
    const activate = vi.fn(async () => receipt());
    const response = await createExportActivationPostHandler({ activate, now: () => now })(
      context(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(receipt());
    expect(activate).toHaveBeenCalledWith(
      {
        requestId,
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['export:publish'],
      },
      expect.objectContaining({
        approvalRequestId,
        expectedSnapshotDigest: snapshotDigest,
      }),
      expect.any(Object),
      now,
    );
  });

  it('requires an Idempotency-Key UUID', async () => {
    const activate = vi.fn(async () => receipt());
    const response = await createExportActivationPostHandler({ activate })(
      context({ requestId: null }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'export_activation_invalid_request_id',
    });
    expect(activate).not.toHaveBeenCalled();
  });

  it('requires a separately allowlisted activation identity', async () => {
    const activate = vi.fn(async () => receipt());
    const response = await createExportActivationPostHandler({ activate })(
      context({ actorIds: JSON.stringify(['another-actor']) }),
    );

    expect(response.status).toBe(403);
    expect(activate).not.toHaveBeenCalled();
  });

  it('maps approval, candidate, and pointer changes to a conflict', async () => {
    const activate = vi.fn(async () => {
      throw new ExportPublicationError('pointer_conflict', 'The active release changed.', [
        'expectedActiveSnapshotDigest',
      ]);
    });
    const response = await createExportActivationPostHandler({ activate })(context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'export_activation_conflict',
      issues: ['expectedActiveSnapshotDigest'],
    });
  });

  it('does not fabricate success after a target failure', async () => {
    const activate = vi.fn(async () => {
      throw new ExportPublicationError('target_failure', 'Target unavailable.');
    });
    const response = await createExportActivationPostHandler({ activate })(context());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'export_activation_unavailable',
    });
  });
});
