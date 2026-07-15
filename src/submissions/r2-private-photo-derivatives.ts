import type { R2BucketLike, R2ObjectLike } from '../admin/media-review/r2-storage';
import type {
  PrivatePhotoDerivativeStore,
  PrivatePhotoDerivativeWriteCommand,
} from './photo-private-processing';

export class PrivatePhotoDerivativeStoreError extends Error {
  constructor(
    readonly code: 'object_conflict' | 'write_failed',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PrivatePhotoDerivativeStoreError';
  }
}

function matches(object: R2ObjectLike, command: PrivatePhotoDerivativeWriteCommand): boolean {
  return (
    object.key === command.key &&
    object.size === command.body.byteLength &&
    object.httpMetadata?.contentType === command.mimeType &&
    object.customMetadata?.contentHash === command.contentHash &&
    object.customMetadata?.sourceContentHash === command.sourceContentHash &&
    object.customMetadata?.mediaAssetId === command.mediaAssetId &&
    object.customMetadata?.variant === command.variant &&
    object.customMetadata?.scope === 'private-review-derivative'
  );
}

export function createR2PrivatePhotoDerivativeStore(
  privateBucket: R2BucketLike,
): PrivatePhotoDerivativeStore {
  return {
    async writePrivateDerivative(command) {
      let existing: R2ObjectLike | null;
      try {
        existing = await privateBucket.head(command.key);
      } catch (error) {
        throw new PrivatePhotoDerivativeStoreError(
          'write_failed',
          'Private photo derivative state could not be inspected.',
          { cause: error },
        );
      }
      if (existing !== null) {
        if (!matches(existing, command)) {
          throw new PrivatePhotoDerivativeStoreError(
            'object_conflict',
            'A private photo derivative key already contains different content.',
          );
        }
        return { state: 'replayed' as const };
      }

      try {
        await privateBucket.put(command.key, command.body, {
          httpMetadata: { contentType: command.mimeType },
          customMetadata: {
            contentHash: command.contentHash,
            sourceContentHash: command.sourceContentHash,
            mediaAssetId: command.mediaAssetId,
            variant: command.variant,
            scope: 'private-review-derivative',
          },
        });
        const written = await privateBucket.head(command.key);
        if (written === null || !matches(written, command)) {
          throw new PrivatePhotoDerivativeStoreError(
            'write_failed',
            'Private photo derivative verification failed after storage.',
          );
        }
      } catch (error) {
        if (error instanceof PrivatePhotoDerivativeStoreError) throw error;
        throw new PrivatePhotoDerivativeStoreError(
          'write_failed',
          'Private photo derivative could not be stored.',
          { cause: error },
        );
      }
      return { state: 'created' as const };
    },

    async deletePrivateDerivative(key) {
      try {
        await privateBucket.delete(key);
      } catch (error) {
        throw new PrivatePhotoDerivativeStoreError(
          'write_failed',
          'Private photo derivative cleanup failed.',
          { cause: error },
        );
      }
    },
  };
}
