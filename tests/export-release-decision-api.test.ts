import { describe, expect, it, vi } from 'vitest';
import { createExportDecisionPostHandler } from '../functions/admin/api/export-decision';
import {
  ExportReleaseDecisionError,
  type ExportReleaseDecisionReceipt,
} from '../src/admin/export-release/decision';

const identity = {
  actorId: 'cloudflare-access:export-reviewer',
  actorType: 'human' as const,
  subject: 'export-reviewer',
  email: 'reviewer@example.test',
};
const requestId = '10000000-0000-4000-8000-000000000001';
const digest = 'a'.repeat(64);
const now = new Date('2026-07-04T01:00:00.000Z');

function receipt(): ExportReleaseDecisionReceipt {
  return {
    requestId,
    action: 'approve',
    releaseStatus: 'approved',
    snapshotDigest: digest,
    artifactCount: 12,
    datasetVersion: '2026.07.04.1',
    schemaVersion: '1.0.0',
    generatedAt: '2026-07-04T00:00:00.000Z',
    decidedAt: now.toISOString(),
    state: 'committed',
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
    request: new Request('https://example.test/admin/api/export-decision', {
      method: 'POST',
      headers,
      body: JSON.stringify(
        overrides.body ?? {
          action: 'approve',
          expectedSnapshotDigest: digest,
          expectedArtifactCount: 12,
          expectedDatasetVersion: '2026.07.04.1',
          expectedSchemaVersion: '1.0.0',
          expectedGeneratedAt: '2026-07-04T00:00:00.000Z',
          reasonCode: 'release_approved',
          publicSummary: 'Validated public export snapshot approved.',
          internalNote: null,
        },
      ),
    }),
    env: {
      CPM_ADMIN_EXPORT_RELEASE_ACTOR_IDS:
        overrides.actorIds ?? JSON.stringify([identity.actorId]),
    },
    params: {},
    data: {
      adminIdentity: overrides.identity === undefined ? identity : overrides.identity,
    },
    waitUntil: vi.fn(),
  };
}

describe('protected export release decision endpoint', () => {
  it('writes an exact release decision with actor and request identity', async () => {
    const writeDecision = vi.fn(async () => receipt());
    const response = await createExportDecisionPostHandler({
      writeDecision,
      now: () => now,
    })(context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(receipt());
    expect(writeDecision).toHaveBeenCalledWith(
      {
        requestId,
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['export:release'],
      },
      expect.objectContaining({ action: 'approve', expectedSnapshotDigest: digest }),
      expect.any(Object),
      now,
    );
  });

  it('requires a valid Idempotency-Key', async () => {
    const writeDecision = vi.fn(async () => receipt());
    const response = await createExportDecisionPostHandler({ writeDecision })(
      context({ requestId: null }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'export_decision_invalid_request_id',
    });
    expect(writeDecision).not.toHaveBeenCalled();
  });

  it('maps blocked candidates without exposing private artifact content', async () => {
    const writeDecision = vi.fn(async () => {
      throw new ExportReleaseDecisionError('validation_failed', 'Candidate blocked.', [
        '/data/places.json: required public artifact is missing',
      ]);
    });
    const response = await createExportDecisionPostHandler({ writeDecision })(context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'export_candidate_blocked',
      issues: ['/data/places.json: required public artifact is missing'],
    });
  });

  it('maps changed snapshots to a conflict', async () => {
    const writeDecision = vi.fn(async () => {
      throw new ExportReleaseDecisionError('conflict', 'Snapshot changed.', [
        'snapshotDigest',
      ]);
    });
    const response = await createExportDecisionPostHandler({ writeDecision })(context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'export_decision_conflict',
      issues: ['snapshotDigest'],
    });
  });
});
