import {
  MediaStorageError,
  type InspectedMediaStorageObject,
  type MediaStorageAdapter,
  type MediaStorageExpectation,
} from './storage-contract';

interface R2HttpMetadataLike {
  contentType?: string;
}

interface R2ObjectLike {
  key: string;
  size: number;
  httpMetadata?: R2HttpMetadataLike;
  customMetadata?: Record<string, string>;
}

interface R2ObjectBodyLike extends R2ObjectLike {
  body: unknown;
}

export interface R2BucketLike {
  head(key: string): Promise<R2ObjectLike | null>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  put(
    key: string,
    value: unknown,
    options: {
      httpMetadata: { contentType: string };
      customMetadata: Record<string, string>;
    },
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
}

function inspectedObject(object: R2ObjectLike): InspectedMediaStorageObject {
  const mimeType = object.httpMetadata?.contentType;
  const contentHash = object.customMetadata?.contentHash;
  if (
    (mimeType !== 'image/jpeg' && mimeType !== 'image/webp') ||
    contentHash === undefined ||
    !/^[a-f0-9]{64}$/.test(contentHash) ||
    object.size <= 0
  ) {
    throw new MediaStorageError('source_mismatch', 'R2 Media metadata is incomplete or invalid.', [
      object.key,
    ]);
  }
  return {
    key: object.key,
    mimeType,
    contentHash,
    byteSize: object.size,
  };
}

export function createR2MediaStorageAdapter(
  privateBucket: R2BucketLike,
  publicBucket: R2BucketLike,
): MediaStorageAdapter {
  return {
    async inspectPrivateObject(key) {
      const object = await privateBucket.head(key);
      return object === null ? null : inspectedObject(object);
    },

    async publishObject(sourceKey: string, destination: MediaStorageExpectation) {
      const source = await privateBucket.get(sourceKey);
      if (source === null) {
        throw new MediaStorageError('source_missing', 'The private R2 object was not found.', [
          sourceKey,
        ]);
      }
      const inspected = inspectedObject(source);
      if (
        inspected.mimeType !== destination.mimeType ||
        inspected.contentHash !== destination.contentHash
      ) {
        throw new MediaStorageError(
          'source_mismatch',
          'The private R2 object changed before publication.',
          [sourceKey],
        );
      }
      await publicBucket.put(destination.key, source.body, {
        httpMetadata: { contentType: destination.mimeType },
        customMetadata: { contentHash: destination.contentHash },
      });
    },

    revokePublicObject(key) {
      return publicBucket.delete(key);
    },
  };
}
