import { describe, expect, it } from 'vitest';
import { findNonPublicContent, hashPublicArtifact } from '../src/publication/export-boundary';

describe('public export boundary', () => {
  it('runs the complete release-set contract checks', async () => {
    await expect(import('../scripts/check-public-export-boundary')).resolves.toBeDefined();
  });

  it('canonicalizes artifact hashes independently of object key order', async () => {
    await expect(hashPublicArtifact({ beta: 2, alpha: 1 })).resolves.toBe(
      await hashPublicArtifact({ alpha: 1, beta: 2 }),
    );
  });

  it('detects fields outside the public contract recursively', () => {
    expect(findNonPublicContent({ nested: { internalMetadata: 'not publishable' } })).toEqual([
      '$.nested.internalMetadata: field is outside the public contract',
    ]);
  });
});
