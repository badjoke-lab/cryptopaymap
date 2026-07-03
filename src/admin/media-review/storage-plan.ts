import type { MediaReviewDecisionCommand, MediaReviewFileSnapshot } from './decision';
import {
  MediaStorageError,
  mediaStoragePlanSchema,
  type MediaFileTransition,
  type MediaStorageOperation,
  type MediaStoragePlan,
} from './storage-contract';

function extensionForMimeType(mimeType: string): 'jpg' | 'webp' {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  throw new MediaStorageError('invalid_plan', 'Public derivatives must use JPEG or WebP.');
}

export function privateMediaDerivativeKey(
  mediaAssetId: string,
  file: Pick<MediaReviewFileSnapshot, 'id' | 'contentHash' | 'mimeType'>,
): string {
  return `media/private/${mediaAssetId}/${file.id}-${file.contentHash}.${extensionForMimeType(file.mimeType)}`;
}

export function publicMediaDerivativeKey(
  mediaAssetId: string,
  file: Pick<MediaReviewFileSnapshot, 'id' | 'contentHash' | 'mimeType'>,
): string {
  return `media/public/${mediaAssetId}/${file.id}-${file.contentHash}.${extensionForMimeType(file.mimeType)}`;
}

function selectedPublicFiles(command: MediaReviewDecisionCommand): MediaReviewFileSnapshot[] {
  const selectedIds = [command.publicDisplayFileId, command.publicThumbnailFileId].filter(
    (value): value is string => value !== null,
  );
  return selectedIds.map((fileId) => {
    const file = command.expectedFiles.find((candidate) => candidate.id === fileId);
    if (file === undefined) {
      throw new MediaStorageError(
        'invalid_plan',
        'A selected public derivative is missing from the reviewed file set.',
      );
    }
    return file;
  });
}

function publishOperation(
  command: MediaReviewDecisionCommand,
  file: MediaReviewFileSnapshot,
): { operation: MediaStorageOperation; transition: MediaFileTransition } {
  const privateKey = privateMediaDerivativeKey(command.mediaAssetId, file);
  const publicKey = publicMediaDerivativeKey(command.mediaAssetId, file);
  if (file.storageScope !== 'private' || file.storageKey !== privateKey) {
    throw new MediaStorageError(
      'invalid_plan',
      'Public approval requires a canonical private derivative source.',
      [`File ${file.id} must use ${privateKey}.`],
    );
  }
  return {
    operation: {
      type: 'publish',
      fileId: file.id,
      source: {
        key: privateKey,
        mimeType: file.mimeType as 'image/jpeg' | 'image/webp',
        contentHash: file.contentHash,
      },
      destination: {
        key: publicKey,
        mimeType: file.mimeType as 'image/jpeg' | 'image/webp',
        contentHash: file.contentHash,
      },
    },
    transition: {
      fileId: file.id,
      fromScope: 'private',
      fromKey: privateKey,
      toScope: 'public',
      toKey: publicKey,
    },
  };
}

function revokeOperation(
  command: MediaReviewDecisionCommand,
  file: MediaReviewFileSnapshot,
): { operation: MediaStorageOperation; transition: MediaFileTransition } {
  const privateKey = privateMediaDerivativeKey(command.mediaAssetId, file);
  const publicKey = publicMediaDerivativeKey(command.mediaAssetId, file);
  if (file.storageScope !== 'public' || file.storageKey !== publicKey) {
    throw new MediaStorageError(
      'invalid_plan',
      'Restriction and supersession require canonical public derivative state.',
      [`File ${file.id} must use ${publicKey}.`],
    );
  }
  return {
    operation: {
      type: 'revoke',
      fileId: file.id,
      source: {
        key: publicKey,
        mimeType: file.mimeType as 'image/jpeg' | 'image/webp',
        contentHash: file.contentHash,
      },
      destination: {
        key: privateKey,
        mimeType: file.mimeType as 'image/jpeg' | 'image/webp',
        contentHash: file.contentHash,
      },
    },
    transition: {
      fileId: file.id,
      fromScope: 'public',
      fromKey: publicKey,
      toScope: 'private',
      toKey: privateKey,
    },
  };
}

export function buildMediaStoragePlan(command: MediaReviewDecisionCommand): MediaStoragePlan {
  const pairs: Array<{ operation: MediaStorageOperation; transition: MediaFileTransition }> = [];
  if (command.action === 'approve_public') {
    for (const file of selectedPublicFiles(command)) pairs.push(publishOperation(command, file));
  } else if (command.action === 'restrict' || command.action === 'supersede') {
    for (const file of command.expectedFiles.filter((candidate) => candidate.storageScope === 'public')) {
      pairs.push(revokeOperation(command, file));
    }
  }

  const result = mediaStoragePlanSchema.safeParse({
    mediaAssetId: command.mediaAssetId,
    action: command.action,
    operations: pairs.map((pair) => pair.operation),
    transitions: pairs.map((pair) => pair.transition),
  });
  if (!result.success) {
    throw new MediaStorageError(
      'invalid_plan',
      'The Media storage plan is invalid.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}
