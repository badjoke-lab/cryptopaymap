import { describe, expect, it } from 'vitest';
import type {
  R2BucketLike,
  R2ObjectBodyLike,
  R2ObjectLike,
} from '../src/admin/media-review/r2-storage';
import { createR2PrivatePhotoDerivativeStore } from '../src/submissions/r2-private-photo-derivatives';

class MemoryBucket implements R2BucketLike {
  readonly objects = new Map<
    string,
    {
      body: Uint8Array;
      httpMetadata: { contentType: string };
      customMetadata: Record<string, string>;
    }
  >();

  async head(key: string): Promise<R2ObjectLike | null> {
    const object = this.objects.get(key);
    if (object === undefined) return null;
    return {
      key,
      size: object.body.byteLength,
      httpMetadata: { ...object.httpMetadata },
      customMetadata: { ...object.customMetadata },
    };
  }

  async get(key: string): Promise<R2ObjectBodyLike | null> {
    const object = this.objects.get(key);
    if (object === undefined) return null;
    return {
      key,
      size: object.body.byteLength,
      body: Uint8Array.from(object.body),
      httpMetadata: { ...object.httpMetadata },
      customMetadata: { ...object.customMetadata },
    };
  }

  async put(
    key: string,
    value: unknown,
    options: {
      httpMetadata: { contentType: string };
      customMetadata: Record<string, string>;
    },
  ) {
    if (!(value instanceof Uint8Array)) throw new Error('expected bytes');
    this.objects.set(key, {
      body: Uint8Array.from(value),
      httpMetadata: { ...options.httpMetadata },
      customMetadata: { ...options.customMetadata },
    });
  }

  async delete(key: string) {
    this.objects.delete(key);
  }
}

const command = {
  key: `media/private/10000000-0000-4000-8000-000000000001/${'a'.repeat(64)}.webp`,
  body: Uint8Array.from([1, 2, 3]),
  mimeType: 'image/webp' as const,
  contentHash: 'a'.repeat(64),
  mediaAssetId: '10000000-0000-4000-8000-000000000001',
  variant: 'display' as const,
  sourceContentHash: 'b'.repeat(64),
};

describe('P5-05E R2-compatible private derivative storage', () => {
  it('creates, verifies, replays, and deletes exact private derivatives', async () => {
    const bucket = new MemoryBucket();
    const store = createR2PrivatePhotoDerivativeStore(bucket);

    await expect(store.writePrivateDerivative(command)).resolves.toEqual({ state: 'created' });
    await expect(store.writePrivateDerivative(command)).resolves.toEqual({ state: 'replayed' });
    expect(await bucket.head(command.key)).toEqual(
      expect.objectContaining({
        size: 3,
        httpMetadata: { contentType: 'image/webp' },
        customMetadata: expect.objectContaining({
          contentHash: command.contentHash,
          sourceContentHash: command.sourceContentHash,
          mediaAssetId: command.mediaAssetId,
          variant: 'display',
          scope: 'private-review-derivative',
        }),
      }),
    );

    await store.deletePrivateDerivative(command.key);
    await expect(bucket.head(command.key)).resolves.toBeNull();
  });

  it('rejects a pre-existing key with different content or metadata', async () => {
    const bucket = new MemoryBucket();
    const store = createR2PrivatePhotoDerivativeStore(bucket);
    await store.writePrivateDerivative(command);

    await expect(
      store.writePrivateDerivative({
        ...command,
        body: Uint8Array.from([9, 9, 9]),
        contentHash: 'c'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'object_conflict' });
  });
});
