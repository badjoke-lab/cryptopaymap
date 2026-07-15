import { inspectPhotoImage, PhotoImageInspectionError } from './photo-image-inspection';
import type { PhotoPrivateProcessor, PhotoProcessedDerivative } from './photo-private-processing';

export interface CloudflareImagesTransformOptions {
  width: number;
  height: number;
  fit: 'scale-down';
  metadata: 'none';
}

export interface CloudflareImagesOutputOptions {
  format: 'image/webp';
  quality: number;
  anim: false;
}

export interface CloudflareImagesOutputLike {
  response(): Response;
}

export interface CloudflareImagesInputLike {
  transform(options: CloudflareImagesTransformOptions): CloudflareImagesInputLike;
  output(options: CloudflareImagesOutputOptions): Promise<CloudflareImagesOutputLike>;
}

export interface CloudflareImagesBindingLike {
  input(stream: ReadableStream<Uint8Array>): CloudflareImagesInputLike;
}

interface DerivativePolicy {
  variant: 'display' | 'thumbnail';
  width: number;
  height: number;
  maximumBytes: number;
  quality: number;
}

const derivativePolicies: DerivativePolicy[] = [
  {
    variant: 'display',
    width: 2_048,
    height: 2_048,
    maximumBytes: 5_000_000,
    quality: 85,
  },
  {
    variant: 'thumbnail',
    width: 512,
    height: 512,
    maximumBytes: 1_000_000,
    quality: 82,
  },
];

export class CloudflareImagesPhotoProcessorError extends Error {
  constructor(
    readonly code:
      | 'binding_unavailable'
      | 'transformation_failed'
      | 'invalid_output'
      | 'output_too_large',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CloudflareImagesPhotoProcessorError';
  }
}

function streamFromBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer]).stream() as ReadableStream<Uint8Array>;
}

async function readBoundedResponse(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    const parsed = Number(declaredLength);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximumBytes) {
      throw new CloudflareImagesPhotoProcessorError(
        'output_too_large',
        'Cloudflare Images output exceeds the bounded derivative size.',
      );
    }
  }
  if (!response.ok || response.body === null) {
    throw new CloudflareImagesPhotoProcessorError(
      'transformation_failed',
      'Cloudflare Images did not return a usable private derivative.',
    );
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = result.value;
      total += chunk.byteLength;
      if (total > maximumBytes) {
        throw new CloudflareImagesPhotoProcessorError(
          'output_too_large',
          'Cloudflare Images output exceeds the bounded derivative size.',
        );
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  if (total < 1) {
    throw new CloudflareImagesPhotoProcessorError(
      'invalid_output',
      'Cloudflare Images returned an empty private derivative.',
    );
  }
  const body = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function assertMetadataFreeStillWebp(bytes: Uint8Array): void {
  if (bytes.byteLength < 20 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') {
    throw new CloudflareImagesPhotoProcessorError(
      'invalid_output',
      'Cloudflare Images output is not a valid WebP container.',
    );
  }

  const forbiddenChunks = new Set(['EXIF', 'XMP ', 'ICCP', 'ANIM', 'ANMF']);
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const type = ascii(bytes, offset, 4);
    const size =
      bytes[offset + 4]! |
      (bytes[offset + 5]! << 8) |
      (bytes[offset + 6]! << 16) |
      (bytes[offset + 7]! << 24);
    if (size < 0 || forbiddenChunks.has(type)) {
      throw new CloudflareImagesPhotoProcessorError(
        'invalid_output',
        'Cloudflare Images output retained forbidden metadata or animation.',
      );
    }
    const next = offset + 8 + size + (size % 2);
    if (next <= offset || next > bytes.byteLength) {
      throw new CloudflareImagesPhotoProcessorError(
        'invalid_output',
        'Cloudflare Images output contains a malformed WebP chunk.',
      );
    }
    offset = next;
  }
  if (offset !== bytes.byteLength) {
    throw new CloudflareImagesPhotoProcessorError(
      'invalid_output',
      'Cloudflare Images output contains trailing WebP bytes.',
    );
  }
}

async function transform(
  binding: CloudflareImagesBindingLike,
  source: Uint8Array,
  policy: DerivativePolicy,
): Promise<PhotoProcessedDerivative> {
  let output: CloudflareImagesOutputLike;
  try {
    output = await binding
      .input(streamFromBytes(source))
      .transform({
        width: policy.width,
        height: policy.height,
        fit: 'scale-down',
        metadata: 'none',
      })
      .output({
        format: 'image/webp',
        quality: policy.quality,
        anim: false,
      });
  } catch (error) {
    throw new CloudflareImagesPhotoProcessorError(
      'transformation_failed',
      'Cloudflare Images private transformation failed.',
      { cause: error },
    );
  }

  const response = output.response();
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim();
  if (contentType !== 'image/webp') {
    throw new CloudflareImagesPhotoProcessorError(
      'invalid_output',
      'Cloudflare Images returned an unexpected derivative content type.',
    );
  }
  const body = await readBoundedResponse(response, policy.maximumBytes);
  assertMetadataFreeStillWebp(body);

  let inspected;
  try {
    inspected = inspectPhotoImage(body);
  } catch (error) {
    throw new CloudflareImagesPhotoProcessorError(
      'invalid_output',
      'Cloudflare Images returned an invalid derivative image.',
      { cause: error instanceof PhotoImageInspectionError ? error : undefined },
    );
  }
  if (
    inspected.mimeType !== 'image/webp' ||
    inspected.animated ||
    inspected.width > policy.width ||
    inspected.height > policy.height
  ) {
    throw new CloudflareImagesPhotoProcessorError(
      'invalid_output',
      'Cloudflare Images derivative exceeds its variant boundary.',
    );
  }

  return {
    variant: policy.variant,
    mimeType: 'image/webp',
    body,
    width: inspected.width,
    height: inspected.height,
    metadataStripped: true,
    orientationNormalized: true,
  };
}

export function createCloudflareImagesPhotoPrivateProcessor(
  binding: CloudflareImagesBindingLike,
): PhotoPrivateProcessor {
  if (binding === null || typeof binding !== 'object' || typeof binding.input !== 'function') {
    throw new CloudflareImagesPhotoProcessorError(
      'binding_unavailable',
      'Cloudflare Images binding is unavailable.',
    );
  }

  return {
    async process(command) {
      return Promise.all(
        derivativePolicies.map((policy) => transform(binding, command.source.body, policy)),
      );
    },
  };
}
