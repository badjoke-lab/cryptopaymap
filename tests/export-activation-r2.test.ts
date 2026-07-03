import { describe, expect, it } from 'vitest';
import {
  createR2ExportPublicationTarget,
  type ExportPublicationR2BucketLike,
  type ExportPublicationR2ObjectLike,
} from '../src/admin/export-release/activation-r2';
import {
  ExportPublicationError,
  type ActiveExportReleasePointer,
  type ExportPublicationPlan,
} from '../src/admin/export-release/publication-contract';

interface StoredObject extends ExportPublicationR2ObjectLike {
  body: string;
}

class FakeR2Bucket implements ExportPublicationR2BucketLike {
  private readonly objects = new Map<string, StoredObject>();
  private version = 0;

  async head(key: string) {
    const object = this.objects.get(key);
    if (object === undefined) return null;
    const { body: _body, ...metadata } = object;
    return structuredClone(metadata);
  }

  async get(key: string) {
    const object = this.objects.get(key);
    if (object === undefined) return null;
    return {
      ...structuredClone(object),
      json: async <T>() => JSON.parse(object.body) as T,
    };
  }

  async put(
    key: string,
    value: string,
    options: {
      onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string };
      httpMetadata: { contentType: string; cacheControl?: string };
      customMetadata: Record<string, string>;
    },
  ) {
    const existing = this.objects.get(key);
    if (
      options.onlyIf?.etagMatches !== undefined &&
      existing?.etag !== options.onlyIf.etagMatches
    ) {
      return null;
    }
    if (options.onlyIf?.etagDoesNotMatch === '*' && existing !== undefined) {
      return null;
    }
    this.version += 1;
    const object: StoredObject = {
      key,
      size: new TextEncoder().encode(value).byteLength,
      etag: `etag-${this.version}`,
      body: value,
      httpMetadata: structuredClone(options.httpMetadata),
      customMetadata: structuredClone(options.customMetadata),
    };
    this.objects.set(key, object);
    const { body: _body, ...metadata } = object;
    return structuredClone(metadata);
  }

  seed(object: StoredObject) {
    this.objects.set(object.key, structuredClone(object));
  }
}

const digest = 'a'.repeat(64);
const releasePrefix = `export-releases/by-snapshot/${digest}/`;

function pointer(): ActiveExportReleasePointer {
  return {
    formatVersion: '1',
    snapshotDigest: digest,
    datasetVersion: '2026.07.04.1',
    schemaVersion: '1.0.0',
    generatedAt: '2026-07-04T00:00:00.000Z',
    publishedAt: '2026-07-04T02:00:00.000Z',
    releasePrefix,
    files: [
      {
        path: '/version.json',
        objectKey: `${releasePrefix}version.json`,
        mediaType: 'application/json',
        sha256: 'b'.repeat(64),
        canonicalByteSize: 12,
      },
    ],
  };
}

function plan(): ExportPublicationPlan {
  const activePointer = pointer();
  return {
    pointerKey: 'export-releases/active.json',
    releasePrefix,
    pointer: activePointer,
    objects: [{ ...activePointer.files[0]!, body: '{"ok":true}\n' }],
  };
}

describe('conditional R2 export activation', () => {
  it('stages immutable release objects and creates the active pointer', async () => {
    const bucket = new FakeR2Bucket();
    const target = createR2ExportPublicationTarget(bucket);

    await target.stageRelease(plan());
    await target.activateRelease(pointer(), null);

    await expect(bucket.head(`${releasePrefix}version.json`)).resolves.toMatchObject({
      size: 12,
      httpMetadata: { contentType: 'application/json' },
      customMetadata: {
        snapshotDigest: digest,
        artifactPath: '/version.json',
        sha256: 'b'.repeat(64),
      },
    });
    await expect(target.readActivePointer()).resolves.toMatchObject({
      pointer: { snapshotDigest: digest },
      versionToken: expect.stringMatching(/^etag-/),
    });
  });

  it('treats an exact immutable object as idempotent', async () => {
    const bucket = new FakeR2Bucket();
    const target = createR2ExportPublicationTarget(bucket);
    await target.stageRelease(plan());
    const first = await bucket.head(`${releasePrefix}version.json`);
    await target.stageRelease(plan());
    const second = await bucket.head(`${releasePrefix}version.json`);
    expect(second?.etag).toBe(first?.etag);
  });

  it('rejects an immutable object with mismatched metadata', async () => {
    const bucket = new FakeR2Bucket();
    bucket.seed({
      key: `${releasePrefix}version.json`,
      size: 12,
      etag: 'etag-existing',
      body: '{"ok":true}\n',
      httpMetadata: { contentType: 'application/json' },
      customMetadata: {
        snapshotDigest: digest,
        artifactPath: '/version.json',
        sha256: 'c'.repeat(64),
      },
    });
    await expect(createR2ExportPublicationTarget(bucket).stageRelease(plan())).rejects.toBeInstanceOf(
      ExportPublicationError,
    );
  });

  it('uses the pointer ETag as a compare-and-set guard', async () => {
    const bucket = new FakeR2Bucket();
    const target = createR2ExportPublicationTarget(bucket);
    await target.activateRelease(pointer(), null);
    const active = await target.readActivePointer();
    if (active === null) throw new Error('Expected active pointer.');

    await bucket.put('export-releases/active.json', JSON.stringify(pointer()), {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: {
        snapshotDigest: digest,
        datasetVersion: '2026.07.04.1',
        schemaVersion: '1.0.0',
      },
    });

    await expect(target.activateRelease(pointer(), active.versionToken)).rejects.toMatchObject({
      code: 'pointer_conflict',
    });
  });
});
