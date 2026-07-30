import type { R2BucketLike, R2ObjectBodyLike, R2ObjectLike } from './r2-storage';

export type StagingMediaDurableObjectId = object;

export interface StagingMediaDurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

export interface StagingMediaDurableObjectNamespace {
  idFromName(name: string): StagingMediaDurableObjectId;
  get(id: StagingMediaDurableObjectId): StagingMediaDurableObjectStub;
}

const durableObjectName = 'ops-p6-001h-configured-media';

function internalUrl(scope: 'private' | 'public', key: string): string {
  const url = new URL('https://staging-media.internal/staging-media/object');
  url.searchParams.set('scope', scope);
  url.searchParams.set('key', key);
  return url.toString();
}

function metadata(response: Response, key: string): R2ObjectLike {
  const size = Number(response.headers.get('content-length'));
  const contentType = response.headers.get('content-type')?.split(';')[0];
  const contentHash = response.headers.get('x-cpm-content-hash');
  if (!Number.isInteger(size) || size <= 0 || contentType === undefined || contentHash === null) {
    throw new Error('The staging Media object metadata is invalid.');
  }
  return {
    key,
    size,
    httpMetadata: { contentType },
    customMetadata: { contentHash },
  };
}

function createBucket(
  namespace: StagingMediaDurableObjectNamespace,
  scope: 'private' | 'public',
): R2BucketLike {
  const stub = namespace.get(namespace.idFromName(durableObjectName));
  return {
    async head(key) {
      const response = await stub.fetch(new Request(internalUrl(scope, key), { method: 'HEAD' }));
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('The staging Media object could not be inspected.');
      return metadata(response, key);
    },
    async get(key) {
      const response = await stub.fetch(new Request(internalUrl(scope, key), { method: 'GET' }));
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('The staging Media object could not be read.');
      return {
        ...metadata(response, key),
        body: response.body ?? (await response.arrayBuffer()),
      } satisfies R2ObjectBodyLike;
    },
    async put(key, value, options) {
      const response = await stub.fetch(
        new Request(internalUrl(scope, key), {
          method: 'PUT',
          headers: {
            'Content-Type': options.httpMetadata.contentType,
            'X-CPM-Content-Hash': options.customMetadata.contentHash,
          },
          body: value as BodyInit,
        }),
      );
      if (!response.ok) throw new Error('The staging Media object could not be written.');
    },
    async delete(key) {
      const response = await stub.fetch(new Request(internalUrl(scope, key), { method: 'DELETE' }));
      if (!response.ok) throw new Error('The staging Media object could not be deleted.');
    },
  };
}

export function createStagingDurableObjectMediaBuckets(
  namespace: StagingMediaDurableObjectNamespace,
): { privateBucket: R2BucketLike; publicBucket: R2BucketLike } {
  return {
    privateBucket: createBucket(namespace, 'private'),
    publicBucket: createBucket(namespace, 'public'),
  };
}
