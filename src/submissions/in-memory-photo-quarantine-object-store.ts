import {
  PhotoQuarantineObjectStoreError,
  type PhotoQuarantineObject,
  type PhotoQuarantineObjectStore,
} from './photo-object-validation';

export function createInMemoryPhotoQuarantineObjectStore(): PhotoQuarantineObjectStore & {
  put(object: PhotoQuarantineObject): void;
  delete(key: string): void;
  listKeys(): string[];
} {
  const objects = new Map<string, PhotoQuarantineObject>();

  return {
    async readPrivateObject(key, maximumBytes) {
      const object = objects.get(key);
      if (object === undefined) return null;
      if (object.byteSize > maximumBytes) {
        throw new PhotoQuarantineObjectStoreError(
          'object_too_large',
          'Private photo object size exceeds the bounded read limit.',
        );
      }
      return {
        ...object,
        body: new Uint8Array(object.body),
        customMetadata: { ...object.customMetadata },
      };
    },

    put(object) {
      objects.set(object.key, {
        ...object,
        body: new Uint8Array(object.body),
        customMetadata: { ...object.customMetadata },
      });
    },

    delete(key) {
      objects.delete(key);
    },

    listKeys() {
      return [...objects.keys()].sort();
    },
  };
}
