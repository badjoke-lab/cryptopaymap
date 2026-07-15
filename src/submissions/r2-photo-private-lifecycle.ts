import type { R2BucketLike } from '../admin/media-review/r2-storage';
import type { PhotoPrivateObjectLifecycleStore } from './photo-private-lifecycle';

export class PhotoPrivateLifecycleStoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PhotoPrivateLifecycleStoreError';
  }
}

export function createR2PhotoPrivateObjectLifecycleStore(
  quarantineBucket: R2BucketLike,
  privateBucket: R2BucketLike,
): PhotoPrivateObjectLifecycleStore {
  return {
    async deletePrivateObject(storageScope, storageKey) {
      const bucket = storageScope === 'quarantine' ? quarantineBucket : privateBucket;
      try {
        const existing = await bucket.head(storageKey);
        if (existing === null) return 'missing';
        await bucket.delete(storageKey);
        if ((await bucket.head(storageKey)) !== null) {
          throw new PhotoPrivateLifecycleStoreError(
            'Private photo object remained after cleanup.',
          );
        }
        return 'deleted';
      } catch (error) {
        if (error instanceof PhotoPrivateLifecycleStoreError) throw error;
        throw new PhotoPrivateLifecycleStoreError(
          'Private photo object cleanup failed.',
          { cause: error },
        );
      }
    },
  };
}
