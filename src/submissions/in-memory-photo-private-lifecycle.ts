import type { PhotoPrivateObjectLifecycleStore } from './photo-private-lifecycle';

export interface InMemoryPhotoPrivateObject {
  storageScope: 'quarantine' | 'private';
  storageKey: string;
}

export function createInMemoryPhotoPrivateObjectLifecycleStore(
  initialObjects: readonly InMemoryPhotoPrivateObject[] = [],
): PhotoPrivateObjectLifecycleStore & {
  put(object: InMemoryPhotoPrivateObject): void;
  fail(storageScope: 'quarantine' | 'private', storageKey: string): void;
  list(): InMemoryPhotoPrivateObject[];
} {
  const objects = new Set(
    initialObjects.map((object) => `${object.storageScope}:${object.storageKey}`),
  );
  const failures = new Set<string>();

  return {
    async deletePrivateObject(storageScope, storageKey) {
      const key = `${storageScope}:${storageKey}`;
      if (failures.has(key)) throw new Error('Synthetic private photo cleanup failure.');
      if (!objects.has(key)) return 'missing';
      objects.delete(key);
      return 'deleted';
    },

    put(object) {
      objects.add(`${object.storageScope}:${object.storageKey}`);
    },

    fail(storageScope, storageKey) {
      failures.add(`${storageScope}:${storageKey}`);
    },

    list() {
      return [...objects]
        .sort()
        .map((value) => {
          const separator = value.indexOf(':');
          return {
            storageScope: value.slice(0, separator) as 'quarantine' | 'private',
            storageKey: value.slice(separator + 1),
          };
        });
    },
  };
}
