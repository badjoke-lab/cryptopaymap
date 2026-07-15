import { describe, expect, it } from 'vitest';
import type {
  R2BucketLike,
  R2ObjectBodyLike,
  R2ObjectLike,
} from '../src/admin/media-review/r2-storage';
import { createR2PhotoPrivateObjectLifecycleStore } from '../src/submissions/r2-photo-private-lifecycle';

class FakeBucket implements R2BucketLike {
  readonly objects = new Map<string, R2ObjectLike>();

  async head(key: string): Promise<R2ObjectLike | null> {
    return this.objects.get(key) ?? null;
  }

  async get(key: string): Promise<R2ObjectBodyLike | null> {
    const object = this.objects.get(key);
    return object === undefined ? null : { ...object, body: new Uint8Array([1]) };
  }

  async put(
    key: string,
    value: unknown,
    options: {
      httpMetadata: { contentType: string };
      customMetadata: Record<string, string>;
    },
  ): Promise<unknown> {
    const size = value instanceof Uint8Array ? value.byteLength : 1;
    this.objects.set(key, {
      key,
      size,
      httpMetadata: options.httpMetadata,
      customMetadata: options.customMetadata,
    });
    return undefined;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

describe('P5-05F R2 private lifecycle adapter', () => {
  it('routes quarantine and private deletions to separate buckets', async () => {
    const quarantine = new FakeBucket();
    const privateBucket = new FakeBucket();
    quarantine.objects.set('quarantine-key', { key: 'quarantine-key', size: 10 });
    privateBucket.objects.set('private-key', { key: 'private-key', size: 10 });
    const store = createR2PhotoPrivateObjectLifecycleStore(quarantine, privateBucket);

    await expect(store.deletePrivateObject('quarantine', 'quarantine-key')).resolves.toBe(
      'deleted',
    );
    await expect(store.deletePrivateObject('private', 'private-key')).resolves.toBe('deleted');
    await expect(store.deletePrivateObject('private', 'missing-key')).resolves.toBe('missing');
    expect(quarantine.objects.size).toBe(0);
    expect(privateBucket.objects.size).toBe(0);
  });
});
