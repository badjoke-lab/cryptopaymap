import { describe, expect, it } from 'vitest';
import {
  createCloudflareImagesPhotoPrivateProcessor,
  type CloudflareImagesBindingLike,
  type CloudflareImagesInputLike,
  type CloudflareImagesOutputOptions,
  type CloudflareImagesTransformOptions,
} from '../src/submissions/cloudflare-images-photo-processor';
import type { ValidatedPhotoObject } from '../src/submissions/photo-object-validation';

function uint32Le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function ascii(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}

function webp(width: number, height: number): Uint8Array<ArrayBuffer> {
  const payload = [0, 0, 0, 0, ...uint32Le(width - 1).slice(0, 3), ...uint32Le(height - 1).slice(0, 3)];
  const chunk = [...ascii('VP8X'), ...uint32Le(payload.length), ...payload];
  return Uint8Array.from([
    ...ascii('RIFF'),
    ...uint32Le(4 + chunk.length),
    ...ascii('WEBP'),
    ...chunk,
  ]);
}

class FakeInput implements CloudflareImagesInputLike {
  transformOptions: CloudflareImagesTransformOptions | null = null;
  outputOptions: CloudflareImagesOutputOptions | null = null;

  constructor(private readonly responseBody: Uint8Array<ArrayBuffer>) {}

  transform(options: CloudflareImagesTransformOptions): CloudflareImagesInputLike {
    this.transformOptions = options;
    return this;
  }

  async output(options: CloudflareImagesOutputOptions) {
    this.outputOptions = options;
    return {
      response: () =>
        new Response(this.responseBody, {
          status: 200,
          headers: { 'content-type': 'image/webp' },
        }),
    };
  }
}

class FakeBinding implements CloudflareImagesBindingLike {
  readonly inputs: FakeInput[] = [];

  input(): CloudflareImagesInputLike {
    const index = this.inputs.length;
    const candidate = new FakeInput(index === 0 ? webp(800, 600) : webp(160, 120));
    this.inputs.push(candidate);
    return candidate;
  }
}

const source: ValidatedPhotoObject = {
  quarantineUploadId: '10000000-0000-4000-8000-000000000001',
  privateObjectKey: 'quarantine/photos/v1/10000000-0000-4000-8000-000000000001',
  body: Uint8Array.from([1, 2, 3]),
  mimeType: 'image/png',
  byteSize: 3,
  width: 1_000,
  height: 800,
  contentHash: 'a'.repeat(64),
};

describe('P5-05J Cloudflare Images private photo processor', () => {
  it('creates one bounded metadata-free display and thumbnail WebP', async () => {
    const binding = new FakeBinding();
    const processor = createCloudflareImagesPhotoPrivateProcessor(binding);

    const result = await processor.process({
      source,
      role: 'cover',
      processorVersion: 'cloudflare-images/1',
    });

    expect(result).toEqual([
      expect.objectContaining({
        variant: 'display',
        mimeType: 'image/webp',
        width: 800,
        height: 600,
        metadataStripped: true,
        orientationNormalized: true,
      }),
      expect.objectContaining({
        variant: 'thumbnail',
        mimeType: 'image/webp',
        width: 160,
        height: 120,
        metadataStripped: true,
        orientationNormalized: true,
      }),
    ]);
    expect(binding.inputs.map((input) => input.transformOptions)).toEqual([
      { width: 2_048, height: 2_048, fit: 'scale-down', metadata: 'none' },
      { width: 512, height: 512, fit: 'scale-down', metadata: 'none' },
    ]);
    expect(binding.inputs.map((input) => input.outputOptions)).toEqual([
      { format: 'image/webp', quality: 85, anim: false },
      { format: 'image/webp', quality: 82, anim: false },
    ]);
  });

  it('fails closed for a missing Images binding', () => {
    expect(() => createCloudflareImagesPhotoPrivateProcessor(null as never)).toThrowError(
      /binding is unavailable/,
    );
  });
});
