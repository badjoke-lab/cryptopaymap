import { describe, expect, it, vi } from 'vitest';
import type {
  MediaReviewDecisionCommand,
  MediaReviewDecisionReceipt,
} from '../src/admin/media-review/decision';
import { InMemoryMediaStorage } from '../src/admin/media-review/in-memory-storage';
import { createStorageAwareMediaReviewBackend } from '../src/admin/media-review/storage-backend';
import { MediaStorageError } from '../src/admin/media-review/storage-contract';
import {
  buildMediaStoragePlan,
  privateMediaDerivativeKey,
  publicMediaDerivativeKey,
} from '../src/admin/media-review/storage-plan';

const requestId = '10000000-0000-4000-8000-000000000001';
const mediaAssetId = '20000000-0000-4000-8000-000000000001';
const entityId = '30000000-0000-4000-8000-000000000001';
const displayFileId = '40000000-0000-4000-8000-000000000001';
const thumbnailFileId = '40000000-0000-4000-8000-000000000002';
const hash = '0'.repeat(64);
const decidedAt = new Date('2026-07-03T01:00:00.000Z');

function privateFile(id: string, variant: 'display' | 'thumbnail') {
  const file = {
    id,
    variant,
    storageScope: 'private' as const,
    storageKey: '',
    mimeType: 'image/webp',
    contentHash: hash,
    width: variant === 'display' ? 960 : 160,
    height: variant === 'display' ? 540 : 160,
  };
  file.storageKey = privateMediaDerivativeKey(mediaAssetId, file);
  return file;
}

function approvalCommand(): MediaReviewDecisionCommand {
  const display = privateFile(displayFileId, 'display');
  const thumbnail = privateFile(thumbnailFileId, 'thumbnail');
  return {
    requestId,
    actorId: 'cloudflare-access:reviewer',
    actorType: 'human',
    mediaAssetId,
    expectedMediaUpdatedAt: new Date('2026-07-03T00:00:00.000Z'),
    expectedReviewStatus: 'pending',
    expectedPurpose: 'public_gallery_candidate',
    expectedRole: 'cover',
    expectedRightsStatus: 'unknown',
    expectedVisibility: 'private',
    expectedSubject: { type: 'entity', id: entityId },
    expectedFiles: [display, thumbnail],
    decidedAt,
    action: 'approve_public',
    targetMatch: 'confirmed',
    privacyReview: 'cleared',
    rightsDecision: {
      status: 'submitted_with_permission',
      licenseId: null,
      rightsHolder: 'Example Merchant',
      consentReference: null,
      attribution: null,
      licenseAttributionRequired: null,
    },
    altText: 'Exterior of Example Merchant.',
    displayOrder: 0,
    publicDisplayFileId: displayFileId,
    publicThumbnailFileId: thumbnailFileId,
    reasonCode: 'approved_for_public_gallery',
    publicSummary: 'Approved for the public gallery.',
    internalNote: null,
    requestFingerprint: 'approval-fingerprint',
  };
}

function approvalReceipt(): MediaReviewDecisionReceipt {
  return {
    requestId,
    mediaAssetId,
    action: 'approve_public',
    reviewStatus: 'accepted',
    purpose: 'public_gallery',
    rightsStatus: 'submitted_with_permission',
    visibility: 'public',
    decidedAt: decidedAt.toISOString(),
    publicFileIds: [displayFileId, thumbnailFileId],
    state: 'committed',
  };
}

function privateObjects(command: MediaReviewDecisionCommand) {
  return command.expectedFiles.map((file) => ({
    key: file.storageKey,
    mimeType: file.mimeType as 'image/webp',
    contentHash: file.contentHash,
    byteSize: file.variant === 'display' ? 120_000 : 12_000,
  }));
}

function restrictionCommand(): MediaReviewDecisionCommand {
  const approved = approvalCommand();
  return {
    ...approved,
    requestId: '10000000-0000-4000-8000-000000000002',
    expectedReviewStatus: 'accepted',
    expectedPurpose: 'public_gallery',
    expectedRightsStatus: 'submitted_with_permission',
    expectedVisibility: 'public',
    expectedFiles: approved.expectedFiles.map((file) => ({
      ...file,
      storageScope: 'public' as const,
      storageKey: publicMediaDerivativeKey(mediaAssetId, file),
    })),
    action: 'restrict',
    privacyReview: 'blocked',
    rightsDecision: null,
    altText: null,
    displayOrder: null,
    publicDisplayFileId: null,
    publicThumbnailFileId: null,
    reasonCode: 'urgent_privacy_restriction',
    publicSummary: 'Media access was restricted.',
    requestFingerprint: 'restriction-fingerprint',
  };
}

describe('Media storage operation boundary', () => {
  it('builds deterministic private-to-public transitions', () => {
    const command = approvalCommand();
    const plan = buildMediaStoragePlan(command);

    expect(plan.operations).toHaveLength(2);
    expect(plan.operations[0]?.type).toBe('publish');
    expect(plan.transitions).toEqual(
      command.expectedFiles.map((file) => ({
        fileId: file.id,
        fromScope: 'private',
        fromKey: privateMediaDerivativeKey(mediaAssetId, file),
        toScope: 'public',
        toKey: publicMediaDerivativeKey(mediaAssetId, file),
      })),
    );
  });

  it('publishes verified derivatives before committing the decision', async () => {
    const command = approvalCommand();
    const storage = new InMemoryMediaStorage({ privateObjects: privateObjects(command) });
    const commitDecision = vi.fn(async (prepared: MediaReviewDecisionCommand) => {
      expect('fileTransitions' in prepared).toBe(true);
      return approvalReceipt();
    });

    const result = await createStorageAwareMediaReviewBackend(
      { commitDecision },
      storage,
    ).commitDecision(command);

    expect(result.visibility).toBe('public');
    expect(commitDecision).toHaveBeenCalledTimes(1);
    expect(storage.snapshot().publicObjects.map((object) => object.key)).toEqual(
      command.expectedFiles.map((file) => publicMediaDerivativeKey(mediaAssetId, file)),
    );
  });

  it('removes published objects when the database decision fails', async () => {
    const command = approvalCommand();
    const storage = new InMemoryMediaStorage({ privateObjects: privateObjects(command) });
    const backend = createStorageAwareMediaReviewBackend(
      {
        commitDecision: vi.fn(async () => {
          throw new Error('database conflict');
        }),
      },
      storage,
    );

    await expect(backend.commitDecision(command)).rejects.toThrow('database conflict');
    expect(storage.snapshot().publicObjects).toEqual([]);
  });

  it('rejects a private object whose hash changed', async () => {
    const command = approvalCommand();
    const objects = privateObjects(command);
    const first = objects[0];
    if (first === undefined) throw new Error('Expected display object fixture.');
    first.contentHash = '1'.repeat(64);
    const storage = new InMemoryMediaStorage({ privateObjects: objects });
    const backend = createStorageAwareMediaReviewBackend(
      { commitDecision: vi.fn(async () => approvalReceipt()) },
      storage,
    );

    await expect(backend.commitDecision(command)).rejects.toMatchObject({
      code: 'source_mismatch',
    });
  });

  it('commits restriction before revoking public objects', async () => {
    const command = restrictionCommand();
    const publicObjects = command.expectedFiles.map((file) => ({
      key: file.storageKey,
      mimeType: file.mimeType as 'image/webp',
      contentHash: file.contentHash,
      byteSize: 12_000,
    }));
    const storage = new InMemoryMediaStorage({ publicObjects });
    const commitDecision = vi.fn(async () => ({
      ...approvalReceipt(),
      requestId: command.requestId,
      action: 'restrict' as const,
      visibility: 'restricted' as const,
      publicFileIds: command.expectedFiles.map((file) => file.id),
    }));

    const result = await createStorageAwareMediaReviewBackend(
      { commitDecision },
      storage,
    ).commitDecision(command);

    expect(result.visibility).toBe('restricted');
    expect(storage.snapshot().publicObjects).toEqual([]);
  });

  it('reports revocation failure after the safe database decision', async () => {
    const command = restrictionCommand();
    const failedKey = command.expectedFiles[0]?.storageKey;
    if (failedKey === undefined) throw new Error('Expected public object fixture.');
    const storage = new InMemoryMediaStorage({
      publicObjects: command.expectedFiles.map((file) => ({
        key: file.storageKey,
        mimeType: file.mimeType as 'image/webp',
        contentHash: file.contentHash,
        byteSize: 12_000,
      })),
      failRevokeKeys: new Set([failedKey]),
    });
    const commitDecision = vi.fn(async () => ({
      ...approvalReceipt(),
      requestId: command.requestId,
      action: 'restrict' as const,
      visibility: 'restricted' as const,
    }));

    await expect(
      createStorageAwareMediaReviewBackend({ commitDecision }, storage).commitDecision(command),
    ).rejects.toBeInstanceOf(MediaStorageError);
    expect(commitDecision).toHaveBeenCalledTimes(1);
  });
});
