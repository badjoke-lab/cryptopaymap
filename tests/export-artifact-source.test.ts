import { describe, expect, it } from 'vitest';
import {
  createR2ExportArtifactSource,
  ExportArtifactSourceError,
  type ExportCandidateR2BucketLike,
} from '../src/admin/export-release/artifact-source';

class FakeBucket implements ExportCandidateR2BucketLike {
  constructor(
    private readonly value: unknown | null,
    private readonly invalidJson = false,
  ) {}

  async get() {
    if (this.value === null) return null;
    return {
      json: async <T>() => {
        if (this.invalidJson) throw new Error('invalid json');
        return structuredClone(this.value) as T;
      },
    };
  }
}

describe('private export candidate source', () => {
  it('loads a server-controlled artifact bundle', async () => {
    const artifacts = {
      '/version.json': {
        schemaVersion: '1.0.0',
        generatedAt: '2026-07-04T00:00:00.000Z',
      },
    };
    const source = createR2ExportArtifactSource(
      new FakeBucket({ formatVersion: '1', artifacts }),
      'export-candidates/current.json',
    );

    await expect(source.loadArtifacts()).resolves.toEqual(artifacts);
  });

  it('returns null when no private candidate bundle exists', async () => {
    const source = createR2ExportArtifactSource(
      new FakeBucket(null),
      'export-candidates/current.json',
    );
    await expect(source.loadArtifacts()).resolves.toBeNull();
  });

  it('rejects invalid or traversal candidate keys', () => {
    expect(() => createR2ExportArtifactSource(new FakeBucket(null), '../current.json')).toThrow(
      ExportArtifactSourceError,
    );
    expect(() =>
      createR2ExportArtifactSource(new FakeBucket(null), 'export-candidates/../private.json'),
    ).toThrow(ExportArtifactSourceError);
  });

  it('rejects malformed private bundles', async () => {
    const source = createR2ExportArtifactSource(
      new FakeBucket({ formatVersion: '2', artifacts: [] }),
      'export-candidates/current.json',
    );
    await expect(source.loadArtifacts()).rejects.toMatchObject({
      code: 'invalid_bundle',
    });
  });

  it('fails closed when the object cannot be parsed', async () => {
    const source = createR2ExportArtifactSource(
      new FakeBucket({}, true),
      'export-candidates/current.json',
    );
    await expect(source.loadArtifacts()).rejects.toMatchObject({
      code: 'invalid_bundle',
    });
  });
});
