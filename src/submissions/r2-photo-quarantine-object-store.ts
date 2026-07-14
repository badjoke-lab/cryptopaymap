import {
  PhotoQuarantineObjectStoreError,
  type PhotoQuarantineObject,
  type PhotoQuarantineObjectStore,
} from './photo-object-validation';

export interface R2PhotoObjectLike {
  key: string;
  size: number;
  httpMetadata?: {
    contentType?: string;
  };
  customMetadata?: Record<string, string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2PhotoBucketLike {
  get(key: string): Promise<R2PhotoObjectLike | null>;
}

export function createR2PhotoQuarantineObjectStore(
  bucket: R2PhotoBucketLike,
): PhotoQuarantineObjectStore {
  return {
    async readPrivateObject(key, maximumBytes) {
      let object: R2PhotoObjectLike | null;
      try {
        object = await bucket.get(key);
      } catch (error) {
        throw new PhotoQuarantineObjectStoreError(
          'read_failed',
          'Private photo object lookup failed.',
          { cause: error },
        );
      }
      if (object === null) return null;
      if (!Number.isInteger(object.size) || object.size <= 0 || object.size > maximumBytes) {
        throw new PhotoQuarantineObjectStoreError(
          'object_too_large',
          'Private photo object size exceeds the bounded read limit.',
        );
      }

      try {
        const body = new Uint8Array(await object.arrayBuffer());
        const result: PhotoQuarantineObject = {
          key: object.key,
          body,
          byteSize: object.size,
          contentType: object.httpMetadata?.contentType ?? null,
          customMetadata: { ...(object.customMetadata ?? {}) },
        };
        return result;
      } catch (error) {
        if (error instanceof PhotoQuarantineObjectStoreError) throw error;
        throw new PhotoQuarantineObjectStoreError(
          'read_failed',
          'Private photo object body could not be read.',
          { cause: error },
        );
      }
    },
  };
}
