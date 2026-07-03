import { describe, expect, it } from 'vitest';
import {
  createR2MediaStorageAdapter,
  type R2BucketLike,
} from '../src/admin/media-review/r2-storage';
import { MediaStorageError } from '../src/admin/media-review/storage-contract';

interface StoredObject {
  key: string;
  size: number;
  body: unknown;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

class FakeR2Bucket implements R2BucketLike {
  private readonly objects = new Map<string, StoredObject>();

  seed(object: StoredObject) {
    this.objects.set(object.key, structuredClone(object));
  }

  async head(key: string) {
    const object = this.objects.get(key);
    if (object === undefined) return null;
    const { body: _body, ...metadata } = object;
    return structuredClone(metadata);
  }

  async get(key: string) {
    const object = this.objects.get(key);
    return object === undefined ? null : structuredClone(object);
  }

  async put(
    key: string,
    value: unknown,
    options: {
      httpMetadata: { contentType: string };
      customMetadata: Record<string, string>;
    },
  ) {
    const size = value instanceof Uint8Array ? value.byteLength : 1;
    this.objects.set(key, {
      key,
      size,
      body: structuredClone(value),
      httpMetadata: structuredClone(options.httpMetadata),
      customMetadata: structuredClone(options.customMetadata),
    });
    return {};
  }

  async delete(key: string) {
    this.objects.delete(key);
  }
}

const hash = 'a'.repeat(64);
const privateKey = `media/private/asset/file-${hash}.webp`;
const publicKey = `media/public/asset/file-${hash}.webp`;

describe('Cloudflare R2 Media storage adapter', () => {
  it('inspects, publishes, and revokes exact Media objects', async () => {
    const privateBucket = new FakeR2Bucket();
    const publicBucket = new FakeR2Bucket();
    privateBucket.seed({
      key: privateKey,
      size: 3,
      body: new Uint8Array([1, 2, 3]),
      httpMetadata: { contentType: 'image/webp' },
      customMetadata: { contentHash: hash },
    });
    const adapter = createR2MediaStorageAdapter(privateBucket, publicBucket);

    await expect(adapter.inspectPrivateObject(privateKey)).resolves.toEqual({
      key: privateKey,
      mimeType: 'image/webp',
      contentHash: hash,
      byteSize: 3,
    });

    await adapter.publishObject(privateKey, {
      key: publicKey,
      mimeType: 'image/webp',
      contentHash: hash,
    });
    await expect(publicBucket.head(publicKey)).resolves.toMatchObject({
      key: publicKey,
      size: 3,
      httpMetadata: { contentType: 'image/webp' },
      customMetadata: { contentHash: hash },
    });

    await adapter.revokePublicObject(publicKey);
    await expect(publicBucket.head(publicKey)).resolves.toBeNull();
  });

  it('rejects private objects with incomplete publication metadata', async () => {
    const privateBucket = new FakeR2Bucket();
    const publicBucket = new FakeR2Bucket();
    privateBucket.seed({
      key: privateKey,
      size: 3,
      body: new Uint8Array([1, 2, 3]),
      httpMetadata: { contentType: 'image/png' },
      customMetadata: { contentHash: hash },
    });
    const adapter = createR2MediaStorageAdapter(privateBucket, publicBucket);

    await expect(adapter.inspectPrivateObject(privateKey)).rejects.toBeInstanceOf(
      MediaStorageError,
    );
  });
});
