import type {
  PrivatePhotoDerivativeStore,
  PrivatePhotoDerivativeWriteCommand,
} from './photo-private-processing';
import { PrivatePhotoDerivativeStoreError } from './r2-private-photo-derivatives';

interface StoredDerivative {
  key: string;
  body: Uint8Array;
  mimeType: 'image/jpeg' | 'image/webp';
  contentHash: string;
  mediaAssetId: string;
  variant: 'display' | 'thumbnail';
  sourceContentHash: string;
}

function clone(command: PrivatePhotoDerivativeWriteCommand): StoredDerivative {
  return {
    ...command,
    body: Uint8Array.from(command.body),
  };
}

function matches(existing: StoredDerivative, command: PrivatePhotoDerivativeWriteCommand): boolean {
  return (
    existing.key === command.key &&
    existing.mimeType === command.mimeType &&
    existing.contentHash === command.contentHash &&
    existing.mediaAssetId === command.mediaAssetId &&
    existing.variant === command.variant &&
    existing.sourceContentHash === command.sourceContentHash &&
    existing.body.byteLength === command.body.byteLength &&
    existing.body.every((byte, index) => byte === command.body[index])
  );
}

export function createInMemoryPrivatePhotoDerivativeStore(): PrivatePhotoDerivativeStore & {
  snapshot(): StoredDerivative[];
  seed(command: PrivatePhotoDerivativeWriteCommand): void;
} {
  const objects = new Map<string, StoredDerivative>();

  return {
    async writePrivateDerivative(command) {
      const existing = objects.get(command.key);
      if (existing !== undefined) {
        if (!matches(existing, command)) {
          throw new PrivatePhotoDerivativeStoreError(
            'object_conflict',
            'A private photo derivative key already contains different content.',
          );
        }
        return { state: 'replayed' as const };
      }
      objects.set(command.key, clone(command));
      return { state: 'created' as const };
    },

    async deletePrivateDerivative(key) {
      objects.delete(key);
    },

    snapshot() {
      return [...objects.values()]
        .sort((left, right) => left.key.localeCompare(right.key))
        .map((object) => ({ ...object, body: Uint8Array.from(object.body) }));
    },

    seed(command) {
      objects.set(command.key, clone(command));
    },
  };
}
